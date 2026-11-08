// Yol haritası motoru: seçilen seviye aralığını sıralı adımlara çevirir ve "sıradaki adım"ı belirler.
// Saf fonksiyonlardır (veritabanına dokunmaz); veri okuma lib/journey-data.ts içindedir.

import { CEFR_LEVELS, cefrIndex, type Cefr } from './levels.ts';

export type StepKind = 'grammar' | 'listening' | 'reading' | 'speaking' | 'writing';

/** Yolculukta seçilebilen seviyeler (C2 için içerik hedeflenmiyor). */
export const JOURNEY_LEVELS: readonly Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

/** Bir adımın "iyi anlaşıldı" sayılması için en iyi puan; altındaysa en çok MAX_RETRIES kez tekrar önerilir. */
export const MASTERY_SCORE = 65;
export const MAX_RETRIES = 2;
/** Bu kadar kart birikmişse sıradaki adım önce tekrar olur. */
export const REVIEW_THRESHOLD = 15;

/** Türkiye'deki öğrenci için kaba süre tahminleri (dakika). */
export const STEP_MINUTES: Record<StepKind, number> = { grammar: 12, listening: 10, reading: 12, speaking: 8, writing: 15 };

const KIND_ORDER: StepKind[] = ['grammar', 'listening', 'reading', 'speaking', 'writing'];

export interface CatalogItem {
  kind: StepKind;
  slug: string;
  title: string;
  level: Cefr;
  /** Aynı seviyede ve türde sıralama (dilbilgisinde order_index) */
  order: number;
}

export interface JourneyStep extends CatalogItem {
  /** Aralıktaki seviye sırası (0'dan) */
  stage: number;
  /** Tüm yolculuktaki sıra (0'dan) */
  index: number;
  key: string;
}

export const stepKey = (kind: string, slug: string) => `${kind}:${slug}`;

/** Başlangıç ≤ hedef olacak şekilde düzeltir ve yolculuk seviyeleriyle sınırlar. */
export function normalizeRange(start: Cefr, target: Cefr): { start: Cefr; target: Cefr } {
  const clamp = (l: Cefr) => (JOURNEY_LEVELS.includes(l) ? l : l === 'C2' ? 'C1' : 'A1');
  let s = clamp(start);
  let t = clamp(target);
  if (cefrIndex(s) > cefrIndex(t)) [s, t] = [t, s];
  return { start: s, target: t };
}

export function levelsInRange(start: Cefr, target: Cefr): Cefr[] {
  const { start: s, target: t } = normalizeRange(start, target);
  return CEFR_LEVELS.slice(cefrIndex(s), cefrIndex(t) + 1);
}

/**
 * Her seviye için adımları, türler yolculuk boyunca eşit dağılacak biçimde sıralar:
 * 6 dilbilgisi + 1 dinleme varsa dinleme ortaya düşer, sona yığılmaz.
 */
export function buildJourney(catalog: CatalogItem[], start: Cefr, target: Cefr): JourneyStep[] {
  const out: JourneyStep[] = [];
  levelsInRange(start, target).forEach((level, stage) => {
    const entries: { item: CatalogItem; pos: number; kindRank: number }[] = [];
    for (const [kindRank, kind] of KIND_ORDER.entries()) {
      const list = catalog
        .filter((c) => c.kind === kind && c.level === level)
        .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
      list.forEach((item, i) => entries.push({ item, pos: (i + 0.5) / list.length, kindRank }));
    }
    entries.sort((a, b) => a.pos - b.pos || a.kindRank - b.kindRank || a.item.slug.localeCompare(b.item.slug));
    for (const e of entries) out.push({ ...e.item, stage, index: 0, key: stepKey(e.item.kind, e.item.slug) });
  });
  out.forEach((s, i) => (s.index = i));
  return out;
}

export interface AttemptStat {
  best: number;
  attempts: number;
}

export interface StageInfo {
  level: Cefr;
  stage: number;
  steps: JourneyStep[];
  attempted: number;
  total: number;
  /** Yapılan adımların ortalama en iyi puanı (hiç yapılmadıysa null) */
  average: number | null;
  /** İçerik yoksa true: aralığa dahil ama bu seviyede henüz adım yok */
  empty: boolean;
  complete: boolean;
}

export type NextAction =
  | { type: 'review'; due: number }
  | { type: 'step'; step: JourneyStep; reason: 'new' | 'retry'; previousScore?: number }
  | { type: 'no-content'; level: Cefr }
  | { type: 'finished' };

export interface JourneyState {
  stages: StageInfo[];
  attempted: number;
  total: number;
  percent: number;
  remainingMinutes: number;
  next: NextAction;
  /** İçeriği olmayan seviyeler */
  gaps: Cefr[];
}

