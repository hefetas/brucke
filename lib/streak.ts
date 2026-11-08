// Seri (streak) hesabı: saf fonksiyon. Veritabanı satırlarını alır, yazılacak satırları döndürür.

import { addDays } from './dates.ts';

export interface StreakRow {
  activity_date: string;
  minutes_studied: number;
  lessons_completed: number;
  cards_reviewed: number;
  goal_met: boolean;
  streak_length: number;
  freeze_used: boolean;
  xp_earned: number;
}

export interface StreakAdd {
  minutes?: number;
  cards?: number;
  lessons?: number;
  xp?: number;
}

export interface StreakResult {
  today: StreakRow;
  /** Dünü kurtarmak için yazılacak "dondurma" satırı */
  freeze: StreakRow | null;
  freezeAvailable: boolean;
}

const blank = (date: string): StreakRow => ({
  activity_date: date,
  minutes_studied: 0,
  lessons_completed: 0,
  cards_reviewed: 0,
  goal_met: false,
  streak_length: 0,
  freeze_used: false,
  xp_earned: 0,
});

/**
 * Bugünün satırını günceller. Hedef: bir ders tamamlamak ya da günlük dakikaya ulaşmak.
 * Tek günlük boşluk, son 7 günde dondurma kullanılmadıysa seriyi bozmaz.
 * `rows`: bugünden en az 8 gün öncesine kadar olan satırlar.
 */
export function computeStreak(rows: StreakRow[], today: string, dailyMinutes: number, add: StreakAdd): StreakResult {
  const get = (d: string) => rows.find((r) => r.activity_date === d);
  const cur = get(today) ?? blank(today);
  const minutes = Number(cur.minutes_studied) + (add.minutes ?? 0);
  const lessons = cur.lessons_completed + (add.lessons ?? 0);
  const goalMet = lessons > 0 || minutes >= dailyMinutes;

  const yesterday = addDays(today, -1);
  const prev = get(yesterday);
  const carries = (r: StreakRow | undefined) => Boolean(r && (r.goal_met || r.freeze_used));
  let base = carries(prev) ? (prev as StreakRow).streak_length : 0;

  let freeze: StreakRow | null = null;
  const freezeUsedRecently = rows.some((r) => r.freeze_used && r.activity_date >= addDays(today, -7));
  if (goalMet && !carries(prev)) {
    const dayBefore = get(addDays(today, -2));
    if (dayBefore && dayBefore.goal_met && !freezeUsedRecently) {
      freeze = { ...(prev ?? blank(yesterday)), activity_date: yesterday, freeze_used: true, goal_met: false, streak_length: dayBefore.streak_length };
      base = dayBefore.streak_length;
    }
  }

  const streak_length = goalMet ? (cur.goal_met ? cur.streak_length : base + 1) : 0;
  const today_: StreakRow = {
    ...cur,
    minutes_studied: Math.round(minutes * 10) / 10,
    lessons_completed: lessons,
    cards_reviewed: cur.cards_reviewed + (add.cards ?? 0),
    xp_earned: cur.xp_earned + (add.xp ?? 0),
    goal_met: goalMet,
    streak_length,
  };
  return { today: today_, freeze, freezeAvailable: !freeze && !freezeUsedRecently };
}
