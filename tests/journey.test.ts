import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptStats, buildJourney, journeyState, levelsInRange, normalizeRange, stepHref, stepKey,
  type AttemptStat, type CatalogItem,
} from '../lib/journey.ts';

const item = (kind: CatalogItem['kind'], slug: string, level: CatalogItem['level'], order = 0): CatalogItem => ({ kind, slug, title: slug, level, order });

const catalog: CatalogItem[] = [
  item('grammar', 'g-b1-1', 'B1', 1), item('grammar', 'g-b1-2', 'B1', 2), item('grammar', 'g-b1-3', 'B1', 3), item('grammar', 'g-b1-4', 'B1', 4),
  item('listening', 'l-b1', 'B1'),
  item('reading', 'r-b1', 'B1'),
  item('grammar', 'g-b2-1', 'B2', 1),
  item('reading', 'r-b2', 'B2'),
  item('grammar', 'g-a1', 'A1', 1),
];

test('normalizeRange: ters aralık düzelir, C2 C1\'e iner', () => {
  assert.deepEqual(normalizeRange('C1', 'B1'), { start: 'B1', target: 'C1' });
  assert.deepEqual(normalizeRange('B2', 'C2'), { start: 'B2', target: 'C1' });
  assert.deepEqual(levelsInRange('B1', 'C1'), ['B1', 'B2', 'C1']);
  assert.deepEqual(levelsInRange('B2', 'B2'), ['B2']);
});

test('buildJourney: yalnızca aralıktaki seviyeler, seviye sırasıyla; türler yığılmaz', () => {
  const steps = buildJourney(catalog, 'B1', 'C1');
  assert.ok(steps.every((s) => s.level !== 'A1'));
  const b1 = steps.filter((s) => s.stage === 0).map((s) => s.slug);
  assert.equal(b1.length, 6);
  // dinleme ve okuma dilbilgisi listesinin ortasında, sonunda değil
  assert.notEqual(b1[b1.length - 1], 'l-b1');
  assert.ok(b1.indexOf('l-b1') > 0 || b1.indexOf('r-b1') > 0);
  assert.deepEqual(steps.map((s) => s.index), steps.map((_, i) => i));
  // B2 adımları B1'den sonra gelir
  assert.ok(steps.findIndex((s) => s.level === 'B2') > steps.findIndex((s) => s.level === 'B1' && s.slug === 'g-b1-4'));
  // dilbilgisi order_index sırasına uyar
  const g = b1.filter((s) => s.startsWith('g-'));
  assert.deepEqual(g, ['g-b1-1', 'g-b1-2', 'g-b1-3', 'g-b1-4']);
});

test('journeyState: sıradaki adım ilk yapılmamış olandır, yüzde ve süre hesaplanır', () => {
  const steps = buildJourney(catalog, 'B1', 'B2');
  const stats = new Map<string, AttemptStat>();
  let st = journeyState(steps, stats, 'B1', 'B2');
  assert.equal(st.next.type, 'step');
  assert.equal(st.percent, 0);
  assert.equal(st.attempted, 0);
  assert.equal(st.total, 8);
  const first = (st.next as { step: { key: string } }).step;
  stats.set(first.key, { best: 90, attempts: 1 });
  st = journeyState(steps, stats, 'B1', 'B2');
  assert.equal(st.attempted, 1);
  assert.notEqual((st.next as { step: { key: string } }).step.key, first.key);
  assert.ok(st.remainingMinutes > 0);
});

