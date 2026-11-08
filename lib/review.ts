// Tekrar sekmesi için saf mantık: zorlanılan kartları seçme ve mini alıştırma (çoktan seçmeli) üretme.

export interface CardLite {
  id: string;
  card_type: string;
  front: string;
  back: string;
  lapses: number;
  wrong_count: number;
  correct_count: number;
}

/** Hiç yanlış yapılmamış kart zorlanılan sayılmaz; unutulmuş (lapse) ya da yanlışları doğrularından az olmayan kart sayılır. */
export const isWeakCard = (c: Pick<CardLite, 'lapses' | 'wrong_count' | 'correct_count'>) =>
  c.wrong_count > 0 && (c.lapses > 0 || c.wrong_count >= c.correct_count);

export const weakScore = (c: Pick<CardLite, 'lapses' | 'wrong_count' | 'correct_count'>) => c.lapses * 2 + c.wrong_count - c.correct_count * 0.5;

export const firstLine = (s: string) => s.split('\n')[0].trim();

/** Mini alıştırmaya uygun kart tipleri (karşılıklı kısa yanıtı olanlar). */
export const DRILL_TYPES = ['word_to_meaning', 'meaning_to_word'] as const;

export interface DrillQuestion {
  cardId: string;
  type: string;
  prompt: string;
  answer: string;
  /** Dört seçenek (karışık). Yeterli çeldirici yoksa null: kullanıcı kendini değerlendirir. */
  options: string[] | null;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDrill(weak: CardLite[], pool: CardLite[], count = 8, rng: () => number = Math.random): DrillQuestion[] {
  const picked = [...weak]
    .filter((c) => (DRILL_TYPES as readonly string[]).includes(c.card_type))
    .sort((a, b) => weakScore(b) - weakScore(a))
    .slice(0, count);
  return shuffle(picked, rng).map((c) => {
    const answer = firstLine(c.back);
    const others = [...new Set(pool.filter((p) => p.id !== c.id && p.card_type === c.card_type).map((p) => firstLine(p.back)))].filter((t) => t && t !== answer);
    const distractors = shuffle(others, rng).slice(0, 3);
    return {
      cardId: c.id,
      type: c.card_type,
      prompt: c.front,
      answer,
      options: distractors.length === 3 ? shuffle([answer, ...distractors], rng) : null,
    };
  });
}

export interface WeakStep { key: string; kind: string; slug: string; title: string; best: number; attempts: number }

/** Yol haritasında en az bir kez denenmiş ve en iyi puanı eşiğin altında kalan adımlar (en düşük puan önce). */
export function weakJourneySteps(
  steps: { key: string; kind: string; slug: string; title: string }[],
  scores: Map<string, { best: number; attempts: number }>,
  threshold: number,
  limit = 8,
): WeakStep[] {
  const out: WeakStep[] = [];
  for (const s of steps) {
    const st = scores.get(s.key);
    if (st && st.best < threshold) out.push({ ...s, best: st.best, attempts: st.attempts });
  }
  return out.sort((a, b) => a.best - b.best || b.attempts - a.attempts).slice(0, limit);
}
