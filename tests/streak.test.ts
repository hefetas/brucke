import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStreak, type StreakRow } from '../lib/streak.ts';
import { addDays, localDate, weekdayOf } from '../lib/dates.ts';

const TODAY = '2026-03-10';
const row = (date: string, p: Partial<StreakRow> = {}): StreakRow => ({
  activity_date: date, minutes_studied: 0, lessons_completed: 0, cards_reviewed: 0,
  goal_met: false, streak_length: 0, freeze_used: false, xp_earned: 0, ...p,
});
const met = (date: string, len: number) => row(date, { goal_met: true, streak_length: len, lessons_completed: 1, minutes_studied: 20 });

test('ilk gün: ders tamamlanınca seri 1', () => {
  const r = computeStreak([], TODAY, 20, { lessons: 1, xp: 30 });
  assert.equal(r.today.streak_length, 1);
  assert.equal(r.today.goal_met, true);
  assert.equal(r.today.xp_earned, 30);
  assert.equal(r.freeze, null);
});

test('ardışık gün: dünkü seri üstüne eklenir', () => {
  const r = computeStreak([met(addDays(TODAY, -1), 3)], TODAY, 20, { lessons: 1 });
  assert.equal(r.today.streak_length, 4);
});

test('hedef dolmadıkça seri yazılmaz, dakikalar birikir; hedef dolunca bir kez artar', () => {
  const y = met(addDays(TODAY, -1), 3);
  let r = computeStreak([y], TODAY, 20, { minutes: 8, cards: 10 });
  assert.equal(r.today.goal_met, false);
  assert.equal(r.today.streak_length, 0);
  r = computeStreak([y, r.today], TODAY, 20, { minutes: 14, cards: 5 });
  assert.equal(r.today.goal_met, true);
  assert.equal(r.today.minutes_studied, 22);
  assert.equal(r.today.cards_reviewed, 15);
  assert.equal(r.today.streak_length, 4);
  const again = computeStreak([y, r.today], TODAY, 20, { minutes: 5 });
  assert.equal(again.today.streak_length, 4, 'çift sayılmamalı');
});

test('tek günlük boşluk dondurma ile kurtarılır', () => {
  const rows = [met(addDays(TODAY, -2), 5)];
  const r = computeStreak(rows, TODAY, 20, { lessons: 1 });
  assert.equal(r.today.streak_length, 6);
  assert.ok(r.freeze);
  assert.equal(r.freeze?.activity_date, addDays(TODAY, -1));
  assert.equal(r.freeze?.freeze_used, true);
  assert.equal(r.freeze?.streak_length, 5);
  assert.equal(r.freezeAvailable, false);
});

test('dün biraz çalışıp hedefi kaçırmak da dondurmayla korunur, dünkü dakikalar silinmez', () => {
  const rows = [met(addDays(TODAY, -2), 2), row(addDays(TODAY, -1), { minutes_studied: 7, cards_reviewed: 12 })];
  const r = computeStreak(rows, TODAY, 20, { lessons: 1 });
  assert.equal(r.today.streak_length, 3);
  assert.equal(r.freeze?.minutes_studied, 7);
  assert.equal(r.freeze?.cards_reviewed, 12);
});

test('son 7 günde dondurma kullanıldıysa seri sıfırdan başlar', () => {
  const rows = [
    row(addDays(TODAY, -6), { freeze_used: true, streak_length: 2 }),
    met(addDays(TODAY, -2), 5),
  ];
  const r = computeStreak(rows, TODAY, 20, { lessons: 1 });
  assert.equal(r.today.streak_length, 1);
  assert.equal(r.freeze, null);
});

test('iki gün boşluk seriyi bozar', () => {
  const r = computeStreak([met(addDays(TODAY, -3), 9)], TODAY, 20, { lessons: 1 });
  assert.equal(r.today.streak_length, 1);
  assert.equal(r.freeze, null);
});

test('dondurma sonraki gün dünün serisini taşır', () => {
  const tomorrow = addDays(TODAY, 1);
  const first = computeStreak([met(addDays(TODAY, -2), 5)], TODAY, 20, { lessons: 1 });
  const rows = [met(addDays(TODAY, -2), 5), first.freeze as StreakRow, first.today];
  const next = computeStreak(rows, tomorrow, 20, { lessons: 1 });
  assert.equal(next.today.streak_length, 7);
});

test('tarih yardımcıları', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(weekdayOf('2026-11-08'), 0); // Pazar
  assert.equal(localDate('Europe/Istanbul', new Date('2026-03-10T22:30:00Z')), '2026-03-11');
  assert.equal(localDate('UTC', new Date('2026-03-10T22:30:00Z')), '2026-03-10');
});
