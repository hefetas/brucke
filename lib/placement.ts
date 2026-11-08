import en from '../content/placement.en.json';
import de from '../content/placement.de.json';
import type { Cefr, PlacementSkill } from './levels.ts';

export interface PlacementItem {
  skill: PlacementSkill;
  level: Cefr;
  prompt: string;
  /** Dinleme sorularında sesli okunacak metin */
  audio_text?: string;
  /** Okuma sorularındaki kısa metin */
  passage?: string;
  options: string[];
  answer: number;
}

export const PLACEMENT: Record<string, PlacementItem[]> = {
  en: en as PlacementItem[],
  de: de as PlacementItem[],
};

const SKILL_ORDER: PlacementSkill[] = ['vocab', 'grammar', 'reading', 'listening'];

/** Seviye sırasına göre, beceriler iç içe geçmiş soru kuyruğu. */
export function buildQueue(items: PlacementItem[], levelIndex: (l: Cefr) => number): PlacementItem[] {
  const by = SKILL_ORDER.map((s) =>
    items.filter((i) => i.skill === s).sort((a, b) => levelIndex(a.level) - levelIndex(b.level)),
  );
  const out: PlacementItem[] = [];
  const max = Math.max(0, ...by.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const list of by) if (list[i]) out.push(list[i]);
  return out;
}
