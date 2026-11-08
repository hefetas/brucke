import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, planSeconds, dayFocus, pickContent, weakTopics, weakGrammarOf, PLAN_MINUTES } from '../lib/planner.ts';
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
  // Hepsi yapılmışsa seviyeye yakın olanlar arasından en eski yapılan (doneSlugs en yeniden eskiye): c, b'den eski.
  assert.equal(pick({ level: 'A2', interests: [], doneSlugs: ['a', 'b', 'c', 'd'] }), 'c');
  assert.equal(pickContent([], { level: 'A1', interests: [], doneSlugs: [] }, cefrIndex), undefined);
});

test('weakTopics: son deneme eşiğin altındaysa zayıf, sonradan iyi çözülürse listeden çıkar', () => {
  const at = (slug: string, score: number, day: number) => ({ slug, score, occurredAt: `2026-01-${String(day).padStart(2, '0')}T10:00:00Z` });
  const attempts = [at('x', 40, 1), at('x', 90, 5), at('y', 55, 2), at('z', 30, 3), at('w', 69, 4), at('v', 70, 4)];
  assert.deepEqual(weakTopics(attempts).map((t) => t.slug), ['z', 'y', 'w']);
  assert.equal(weakTopics(attempts, { limit: 1 }).length, 1);
  assert.equal(weakTopics(attempts).find((t) => t.slug === 'y')?.score, 55);
  assert.deepEqual(weakTopics([]), []);
});

test('weakGrammarOf: yalnızca dilbilgisi satırlarını sayar', () => {
  const rows = [
    { content_type: 'grammar', content_slug: 'g1', score: 20, occurred_at: '2026-01-01T00:00:00Z' },
    { content_type: 'reading', content_slug: 'r1', score: 10, occurred_at: '2026-01-01T00:00:00Z' },
    { content_type: null, content_slug: null, score: 5, occurred_at: '2026-01-01T00:00:00Z' },
  ];
  assert.deepEqual(weakGrammarOf(rows).map((t) => t.slug), ['g1']);
});

test('pickContent: zorlanılan konu, yapılmamış ve seviyeye uygun olandan önce gelir; en zayıf önce', () => {
  const items = [
    { slug: 'new-a1', cefrLevel: 'A1' as const, topics: [] },
    { slug: 'weak-1', cefrLevel: 'B1' as const, topics: [] },
    { slug: 'weak-2', cefrLevel: 'A2' as const, topics: [] },
  ];
  const base = { level: 'A1' as const, interests: [], doneSlugs: ['weak-1', 'weak-2'] };
  assert.equal(pickContent(items, base, cefrIndex)?.slug, 'new-a1');
  assert.equal(pickContent(items, { ...base, weakSlugs: ['weak-1', 'weak-2'] }, cefrIndex)?.slug, 'weak-1');
  assert.equal(pickContent(items, { ...base, weakSlugs: ['weak-2', 'weak-1'] }, cefrIndex)?.slug, 'weak-2');
  // Zayıf konu kullanılmışsa (adaylarda yoksa) normal sıralama sürer
  assert.equal(pickContent(items.filter((i) => i.slug !== 'weak-1'), { ...base, weakSlugs: ['weak-1'] }, cefrIndex)?.slug, 'new-a1');
});
