import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, planSeconds, dayFocus, pickContent, PLAN_MINUTES } from '../lib/planner.ts';
import { cefrIndex } from '../lib/levels.ts';

test('her süre şablonu tam dakikaya eşittir (her gün)', () => {
  for (const m of PLAN_MINUTES) {
    for (let d = 0; d < 7; d++) {
      assert.equal(planSeconds(buildPlan({ minutes: m, weekday: d })), m * 60, `${m} dk, gün ${d}`);
    }
  }
});

test('pazartesi/çarşamba/cuma dinleme+konuşma, salı/perşembe/cumartesi okuma+yazma, pazar gerçek hayat', () => {
  const types = (d: number) => buildPlan({ minutes: 20, weekday: d }).map((b) => b.type);
  assert.deepEqual(types(1), ['listening', 'grammar', 'review', 'speaking']);
  assert.deepEqual(types(3), ['listening', 'grammar', 'review', 'speaking']);
  assert.deepEqual(types(2), ['reading', 'grammar', 'review', 'writing']);
  assert.deepEqual(types(6), ['reading', 'grammar', 'review', 'writing']);
  assert.deepEqual(types(0), ['reading', 'grammar', 'review', 'real_world']);
  assert.equal(dayFocus(0), 'real-world');
});

test('zayıf beceri bugünün bloğuna zorlanır', () => {
  const t = buildPlan({ minutes: 20, weekday: 1, weakSkills: ['writing'] }).map((b) => b.type);
  assert.ok(t.includes('writing') && !t.includes('speaking'));
  const t2 = buildPlan({ minutes: 20, weekday: 1, weakSkills: ['reading'] }).map((b) => b.type);
  assert.ok(t2.includes('reading') && !t2.includes('listening'));
});

test('40 dk ve 60 dk planlarında yinelenen blok yok', () => {
  for (const m of [40, 60] as const) {
    for (let d = 0; d < 7; d++) {
      const t = buildPlan({ minutes: m, weekday: d }).map((b) => b.type);
      assert.equal(new Set(t).size, t.length, `${m} dk gün ${d}: ${t.join(',')}`);
    }
  }
});

test('40’tan fazla bekleyen kartta tekrar süresi artar, toplam sabit kalır', () => {
  const base = buildPlan({ minutes: 20, weekday: 2 });
  const heavy = buildPlan({ minutes: 20, weekday: 2, dueCount: 60 });
  const rev = (p: typeof base) => p.find((b) => b.type === 'review')!.seconds;
  assert.equal(rev(heavy), rev(base) + 120);
  assert.equal(planSeconds(heavy), 1200);
  const ten = buildPlan({ minutes: 10, weekday: 2, dueCount: 60 });
  assert.equal(planSeconds(ten), 600);
});

test('pickContent: yapılmamış, seviyeye yakın ve ilgi alanına uyan içeriği seçer', () => {
  const items = [
    { slug: 'a', cefrLevel: 'A1' as const, topics: ['yemek'] },
    { slug: 'b', cefrLevel: 'A2' as const, topics: ['seyahat'] },
    { slug: 'c', cefrLevel: 'A2' as const, topics: ['teknoloji'] },
    { slug: 'd', cefrLevel: 'B2' as const, topics: ['teknoloji'] },
  ];
  const pick = (opts: { level: 'A1' | 'A2' | 'B2'; interests: string[]; doneSlugs: string[] }) =>
    pickContent(items, opts, cefrIndex)?.slug;
  assert.equal(pick({ level: 'A2', interests: ['teknoloji'], doneSlugs: [] }), 'c');
  assert.equal(pick({ level: 'A2', interests: [], doneSlugs: ['b'] }), 'c');
  assert.equal(pick({ level: 'A2', interests: [], doneSlugs: ['a', 'b', 'c', 'd'] }), 'b');
  assert.equal(pickContent([], { level: 'A1', interests: [], doneSlugs: [] }, cefrIndex), undefined);
});
