// Sınav hazırlığı (IELTS / Goethe) için saf mantık: puan→band dönüşümü, hazırlık özeti, sıradaki adım, yazı ön kontrolü.
// Veritabanı veya React bağımlılığı yok; testler bu dosyayı doğrudan çalıştırır.

export type ExamKind = 'ielts' | 'goethe';
export type ExamSection = 'reading' | 'listening' | 'writing' | 'speaking';
export const EXAM_SECTIONS: readonly ExamSection[] = ['listening', 'reading', 'writing', 'speaking'];
export const GOETHE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type GoetheLevel = (typeof GOETHE_LEVELS)[number];

export const EXAM_OF_LANG: Record<string, ExamKind> = { en: 'ielts', de: 'goethe' };

export const SECTION_LABEL: Record<ExamKind, Record<ExamSection, string>> = {
  ielts: { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking' },
  goethe: { listening: 'Hören', reading: 'Lesen', writing: 'Schreiben', speaking: 'Sprechen' },
};
export const SECTION_ICON: Record<ExamSection, string> = { listening: '🎧', reading: '📖', writing: '✍️', speaking: '🎙️' };

// ── Soru tipleri ────────────────────────────────────────────────────────────

export type QType = 'tfng' | 'tf' | 'mcq' | 'fill' | 'match';

export interface ExamQuestion {
  t: QType;
  q: string;
  options?: string[];
  /** tfng/tf/mcq/match: seçenek indeksi; fill: kabul edilen yanıtlar */
  answer: number | string[];
  why: string;
}

export const QTYPE_LABEL: Record<QType, string> = {
  tfng: 'True / False / Not Given',
  tf: 'Richtig / Falsch',
  mcq: 'Çoktan seçmeli',
  fill: 'Boşluk doldurma',
  match: 'Eşleştirme',
};

export const DEFAULT_OPTIONS: Partial<Record<QType, string[]>> = {
  tfng: ['True', 'False', 'Not Given'],
  tf: ['Richtig', 'Falsch'],
};

export const optionsOf = (q: ExamQuestion): string[] => q.options ?? DEFAULT_OPTIONS[q.t] ?? [];

const normAnswer = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim();

/** Soru doğru mu? chosen: seçenek indeksi ya da yazılan metin. */
export function isCorrect(q: ExamQuestion, chosen: number | string | null | undefined): boolean {
  if (chosen === null || chosen === undefined || chosen === '') return false;
  if (q.t === 'fill') {
    const accepted = (q.answer as string[]).map(normAnswer);
    return typeof chosen === 'string' && accepted.includes(normAnswer(chosen));
  }
  return typeof chosen === 'number' && chosen === q.answer;
}

export interface GradeResult {
  raw: number;
  total: number;
  pct: number;
  /** Soru tipi → [doğru, toplam] */
  byType: Record<string, [number, number]>;
  correct: boolean[];
}

export function gradeAnswers(questions: ExamQuestion[], answers: (number | string | null | undefined)[]): GradeResult {
  const byType: Record<string, [number, number]> = {};
  const correct = questions.map((q, i) => isCorrect(q, answers[i]));
  questions.forEach((q, i) => {
    const e = (byType[q.t] ??= [0, 0]);
    e[1] += 1;
    if (correct[i]) e[0] += 1;
  });
  const raw = correct.filter(Boolean).length;
  return { raw, total: questions.length, pct: questions.length ? (raw / questions.length) * 100 : 0, byType, correct };
}

// ── IELTS band dönüşümü (yaygın yayımlanan Academic tablolarına dayalı tahmin; her sınavda biraz değişir) ──

const LISTENING_TABLE: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5],
];
const READING_TABLE: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5],
];

/** 40 soruluk ham puandan band. */
export function bandFromRaw40(section: 'listening' | 'reading', raw40: number): number {
  const table = section === 'listening' ? LISTENING_TABLE : READING_TABLE;
  for (const [min, band] of table) if (raw40 >= min) return band;
  return 2;
}

/** Mini testin yüzdesini 40 soruluk ölçeğe çekip band tahmini verir. */
export const bandFromPct = (section: 'listening' | 'reading', pct: number) => bandFromRaw40(section, Math.round((pct / 100) * 40));

/** 0.25 → 0.5, 0.75 → 1 kuralıyla en yakın yarım banda yuvarlar. */
export const roundBand = (x: number) => Math.round(x * 2) / 2;

