import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatePlacement, estimateSkill, evaluateLevel, weakSkills, overallLevel, allLevels, xpLevel,
  nextLevel, prevLevel, type PlacementAnswer, type ProgressEntry, type Cefr,
} from '../lib/levels.ts';

const ans = (skill: PlacementAnswer['skill'], level: Cefr, correct: boolean): PlacementAnswer => ({ skill, level, correct });

test('yerleştirme: her seviyede ≥%50 doğruluk sürdükçe yükselir', () => {
  const a = [
    ans('reading', 'A1', true), ans('reading', 'A1', true),
    ans('reading', 'A2', true), ans('reading', 'A2', false),
    ans('reading', 'B1', false), ans('reading', 'B1', false),
    ans('reading', 'B2', true), // B1 geçilmediği için sayılmaz
  ];
  assert.equal(estimateSkill(a, 'reading'), 'A2');
});

test('yerleştirme: soru yoksa A1, ilk seviye kaldıysa A1', () => {
  assert.equal(estimateSkill([], 'vocab'), 'A1');
  assert.equal(estimateSkill([ans('vocab', 'A1', false), ans('vocab', 'A1', false)], 'vocab'), 'A1');
});

test('yerleştirme: konuşma/yazma güvenli türetilir', () => {
  const a = [
    ...['A1', 'A2', 'B1'].flatMap((l) => [ans('listening', l as Cefr, true)]),
    ...['A1', 'A2'].flatMap((l) => [ans('vocab', l as Cefr, true)]),
    ...['A1', 'A2', 'B1', 'B2'].flatMap((l) => [ans('grammar', l as Cefr, true)]),
    ans('reading', 'A1', true),
  ];
  const r = estimatePlacement(a);
  assert.equal(r.listening, 'B1');
  assert.equal(r.vocab, 'A2');
  assert.equal(r.grammar, 'B2');
  assert.equal(r.speaking, 'A2');
  assert.equal(r.writing, 'A2');
  assert.equal(overallLevel(r), 'A2');
});

const entries = (n: number, score: number, level: Cefr, start = 0): ProgressEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    score, contentLevel: level, occurredAt: new Date(Date.UTC(2026, 0, 1 + start + i)).toISOString(),
  }));

test('seviye atlama: son 10 ort ≥80 ve üst seviyede 3 etkinlik ≥60', () => {
  const ok = [...entries(10, 85, 'B1'), ...entries(3, 65, 'B2', 20)];
  assert.equal(evaluateLevel(ok, 'B1').levelUp, true);
  const noNext = entries(10, 90, 'B1');
  assert.equal(evaluateLevel(noNext, 'B1').levelUp, false);
  const lowAvg = [...entries(10, 70, 'B1'), ...entries(3, 65, 'B2', 20)];
  assert.equal(evaluateLevel(lowAvg, 'B1').levelUp, false);
  assert.equal(evaluateLevel(entries(5, 95, 'B1'), 'B1').levelUp, false);
});

test('seviye düşürme önerisi: son 10 ort < 50', () => {
  const d = evaluateLevel(entries(8, 40, 'B1'), 'B1');
  assert.equal(d.suggestDrop, true);
  assert.equal(evaluateLevel(entries(8, 40, 'A1'), 'A1').suggestDrop, false);
  assert.equal(evaluateLevel(entries(3, 20, 'B1'), 'B1').suggestDrop, false);
});

test('zayıf beceriler en düşükten sıralanır, az veri sayılmaz', () => {
  const w = weakSkills({
    listening: entries(5, 55, 'A2'),
    reading: entries(5, 90, 'A2'),
    speaking: entries(2, 10, 'A2'),
    grammar: entries(4, 40, 'A2'),
  });
  assert.deepEqual(w, ['grammar', 'listening']);
});

test('yardımcılar', () => {
  assert.equal(nextLevel('C2'), 'C2');
  assert.equal(prevLevel('A1'), 'A1');
  assert.equal(nextLevel('A1'), 'A2');
  assert.deepEqual(xpLevel(0), { level: 1, into: 0, needed: 100 });
  assert.deepEqual(xpLevel(100), { level: 2, into: 0, needed: 150 });
  assert.equal(overallLevel(allLevels('B2')), 'B2');
});