test('journeyState: hepsi yapılınca düşük puanlı adım bir kez tekrar önerilir, sonra yolculuk biter', () => {
  const steps = buildJourney(catalog, 'B1', 'B2');
  const stats = new Map<string, AttemptStat>(steps.map((s) => [s.key, { best: 90, attempts: 1 }] as [string, AttemptStat]));
  assert.equal(journeyState(steps, stats, 'B1', 'B2').next.type, 'finished');
  stats.set(stepKey('grammar', 'g-b1-2'), { best: 40, attempts: 1 });
  const retry = journeyState(steps, stats, 'B1', 'B2').next;
  assert.equal(retry.type, 'step');
  assert.equal((retry as { reason: string }).reason, 'retry');
  assert.equal((retry as { step: { slug: string } }).step.slug, 'g-b1-2');
  assert.equal((retry as { previousScore: number }).previousScore, 40);
  // çok denendiyse takılıp kalmaz
  stats.set(stepKey('grammar', 'g-b1-2'), { best: 40, attempts: 3 });
  assert.equal(journeyState(steps, stats, 'B1', 'B2').next.type, 'finished');
});

test('journeyState: yapılmamış adım tekrardan önce gelir; çok kart varsa önce kart tekrarı', () => {
  const steps = buildJourney(catalog, 'B1', 'B2');
  const stats = new Map<string, AttemptStat>([[stepKey('grammar', 'g-b1-1'), { best: 30, attempts: 1 }]]);
  const next = journeyState(steps, stats, 'B1', 'B2').next;
  assert.equal((next as { reason: string }).reason, 'new');
  assert.deepEqual(journeyState(steps, stats, 'B1', 'B2', 40).next, { type: 'review', due: 40 });
  assert.equal(journeyState(steps, stats, 'B1', 'B2', 5).next.type, 'step');
});

test('journeyState: içeriği olmayan seviye dürüstçe bildirilir, sonraki seviyeler atlanmaz/engellenmez', () => {
  const steps = buildJourney(catalog, 'B2', 'C1');
  const st0 = journeyState(steps, new Map(), 'B2', 'C1');
  assert.deepEqual(st0.gaps, ['C1']);
  assert.equal(st0.stages[1].empty, true);
  // B2 bitince geriye yalnızca boş C1 kalır → no-content
  const done = new Map<string, AttemptStat>(steps.map((s) => [s.key, { best: 95, attempts: 1 }] as [string, AttemptStat]));
  assert.deepEqual(journeyState(steps, done, 'B2', 'C1').next, { type: 'no-content', level: 'C1' });
  // boş ara seviye, sonrası doluysa atlanır
  const mixed = [item('grammar', 'a', 'B1'), item('grammar', 'c', 'C1')];
  const s2 = buildJourney(mixed, 'B1', 'C1');
  const d2 = new Map<string, AttemptStat>([[stepKey('grammar', 'a'), { best: 90, attempts: 1 }]]);
  const n = journeyState(s2, d2, 'B1', 'C1').next;
  assert.equal((n as { step: { slug: string } }).step.slug, 'c');
});

test('attemptStats: en iyi puan, deneme sayısı ve başlangıç tarihi filtresi', () => {
  const rows = [
    { content_type: 'grammar', content_slug: 'x', score: 40, occurred_at: '2026-01-01T00:00:00Z' },
    { content_type: 'grammar', content_slug: 'x', score: 80, occurred_at: '2026-01-03T00:00:00Z' },
    { content_type: 'reading', content_slug: 'y', score: 55, occurred_at: '2026-01-02T00:00:00Z' },
    { content_type: null, content_slug: null, score: 100, occurred_at: '2026-01-02T00:00:00Z' },
  ];
  const all = attemptStats(rows);
  assert.deepEqual(all.get('grammar:x'), { best: 80, attempts: 2 });
  assert.equal(all.size, 2);
  const since = attemptStats(rows, '2026-01-02T00:00:00Z');
  assert.deepEqual(since.get('grammar:x'), { best: 80, attempts: 1 });
});

test('stepHref: ?j=1 ile yol haritasına dönüş işaretlenir', () => {
  assert.equal(stepHref({ kind: 'listening', slug: 'en-cafe-order' }), '/listen/en-cafe-order?j=1');
  assert.equal(stepHref({ kind: 'speaking', slug: 's' }), '/speak/s?j=1');
});