export function overallBand(bands: number[]): number | null {
  if (!bands.length) return null;
  return roundBand(bands.reduce((s, b) => s + b, 0) / bands.length);
}

export const BAND_STEPS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9] as const;

// ── Goethe ──────────────────────────────────────────────────────────────────

export const GOETHE_PASS_PCT = 60;

/** Puan yüzdesinden notlandırma (Goethe-Zertifikat B1+: 90+ sehr gut, 80+ gut, 70+ befriedigend, 60+ bestanden). */
export function goetheGrade(pct: number): string {
  if (pct >= 90) return 'sehr gut';
  if (pct >= 80) return 'gut';
  if (pct >= 70) return 'befriedigend';
  if (pct >= GOETHE_PASS_PCT) return 'bestanden';
  return 'nicht bestanden';
}

// ── Öz değerlendirme (yazma/konuşma) ────────────────────────────────────────

export interface RubricOption { value: number; text: string }
export interface RubricCriterion { key: string; name: string; options: RubricOption[] }

/** IELTS: ölçüt bandlarının ortalaması (yarıma yuvarlanır). Goethe: yüzde ortalaması. */
export function selfScore(exam: ExamKind, picks: number[]): { pct: number; band: number | null } {
  if (!picks.length) return { pct: 0, band: null };
  const mean = picks.reduce((s, v) => s + v, 0) / picks.length;
  if (exam === 'ielts') return { pct: Math.round((mean / 9) * 1000) / 10, band: roundBand(mean) };
  return { pct: Math.round(mean * 10) / 10, band: null };
}

// ── Yazı ön kontrolü (otomatik, notlandırma değildir) ───────────────────────

const LINKERS: Record<string, string[]> = {
  en: ['however', 'moreover', 'furthermore', 'in addition', 'for example', 'for instance', 'on the other hand', 'in contrast', 'as a result', 'therefore', 'consequently', 'although', 'while', 'whereas', 'nevertheless', 'in conclusion', 'to conclude', 'overall', 'firstly', 'secondly', 'finally', 'despite', 'because', 'since', 'in particular'],
  de: ['außerdem', 'zudem', 'jedoch', 'allerdings', 'deshalb', 'daher', 'trotzdem', 'obwohl', 'weil', 'denn', 'dass', 'einerseits', 'andererseits', 'zum beispiel', 'erstens', 'zweitens', 'schließlich', 'abschließend', 'zusammenfassend', 'dennoch', 'darüber hinaus', 'meiner meinung nach', 'deswegen', 'während', 'sowohl'],
};
const CONCLUSION: Record<string, RegExp> = {
  en: /^(in conclusion|to conclude|to sum up|overall|in summary|all in all)\b/i,
  de: /^(abschließend|zusammenfassend|insgesamt|zum schluss|fazit|alles in allem)\b/i,
};
const STOP: Record<string, string[]> = {
  en: ['the', 'and', 'that', 'this', 'with', 'for', 'are', 'was', 'were', 'have', 'has', 'not', 'but', 'can', 'will', 'from', 'they', 'their', 'there', 'which', 'would', 'been', 'more', 'also', 'than', 'such', 'these', 'those', 'people'],
  de: ['und', 'der', 'die', 'das', 'ich', 'ist', 'nicht', 'ein', 'eine', 'mit', 'für', 'auf', 'dass', 'den', 'dem', 'zu', 'von', 'sie', 'wir', 'sind', 'auch', 'aber', 'wenn', 'sich', 'haben'],
};

export interface WritingCheck {
  words: number;
  paragraphs: number;
  sentences: number;
  avgSentence: number;
  linkers: string[];
  repeated: { word: string; count: number }[];
  hasConclusion: boolean;
  notes: string[];
}

