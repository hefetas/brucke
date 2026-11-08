// Günlük ders planı: süreye, haftanın gününe, zayıf becerilere ve bekleyen tekrar sayısına göre bloklar.
// İçerik seçimi (pickContent) planlamadan ayrıdır; plan yalnızca "ne türde, ne kadar" der.

import type { Cefr, Skill } from './levels.ts';

export type BlockType = 'listening' | 'reading' | 'grammar' | 'speaking' | 'writing' | 'review' | 'real_world' | 'free';
export type PlanMinutes = 10 | 20 | 40 | 60;

export interface PlanBlock {
  step: 1 | 2 | 3 | 4 | 5;
  type: BlockType;
  seconds: number;
  title: string;
}

export const PLAN_MINUTES: readonly PlanMinutes[] = [10, 20, 40, 60];

const TITLE: Record<BlockType, string> = {
  listening: 'Dinleme',
  reading: 'Okuma',
  grammar: 'Dilbilgisi',
  speaking: 'Konuşma görevi',
  writing: 'Yazma görevi',
  review: 'Kart tekrarı',
  real_world: 'Gerçek hayat görevi',
  free: 'Serbest pratik',
};

const STEP: Record<BlockType, PlanBlock['step']> = {
  listening: 1,
  reading: 1,
  grammar: 2,
  review: 3,
  speaking: 4,
  writing: 4,
  real_world: 4,
  free: 5,
};

export interface PlanInput {
  minutes: PlanMinutes;
  /** 0 = Pazar … 6 = Cumartesi (Date.getDay) */
  weekday: number;
  weakSkills?: Skill[];
  dueCount?: number;
}

const block = (type: BlockType, seconds: number): PlanBlock => ({
  step: STEP[type],
  type,
  seconds,
  title: TITLE[type],
});

/** Pzt-Çar-Cum: dinleme + konuşma; Sal-Per-Cmt: okuma + yazma; Pazar: gerçek hayat görevi. */
export function dayFocus(weekday: number): 'listen-speak' | 'read-write' | 'real-world' {
  if (weekday === 0) return 'real-world';
  return weekday % 2 === 1 ? 'listen-speak' : 'read-write';
}

export function buildPlan(input: PlanInput): PlanBlock[] {
  const { minutes, weekday } = input;
  const weak = input.weakSkills ?? [];
  const focus = dayFocus(weekday);

  let input1: BlockType = focus === 'listen-speak' ? 'listening' : 'reading';
  let output: BlockType = focus === 'listen-speak' ? 'speaking' : focus === 'read-write' ? 'writing' : 'real_world';

  // Zayıf beceri zorlaması: en zayıf beceri bugünün blokları arasında değilse yerini alır.
  const top = weak[0];
  if (top === 'listening' || top === 'reading') input1 = top;
  if (top === 'speaking' || top === 'writing') output = top;

  const second: BlockType = input1 === 'listening' ? 'reading' : 'listening';
  const secondOut: BlockType = output === 'speaking' ? 'writing' : 'speaking';

  let blocks: PlanBlock[];
  switch (minutes) {
    case 10:
      blocks = [block(input1, 240), block('review', 240), block(output, 120)];
      break;
    case 20:
      blocks = [block(input1, 360), block('grammar', 180), block('review', 300), block(output, 360)];
      break;
    case 40:
      blocks = [
        block(input1, 480), block(second, 480), block('grammar', 300),
        block('review', 480), block(output, 360), block(secondOut, 300),
      ];
      break;
    default:
      blocks = [
        block(input1, 600), block(second, 600), block('grammar', 360),
        block('review', 600), block(output, 600), block(secondOut, 480), block('free', 360),
      ];
  }
  if ((input.dueCount ?? 0) > 40) blocks = shiftToReview(blocks, minutes === 10 ? 60 : 120);
  return blocks.sort(stableByStep);
}

/** Çok sayıda bekleyen kart varsa en uzun yeni-içerik bloğundan süre alıp tekrara aktarır. */
function shiftToReview(blocks: PlanBlock[], seconds: number): PlanBlock[] {
  const out = blocks.map((b) => ({ ...b }));
  const review = out.find((b) => b.type === 'review');
  if (!review) return out;
  const donor = out
    .filter((b) => b.type !== 'review' && b.seconds - seconds >= 60)
    .sort((a, b) => b.seconds - a.seconds)[0];
  if (!donor) return out;
  donor.seconds -= seconds;
  review.seconds += seconds;
  return out;
}

function stableByStep(a: PlanBlock, b: PlanBlock): number {
  return a.step - b.step;
}

export const planSeconds = (plan: PlanBlock[]) => plan.reduce((s, b) => s + b.seconds, 0);

// ── İçerik seçimi ───────────────────────────────────────────────────────────

export interface Pickable {
  slug: string;
  cefrLevel: Cefr;
  topics: string[];
}

/**
 * Önce yapılmamış olanlar, sonra seviyeye (tam eşleşme, sonra bir alt/üst), sonra ilgi alanına göre.
 * Hiç uygun içerik yoksa en eski yapılan tekrar önerilir.
 */
export function pickContent<T extends Pickable>(
  items: T[],
  opts: { level: Cefr; interests: string[]; doneSlugs: string[] },
  levelIndex: (l: Cefr) => number,
): T | undefined {
  if (items.length === 0) return undefined;
  const done = new Set(opts.doneSlugs);
  const interests = new Set(opts.interests.map((s) => s.toLowerCase()));
  const target = levelIndex(opts.level);
  const score = (it: T) => {
    const levelPenalty = Math.abs(levelIndex(it.cefrLevel) - target) * 10;
    const interestBonus = it.topics.some((t) => interests.has(t.toLowerCase())) ? -4 : 0;
    const donePenalty = done.has(it.slug) ? 100 : 0;
    return levelPenalty + interestBonus + donePenalty;
  };
  return [...items].sort((a, b) => score(a) - score(b) || a.slug.localeCompare(b.slug))[0];
}