export function journeyState(
  steps: JourneyStep[],
  stats: Map<string, AttemptStat>,
  start: Cefr,
  target: Cefr,
  dueCards = 0,
): JourneyState {
  const levels = levelsInRange(start, target);
  const stages: StageInfo[] = levels.map((level, stage) => {
    const own = steps.filter((s) => s.stage === stage);
    const done = own.filter((s) => stats.has(s.key));
    const scores = done.map((s) => (stats.get(s.key) as AttemptStat).best);
    return {
      level,
      stage,
      steps: own,
      attempted: done.length,
      total: own.length,
      average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      empty: own.length === 0,
      complete: own.length > 0 && done.length === own.length,
    };
  });

  const attempted = stages.reduce((s, st) => s + st.attempted, 0);
  const total = stages.reduce((s, st) => s + st.total, 0);
  const remainingMinutes = steps.filter((s) => !stats.has(s.key)).reduce((m, s) => m + STEP_MINUTES[s.kind], 0);
  const gaps = stages.filter((s) => s.empty).map((s) => s.level);

  const next = pickNext(stages, stats, dueCards);
  return {
    stages,
    attempted,
    total,
    percent: total ? Math.round((attempted / total) * 100) : 0,
    remainingMinutes,
    next,
    gaps,
  };
}

function pickNext(stages: StageInfo[], stats: Map<string, AttemptStat>, dueCards: number): NextAction {
  if (dueCards >= REVIEW_THRESHOLD) return { type: 'review', due: dueCards };
  for (const st of stages) {
    if (st.empty) {
      // Boş seviyeyi atlayıp sonrakine geçme: kullanıcıya dürüstçe söylenir. Sonraki seviyelerde iş varsa onlar önerilir.
      const later = stages.slice(st.stage + 1).some((s) => !s.empty && !s.complete);
      if (!later) return { type: 'no-content', level: st.level };
      continue;
    }
    const fresh = st.steps.find((s) => !stats.has(s.key));
    if (fresh) return { type: 'step', step: fresh, reason: 'new' };
    // Hepsi yapıldı: zayıf kalanı (en düşük puanlı) bir kez daha dene, sonra seviyeyi geç.
    const weak = st.steps
      .map((s) => ({ s, st: stats.get(s.key) as AttemptStat }))
      .filter((x) => x.st.best < MASTERY_SCORE && x.st.attempts <= MAX_RETRIES)
      .sort((a, b) => a.st.best - b.st.best || a.s.index - b.s.index)[0];
    if (weak) return { type: 'step', step: weak.s, reason: 'retry', previousScore: Math.round(weak.st.best) };
  }
  return { type: 'finished' };
}

/** user_progress satırlarından adım başına en iyi puan ve deneme sayısı. */
export function attemptStats(
  rows: { content_type: string | null; content_slug: string | null; score: number; occurred_at: string }[],
  since?: string | null,
): Map<string, AttemptStat> {
  const out = new Map<string, AttemptStat>();
  for (const r of rows) {
    if (!r.content_type || !r.content_slug) continue;
    if (since && r.occurred_at < since) continue;
    const key = stepKey(r.content_type, r.content_slug);
    const cur = out.get(key);
    const score = Number(r.score);
    if (cur) {
      cur.best = Math.max(cur.best, score);
      cur.attempts += 1;
    } else out.set(key, { best: score, attempts: 1 });
  }
  return out;
}

export const KIND_LABEL: Record<StepKind, string> = {
  grammar: 'Dilbilgisi',
  listening: 'Dinleme',
  reading: 'Okuma',
  speaking: 'Konuşma',
  writing: 'Yazma',
};
export const KIND_ICON: Record<StepKind, string> = { grammar: '🧩', listening: '🎧', reading: '📖', speaking: '🎙️', writing: '✍️' };
export const KIND_PATH: Record<StepKind, string> = {
  grammar: 'grammar',
  listening: 'listen',
  reading: 'read',
  speaking: 'speak',
  writing: 'write',
};

/** Adımın sayfa adresi; ?j=1 bitince yol haritasına dönmeyi sağlar. */
export const stepHref = (s: Pick<JourneyStep, 'kind' | 'slug'>) => `/${KIND_PATH[s.kind]}/${s.slug}?j=1`;

export const LEVEL_BLURB_TR: Record<Cefr, string> = {
  A1: 'Başlangıç: kendini tanıtma, günlük temel cümleler',
  A2: 'Temel: basit konuşmalar, geçmiş ve gelecek, günlük işler',
  B1: 'Orta: bağımsız iletişim, görüş bildirme, olay anlatma',
  B2: 'Orta üstü: akıcı konuşma, soyut konular, kompleks metinler',
  C1: 'İleri: neredeyse doğal akıcılık, ince anlam farkları, akademik/iş dili',
  C2: 'Uzman',
};

export const formatMinutes = (m: number) => (m >= 90 ? `${Math.round(m / 60)} saat` : `${m} dk`);
