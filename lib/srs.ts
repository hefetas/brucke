// Aralıklı tekrar (SM-2 benzeri). Saf fonksiyonlar: veritabanı ya da saat bilmez.
// Tasarım dokümanı §8: öğrenme adımları 10 dk → 1 gün, sonra yorumlama aralığı ease ile çarpılır.

export type CardState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended';
export type Grade = 1 | 2 | 3 | 4; // 1 Tekrar, 2 Zor, 3 İyi, 4 Kolay

export interface SrsCard {
  state: CardState;
  step: number; // öğrenme adımı (0 tabanlı)
  ease: number;
  intervalDays: number;
  dueAt: string; // ISO
  correctCount: number;
  wrongCount: number;
  lapses: number;
  usedInSpeaking: boolean;
  usedInWriting: boolean;
  usageBonusGiven: boolean;
  isLeech: boolean;
}

export const MIN_MS = 60_000;
export const DAY_MS = 86_400_000;

export const LEARNING_STEPS_MIN = [10, 24 * 60]; // 10 dk, 1 gün
export const RELEARN_MIN = 10;
export const AGAIN_LEARN_MIN = 1;
export const START_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const LAPSE_MULTIPLIER = 0.3;
export const HARD_MULTIPLIER = 1.2;
export const EASY_BONUS = 1.3;
export const USAGE_BONUS = 1.15;
export const LEECH_THRESHOLD = 6;
export const EASY_GRADUATE_DAYS = 4;

export function newCard(now: Date = new Date()): SrsCard {
  return {
    state: 'new',
    step: 0,
    ease: START_EASE,
    intervalDays: 0,
    dueAt: now.toISOString(),
    correctCount: 0,
    wrongCount: 0,
    lapses: 0,
    usedInSpeaking: false,
    usedInWriting: false,
    usageBonusGiven: false,
    isLeech: false,
  };
}

const clampEase = (e: number) => Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, e)) * 100) / 100;
// Math.round yarım değerleri yukarı yuvarlar (2.5→3, 7.5→8), dokümandaki örnekle uyumlu.
const roundDays = (d: number) => Math.round(d + 1e-9);
const addMs = (now: Date, ms: number) => new Date(now.getTime() + ms).toISOString();

export interface ReviewResult {
  card: SrsCard;
  isCorrect: boolean;
}

