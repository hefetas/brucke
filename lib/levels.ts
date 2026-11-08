// CEFR yardımcıları, yerleştirme sınavı değerlendirmesi ve seviye ilerleme kuralları.

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Cefr = (typeof CEFR_LEVELS)[number];

export const SKILLS = ['listening', 'reading', 'speaking', 'writing', 'vocab', 'grammar'] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_LABEL_TR: Record<Skill, string> = {
  listening: 'Dinleme',
  reading: 'Okuma',
  speaking: 'Konuşma',
  writing: 'Yazma',
  vocab: 'Kelime',
  grammar: 'Dilbilgisi',
};

export type SkillLevels = Record<Skill, Cefr>;

export const cefrIndex = (l: Cefr): number => CEFR_LEVELS.indexOf(l);
export const cefrFromIndex = (i: number): Cefr => CEFR_LEVELS[Math.max(0, Math.min(CEFR_LEVELS.length - 1, i))];
export const nextLevel = (l: Cefr): Cefr => cefrFromIndex(cefrIndex(l) + 1);
export const prevLevel = (l: Cefr): Cefr => cefrFromIndex(cefrIndex(l) - 1);
export const minLevel = (a: Cefr, b: Cefr): Cefr => (cefrIndex(a) <= cefrIndex(b) ? a : b);
export const isCefr = (v: unknown): v is Cefr => typeof v === 'string' && (CEFR_LEVELS as readonly string[]).includes(v);

export function allLevels(level: Cefr): SkillLevels {
  return { listening: level, reading: level, speaking: level, writing: level, vocab: level, grammar: level };
}

/** Beceri seviyelerinin genel (ortalama, aşağı yuvarlanmış) seviyesi. */
export function overallLevel(levels: SkillLevels): Cefr {
  const sum = SKILLS.reduce((s, k) => s + cefrIndex(levels[k]), 0);
  return cefrFromIndex(Math.floor(sum / SKILLS.length));
}

// ── Yerleştirme ──────────────────────────────────────────────────────────────

export type PlacementSkill = 'listening' | 'reading' | 'vocab' | 'grammar';
export interface PlacementAnswer {
  skill: PlacementSkill;
  level: Cefr;
  correct: boolean;
}

/**
 * Beceri başına seviye: A1'den başlayıp her seviyede doğruluk ≥ %50 olduğu sürece yukarı çıkar.
 * Soru bulunmayan ya da %50'nin altında kalan ilk seviyede durur (en az A1).
 */
export function estimateSkill(answers: PlacementAnswer[], skill: PlacementSkill): Cefr {
  let reached: Cefr = 'A1';
  for (const level of CEFR_LEVELS) {
    const at = answers.filter((a) => a.skill === skill && a.level === level);
    if (at.length === 0) break;
    const ratio = at.filter((a) => a.correct).length / at.length;
    if (ratio >= 0.5) reached = level;
    else break;
  }
  return reached;
}

/**
 * Konuşma ve yazma ölçülemediği için güvenli tarafta türetilir:
 * konuşma = min(dinleme, kelime), yazma = min(dilbilgisi, kelime).
 */
export function estimatePlacement(answers: PlacementAnswer[]): SkillLevels {
  const listening = estimateSkill(answers, 'listening');
  const reading = estimateSkill(answers, 'reading');
  const vocab = estimateSkill(answers, 'vocab');
  const grammar = estimateSkill(answers, 'grammar');
  return {
    listening,
    reading,
    vocab,
    grammar,
    speaking: minLevel(listening, vocab),
    writing: minLevel(grammar, vocab),
  };
}

// ── Seviye ilerleme ─────────────────────────────────────────────────────────

export interface ProgressEntry {
  score: number; // 0-100
  contentLevel: Cefr;
  occurredAt: string;
}

const byNewest = (a: ProgressEntry, b: ProgressEntry) => b.occurredAt.localeCompare(a.occurredAt);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export interface LevelDecision {
  levelUp: boolean;
  suggestDrop: boolean;
  recentAverage: number;
  recentCount: number;
  nextLevelPassed: number;
}

/**
 * Seviye atlama: o becerideki son 10 etkinliğin ortalaması ≥ 80 VE bir üst seviyede
 * en az 3 etkinlik ≥ 60. Seviye düşürme önerisi: son 10 ortalaması < 50 (en az 5 etkinlik).
 * Karar kullanıcıya sorulur; otomatik uygulanmaz.
 */
export function evaluateLevel(entries: ProgressEntry[], current: Cefr): LevelDecision {
  // Son 10, yalnızca mevcut ve altı seviyedeki etkinliklerden: üst seviyeyi denemek ortalamayı düşürüp atlamayı engellemesin.
  const recent = entries
    .filter((e) => cefrIndex(e.contentLevel) <= cefrIndex(current))
    .sort(byNewest)
    .slice(0, 10);
  const recentAverage = avg(recent.map((e) => e.score));
  const up = nextLevel(current);
  const nextLevelPassed = entries.filter(
    (e) => e.contentLevel === up && up !== current && e.score >= 60,
  ).length;
  return {
    levelUp: current !== 'C2' && recent.length >= 10 && recentAverage >= 80 && nextLevelPassed >= 3,
    suggestDrop: current !== 'A1' && recent.length >= 5 && recentAverage < 50,
    recentAverage: Math.round(recentAverage * 10) / 10,
    recentCount: recent.length,
    nextLevelPassed,
  };
}

/** Zayıf beceriler: son etkinliklerde ortalaması en düşük olanlar (en az 3 kayıt gerekir). */
export function weakSkills(
  bySkill: Partial<Record<Skill, ProgressEntry[]>>,
  threshold = 65,
): Skill[] {
  const rows: { skill: Skill; mean: number }[] = [];
  for (const skill of SKILLS) {
    const list = [...(bySkill[skill] ?? [])].sort(byNewest).slice(0, 10);
    if (list.length >= 3) rows.push({ skill, mean: avg(list.map((e) => e.score)) });
  }
  return rows.filter((r) => r.mean < threshold).sort((a, b) => a.mean - b.mean).map((r) => r.skill);
}

/** Hata hesaplama dışı: XP ile basit rozet seviyesi. */
export function xpLevel(xp: number): { level: number; into: number; needed: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  let needed = 100;
  while (rest >= needed) {
    rest -= needed;
    level += 1;
    needed = 100 + (level - 1) * 50;
  }
  return { level, into: rest, needed };
}