export const countWords = (text: string) => (text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

export function analyzeWriting(text: string, opts: { lang: string; minWords: number; wantParagraphs?: number }): WritingCheck {
  const lang = opts.lang === 'de' ? 'de' : 'en';
  const words = countWords(text);
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const sentences = text.split(/[.!?]+(?:\s|$)/).map((s) => s.trim()).filter(Boolean);
  const lower = text.toLowerCase();
  const linkers = LINKERS[lang].filter((l) => new RegExp(`(^|[^\\p{L}])${l}(?=$|[^\\p{L}])`, 'u').test(lower));
  const freq = new Map<string, number>();
  for (const w of lower.match(/\p{L}{4,}/gu) ?? []) if (!STOP[lang].includes(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const repeated = [...freq.entries()].filter(([, c]) => c >= 4).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([word, count]) => ({ word, count }));
  const hasConclusion = paras.length > 1 && CONCLUSION[lang].test(paras[paras.length - 1]);
  const avgSentence = sentences.length ? Math.round((words / sentences.length) * 10) / 10 : 0;
  const notes: string[] = [];
  if (words < opts.minWords) notes.push(`Kelime sayısı hedefin altında (${words}/${opts.minWords}). Eksik kelime, doğrudan puan kaybıdır.`);
  else notes.push(`Kelime sayısı yeterli (${words}).`);
  if (opts.wantParagraphs && paras.length < opts.wantParagraphs) notes.push(`En az ${opts.wantParagraphs} paragraf bekleniyor, ${paras.length} var.`);
  if (linkers.length < Math.min(4, Math.ceil(opts.minWords / 60))) notes.push('Bağlaç/geçiş ifadesi az; fikirleri birbirine bağla (bu, tutarlılık puanını etkiler).');
  if (avgSentence && avgSentence < 9) notes.push('Cümleler çok kısa; birkaçını bağlaçla birleştirerek karmaşık yapı göster.');
  if (avgSentence > 28) notes.push('Cümleler çok uzun; okunabilirlik için böl.');
  if (repeated.length) notes.push(`Çok tekrar eden kelimeler: ${repeated.map((r) => `${r.word} (${r.count})`).join(', ')} → eş anlamlı kullan.`);
  if (opts.wantParagraphs && opts.wantParagraphs >= 4 && !hasConclusion) notes.push('Son paragraf açık bir sonuç cümlesiyle başlamıyor (ör. "In conclusion" / "Abschließend").');
  return { words, paragraphs: paras.length, sentences: sentences.length, avgSentence, linkers, repeated, hasConclusion, notes };
}

// ── Deneme kayıtları ve hazırlık özeti ──────────────────────────────────────

export interface AttemptLite {
  section: ExamSection;
  item_id: string;
  level: string | null;
  score_pct: number;
  band: number | null;
  detail: { types?: Record<string, [number, number]> } | null;
  created_at: string;
}

export interface SectionSummary {
  section: ExamSection;
  attempts: number;
  /** Son 3 denemenin ortalaması */
  pct: number | null;
  band: number | null;
  doneIds: string[];
}

const RECENT = 3;

export function summarize(exam: ExamKind, attempts: AttemptLite[], level?: string | null): Record<ExamSection, SectionSummary> {
  const out = {} as Record<ExamSection, SectionSummary>;
  for (const section of EXAM_SECTIONS) {
    const rows = attempts
      .filter((a) => a.section === section && (exam === 'ielts' || !level || a.level === level))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const recent = rows.slice(0, RECENT);
    const pct = recent.length ? recent.reduce((s, a) => s + Number(a.score_pct), 0) / recent.length : null;
    let band: number | null = null;
    if (exam === 'ielts' && recent.length) {
      if (section === 'listening' || section === 'reading') band = bandFromPct(section, pct as number);
      else {
        const bs = recent.map((a) => a.band).filter((b): b is number => b !== null && b !== undefined);
        band = bs.length ? roundBand(bs.reduce((s, b) => s + Number(b), 0) / bs.length) : null;
      }
    }
    out[section] = { section, attempts: rows.length, pct, band, doneIds: [...new Set(rows.map((a) => a.item_id))] };
  }
  return out;
}

/** IELTS: dört becerinin tahmini genel bandı (hepsi denenmediyse null). */
export function estimatedOverall(sum: Record<ExamSection, SectionSummary>): number | null {
  const bands = EXAM_SECTIONS.map((s) => sum[s].band);
  if (bands.some((b) => b === null)) return null;
  return overallBand(bands as number[]);
}

/** Goethe: her modül ≥ %60 mı? */
export function goethePassState(sum: Record<ExamSection, SectionSummary>): { passed: ExamSection[]; failing: ExamSection[]; untried: ExamSection[] } {
  const passed: ExamSection[] = [];
  const failing: ExamSection[] = [];
  const untried: ExamSection[] = [];
  for (const s of EXAM_SECTIONS) {
    const p = sum[s].pct;
    if (p === null) untried.push(s);
    else if (p >= GOETHE_PASS_PCT) passed.push(s);
    else failing.push(s);
  }
  return { passed, failing, untried };
}

/** Okuma/dinleme denemelerinden soru tipi doğruluğu (en zayıf başta, en az 3 soru görülmüş tipler). */
export function typeAccuracy(attempts: AttemptLite[]): { type: string; correct: number; total: number; pct: number }[] {
  const acc: Record<string, [number, number]> = {};
  for (const a of attempts) {
    for (const [t, [c, n]] of Object.entries(a.detail?.types ?? {})) {
      const e = (acc[t] ??= [0, 0]);
      e[0] += c;
      e[1] += n;
    }
  }
  return Object.entries(acc)
    .filter(([, [, n]]) => n >= 3)
    .map(([type, [correct, total]]) => ({ type, correct, total, pct: (correct / total) * 100 }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);
}

export interface ItemRef { id: string; section: ExamSection; title: string; level?: string }

export interface NextExamStep {
  section: ExamSection;
  item: ItemRef | null;
  reason: string;
}

/**
 * Sıradaki adım: önce hiç denenmemiş beceri; sonra hedefe en uzak beceri (IELTS: band farkı, Goethe: %60'a uzaklık).
 * Seçilen beceride yapılmamış ilk görev; hepsi yapıldıysa en düşük puanlı görev tekrar önerilir.
 */
export function nextStep(
  exam: ExamKind,
  sum: Record<ExamSection, SectionSummary>,
  items: ItemRef[],
  attempts: AttemptLite[],
  target: number | null,
): NextExamStep | null {
  const available = EXAM_SECTIONS.filter((s) => items.some((i) => i.section === s));
  if (!available.length) return null;
  const untried = available.find((s) => sum[s].attempts === 0);
  let section: ExamSection;
  let reason: string;
  if (untried) {
    section = untried;
    reason = `${SECTION_LABEL[exam][untried]} henüz denenmedi; seviyeni ölçmek için başla.`;
  } else {
    const gap = (s: ExamSection) => (exam === 'ielts' ? (target ?? 7) - (sum[s].band ?? 0) : GOETHE_PASS_PCT - (sum[s].pct ?? 0));
    section = [...available].sort((a, b) => gap(b) - gap(a))[0];
    reason =
      exam === 'ielts'
        ? `En zayıf beceri: ${SECTION_LABEL[exam][section]} (tahmini band ${sum[section].band}).`
        : `En düşük modül: ${SECTION_LABEL[exam][section]} (%${Math.round(sum[section].pct ?? 0)}).`;
  }
  const pool = items.filter((i) => i.section === section);
  const done = new Set(sum[section].doneIds);
  const fresh = pool.find((i) => !done.has(i.id));
  if (fresh) return { section, item: fresh, reason };
  const latest = new Map<string, number>();
  for (const a of [...attempts].sort((x, y) => x.created_at.localeCompare(y.created_at))) if (a.section === section) latest.set(a.item_id, Number(a.score_pct));
  const worst = [...pool].sort((a, b) => (latest.get(a.id) ?? 0) - (latest.get(b.id) ?? 0))[0];
  return { section, item: worst ?? null, reason: `${reason} Hepsini çözdün; en düşük puanlıyı tekrar dene.` };
}

// ── Çalışma planı ───────────────────────────────────────────────────────────

export function daysUntil(date: string | null, today: string): number | null {
  if (!date) return null;
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

export interface WeeklyPlan { weeks: number | null; perWeek: Record<ExamSection, number>; vocab: number; focus: ExamSection | null }

/** Haftalık görev sayısı: her beceri 2; en zayıf beceriye +1; sınava ≤ 4 hafta kalmışsa deneme sıklığı artar. */
export function weeklyPlan(days: number | null, weakest: ExamSection | null): WeeklyPlan {
  const weeks = days === null ? null : Math.max(0, Math.ceil(days / 7));
  const base = weeks !== null && weeks <= 4 ? 3 : 2;
  const perWeek = { listening: base, reading: base, writing: base, speaking: base } as Record<ExamSection, number>;
  if (weakest) perWeek[weakest] += 1;
  return { weeks, perWeek, vocab: weeks !== null && weeks <= 4 ? 40 : 25, focus: weakest };
}
