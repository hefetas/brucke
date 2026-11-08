import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type SrsCard, newCard, nextReview, previewIntervals, formatInterval, suggestGrade, DAY_MS, MIN_MS,
} from '../lib/srs.ts';

const T0 = new Date('2026-01-01T09:00:00Z');
const minutesUntil = (due: string, now: Date) => (new Date(due).getTime() - now.getTime()) / MIN_MS;

test('doküman §8.3 örneği: 10 dk → 1 g → 3 g → 8 g → 20 g, sonra Tekrar → 6 g, ease 2,30', () => {
  let card = newCard(T0);
  let now = T0;
  const seen: number[] = [];

  let r = nextReview(card, 3, now); // 10 dk
  seen.push(minutesUntil(r.card.dueAt, now));
  card = r.card;
  now = new Date(card.dueAt);

  r = nextReview(card, 3, now); // 1 gün
  card = r.card;
  assert.equal(card.state, 'review');
  seen.push(card.intervalDays * 24 * 60);
  now = new Date(card.dueAt);

  for (let i = 0; i < 3; i++) {
    r = nextReview(card, 3, now);
    card = r.card;
    seen.push(card.intervalDays * 24 * 60);
    now = new Date(card.dueAt);
  }
  assert.deepEqual(seen, [10, 1440, 3 * 1440, 8 * 1440, 20 * 1440]);

  r = nextReview(card, 1, now);
  assert.equal(r.card.intervalDays, 6);
  assert.equal(r.card.ease, 2.3);
  assert.equal(r.card.state, 'relearning');
  assert.equal(r.card.lapses, 1);
  assert.equal(r.isCorrect, false);
});

test('yeniden öğrenmeden dönüş: İyi kalıcı aralığa (6 g) bağlar', () => {
  let card: SrsCard = { ...newCard(T0), state: 'review', intervalDays: 20 };
  card = nextReview(card, 1, T0).card;
  const back = nextReview(card, 3, new Date(card.dueAt)).card;
  assert.equal(back.state, 'review');
  assert.equal(back.intervalDays, 6);
});

test('Zor ve Kolay ease ve aralığı değiştirir, sınırlar korunur', () => {
  const base = { ...newCard(T0), state: 'review' as const, intervalDays: 10, ease: 2.5 };
  const hard = nextReview(base, 2, T0).card;
  assert.equal(hard.intervalDays, 12);
  assert.equal(hard.ease, 2.35);
  const easy = nextReview(base, 4, T0).card;
  assert.equal(easy.intervalDays, Math.round(10 * 2.5 * 1.3));
  assert.equal(easy.ease, 2.65);

  let low: SrsCard = { ...base, ease: 1.3 };
  low = nextReview(low, 1, T0).card;
  assert.equal(low.ease, 1.3);
  const high = nextReview({ ...base, ease: 3.0 }, 4, T0).card;
  assert.equal(high.ease, 3.0);
});

test('aralık her zaman en az bir gün artar', () => {
  const c = { ...newCard(T0), state: 'review' as const, intervalDays: 1, ease: 1.3 };
  assert.equal(nextReview(c, 3, T0).card.intervalDays, 2);
  assert.equal(nextReview(c, 2, T0).card.intervalDays, 2);
});

test('öğrenme: Tekrar 1 dk, Kolay hemen 4 güne mezun eder', () => {
  const again = nextReview(newCard(T0), 1, T0).card;
  assert.equal(minutesUntil(again.dueAt, T0), 1);
  assert.equal(again.state, 'learning');
  const easy = nextReview(newCard(T0), 4, T0).card;
  assert.equal(easy.state, 'review');
  assert.equal(easy.intervalDays, 4);
  assert.equal(easy.ease, 2.65);
  assert.equal((new Date(easy.dueAt).getTime() - T0.getTime()) / DAY_MS, 4);
});

test('konuşmada/yazmada kullanılan kart bir kez ×1,15 bonus alır', () => {
  const c = { ...newCard(T0), state: 'review' as const, intervalDays: 8, usedInSpeaking: true };
  const a = nextReview(c, 3, T0).card;
  assert.equal(a.intervalDays, Math.round(20 * 1.15));
  assert.equal(a.usageBonusGiven, true);
  const b = nextReview({ ...a }, 3, T0).card;
  assert.equal(b.intervalDays, Math.round(a.intervalDays * a.ease));
});

test('6. unutmada kart sülük (leech) olur', () => {
  let card: SrsCard = { ...newCard(T0), state: 'review', intervalDays: 30, lapses: 5 };
  card = nextReview(card, 1, T0).card;
  assert.equal(card.lapses, 6);
  assert.equal(card.isLeech, true);
});

test('formatInterval ve previewIntervals', () => {
  assert.equal(formatInterval(10), '10 dk');
  assert.equal(formatInterval(90), '2 sa');
  assert.equal(formatInterval(1440), '1 g');
  assert.equal(formatInterval(20 * 1440), '20 g');
  assert.equal(formatInterval(60 * 1440), '2 ay');
  const p = previewIntervals(newCard(T0), T0);
  assert.equal(p[1], '1 dk');
  assert.equal(p[3], '10 dk');
  assert.equal(p[4], '4 g');
});

test('suggestGrade', () => {
  assert.equal(suggestGrade(false, 1000), 1);
  assert.equal(suggestGrade(true, 1500), 4);
  assert.equal(suggestGrade(true, 6000), 3);
  assert.equal(suggestGrade(true, 15000), 2);
});