export function nextReview(card: SrsCard, grade: Grade, now: Date = new Date()): ReviewResult {
  const next: SrsCard = { ...card };
  const isCorrect = grade >= 3;
  if (isCorrect) next.correctCount += 1;
  else if (grade === 1) next.wrongCount += 1;

  const state: CardState = card.state === 'suspended' ? 'suspended' : card.state;
  if (state === 'suspended') return { card: next, isCorrect };

  if (state === 'new' || state === 'learning') {
    const lastStep = LEARNING_STEPS_MIN.length - 1;
    const base = state === 'new' ? 0 : card.step;
    if (grade === 1) {
      next.state = 'learning';
      next.step = 0;
      next.dueAt = addMs(now, AGAIN_LEARN_MIN * MIN_MS);
    } else if (grade === 2) {
      next.state = 'learning';
      next.step = base;
      next.dueAt = addMs(now, (LEARNING_STEPS_MIN[Math.min(base, lastStep)] ?? 10) * MIN_MS);
    } else if (grade === 3) {
      if (state === 'new') {
        // İlk "İyi": ilk adımı tamamla, sıradaki adım zamanlanır
        next.state = 'learning';
        next.step = 1;
        next.dueAt = addMs(now, LEARNING_STEPS_MIN[0] * MIN_MS);
      } else if (base >= lastStep) {
        graduate(next, 1, now);
      } else {
        next.state = 'learning';
        next.step = base + 1;
        next.dueAt = addMs(now, LEARNING_STEPS_MIN[base + 1] * MIN_MS);
      }
    } else {
      graduate(next, EASY_GRADUATE_DAYS, now);
      next.ease = clampEase(next.ease + 0.15);
    }
  } else if (state === 'review') {
    const prev = Math.max(1, card.intervalDays);
    if (grade === 1) {
      next.lapses += 1;
      next.ease = clampEase(card.ease - 0.2);
      next.intervalDays = Math.max(1, roundDays(prev * LAPSE_MULTIPLIER));
      next.state = 'relearning';
      next.step = 0;
      next.dueAt = addMs(now, RELEARN_MIN * MIN_MS);
      if (next.lapses >= LEECH_THRESHOLD) next.isLeech = true;
    } else {
      let interval: number;
      if (grade === 2) {
        interval = Math.max(prev + 1, roundDays(prev * HARD_MULTIPLIER));
        next.ease = clampEase(card.ease - 0.15);
      } else if (grade === 3) {
        interval = Math.max(prev + 1, roundDays(prev * card.ease));
      } else {
        interval = Math.max(prev + 1, roundDays(prev * card.ease * EASY_BONUS));
        next.ease = clampEase(card.ease + 0.15);
      }
      if (grade >= 3 && (card.usedInSpeaking || card.usedInWriting) && !card.usageBonusGiven) {
        interval = Math.max(interval, roundDays(interval * USAGE_BONUS));
        next.usageBonusGiven = true;
      }
      next.intervalDays = interval;
      next.dueAt = addMs(now, interval * DAY_MS);
    }
  } else {
    // relearning
    if (grade === 1) {
      next.step = 0;
      next.dueAt = addMs(now, RELEARN_MIN * MIN_MS);
    } else if (grade === 2) {
      next.dueAt = addMs(now, RELEARN_MIN * MIN_MS);
    } else {
      next.state = 'review';
      next.step = 0;
      const interval = Math.max(1, card.intervalDays) + (grade === 4 ? 1 : 0);
      next.intervalDays = interval;
      next.dueAt = addMs(now, interval * DAY_MS);
    }
  }
  return { card: next, isCorrect };
}

function graduate(card: SrsCard, days: number, now: Date) {
  card.state = 'review';
  card.step = 0;
  card.intervalDays = days;
  card.dueAt = addMs(now, days * DAY_MS);
}

/** Bir sonraki tekrara kalan süreyi (dakika) kısa Türkçe etikete çevirir. */
export function formatInterval(minutes: number): string {
  if (minutes < 1) return '<1 dk';
  if (minutes < 60) return `${Math.round(minutes)} dk`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} sa`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} g`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months * 10) / 10} ay`.replace('.', ',');
  return `${Math.round((days / 365) * 10) / 10} yıl`.replace('.', ',');
}

/** Dört düğmenin üstünde gösterilecek etiketler. */
export function previewIntervals(card: SrsCard, now: Date = new Date()): Record<Grade, string> {
  const out = {} as Record<Grade, string>;
  for (const g of [1, 2, 3, 4] as Grade[]) {
    const { card: c } = nextReview(card, g, now);
    const minutes = (new Date(c.dueAt).getTime() - now.getTime()) / MIN_MS;
    // Tekrar düğmesi gözden kaçırılan kartta kalıcı yeni aralığı da gösterir (ör. "10 dk")
    out[g] = formatInterval(minutes);
  }
  return out;
}

/** Cevabın doğruluğu ve süresine göre varsayılan not önerisi (kullanıcı değiştirebilir). */
export function suggestGrade(isCorrect: boolean, responseMs: number): Grade {
  if (!isCorrect) return 1;
  if (responseMs <= 2500) return 4;
  if (responseMs >= 12000) return 2;
  return 3;
}

export function isDue(card: Pick<SrsCard, 'state' | 'dueAt'>, now: Date = new Date()): boolean {
  return card.state !== 'suspended' && new Date(card.dueAt).getTime() <= now.getTime();
}
