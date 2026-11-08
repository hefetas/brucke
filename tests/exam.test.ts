import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_OPTIONS, EXAM_SECTIONS, GOETHE_LEVELS, analyzeWriting, bandFromPct, bandFromRaw40, countWords, daysUntil, estimatedOverall,
  goethePassState, goetheGrade, gradeAnswers, isCorrect, nextStep, optionsOf, overallBand, roundBand, selfScore, summarize, typeAccuracy,
  weeklyPlan, type AttemptLite, type ExamQuestion, type ItemRef,
} from '../lib/exam.ts';
import { buildDrill, isWeakCard, weakJourneySteps, type CardLite } from '../lib/review.ts';

// ── Puanlama ────────────────────────────────────────────────────────────────

test('IELTS ham puan → band tabloları', () => {
  assert.equal(bandFromRaw40('listening', 40), 9);
  assert.equal(bandFromRaw40('listening', 30), 7);
  assert.equal(bandFromRaw40('listening', 23), 6);
  assert.equal(bandFromRaw40('reading', 33), 7.5);
  assert.equal(bandFromRaw40('reading', 30), 7);
  assert.equal(bandFromRaw40('reading', 15), 5);
  assert.equal(bandFromRaw40('reading', 0), 2);
  assert.equal(bandFromPct('reading', 100), 9);
  assert.equal(bandFromPct('reading', 75), 7); // 30/40
});

test('yarım bant yuvarlaması', () => {
  assert.equal(roundBand(6.25), 6.5);
  assert.equal(roundBand(6.75), 7);
  assert.equal(roundBand(6.1), 6);
  assert.equal(overallBand([6.5, 7, 6, 6.5]), 6.5);
  assert.equal(overallBand([]), null);
});

test('Goethe notlandırma eşikleri', () => {
  assert.equal(goetheGrade(95), 'sehr gut');
  assert.equal(goetheGrade(60), 'bestanden');
  assert.equal(goetheGrade(59.9), 'nicht bestanden');
});

test('öz değerlendirme: IELTS band, Goethe yüzde', () => {
  assert.deepEqual(selfScore('ielts', [6, 7, 6, 7]), { pct: 72.2, band: 6.5 });
  assert.equal(selfScore('goethe', [100, 75, 50, 75]).pct, 75);
  assert.equal(selfScore('ielts', []).band, null);
});

const q = (t: ExamQuestion['t'], answer: ExamQuestion['answer'], options?: string[]): ExamQuestion => ({ t, q: 'x', answer, options, why: 'y' });

test('yanıt kontrolü: seçenek ve boşluk doldurma', () => {
  assert.equal(isCorrect(q('tfng', 1), 1), true);
  assert.equal(isCorrect(q('tfng', 1), 0), false);
  assert.equal(isCorrect(q('tfng', 1), null), false);
  const fill = q('fill', ['green space', 'greenspace']);
  assert.equal(isCorrect(fill, '  Green   Space. '), true);
  assert.equal(isCorrect(fill, 'greenspace'), true);
  assert.equal(isCorrect(fill, 'space'), false);
  assert.equal(isCorrect(fill, 1), false);
});

test('gradeAnswers soru tipine göre döker', () => {
  const qs = [q('tfng', 0), q('tfng', 2), q('mcq', 1, ['a', 'b', 'c']), q('fill', ['cap'])];
  const g = gradeAnswers(qs, [0, 1, 1, 'Cap']);
  assert.equal(g.raw, 3);
  assert.equal(g.total, 4);
  assert.equal(g.pct, 75);
  assert.deepEqual(g.byType.tfng, [1, 2]);
  assert.deepEqual(g.byType.mcq, [1, 1]);
});

// ── Yazı ön kontrolü ────────────────────────────────────────────────────────

test('kelime sayımı', () => {
  assert.equal(countWords('Hello, world! It’s fine.'), 4);
  assert.equal(countWords('  '), 0);
});

test('yazı ön kontrolü: kısa, bağlaçsız metni uyarır', () => {
  const r = analyzeWriting('I like it. I like it. I like it.\n\nIt is good.', { lang: 'en', minWords: 250, wantParagraphs: 4 });
  assert.ok(r.words < 250);
  assert.equal(r.paragraphs, 2);
  assert.ok(r.notes.some((n) => n.includes('hedefin altında')));
  assert.ok(r.notes.some((n) => n.includes('paragraf')));
  assert.equal(r.hasConclusion, false);
});

test('yazı ön kontrolü: bağlaç ve sonuç paragrafını tanır (İngilizce ve Almanca)', () => {
  const en = analyzeWriting('However, this is true.\n\nMoreover, it matters.\n\nIn conclusion, we agree.', { lang: 'en', minWords: 5 });
  assert.ok(en.linkers.includes('however') && en.linkers.includes('moreover'));
  assert.equal(en.hasConclusion, true);
  const de = analyzeWriting('Einerseits ist das gut.\n\nAbschließend möchte ich sagen, dass es passt.', { lang: 'de', minWords: 5 });
  assert.ok(de.linkers.includes('einerseits'));
  assert.equal(de.hasConclusion, true);
});

// ── Özet, sıradaki adım, plan ───────────────────────────────────────────────

const att = (section: AttemptLite['section'], item_id: string, score_pct: number, band: number | null, created_at: string, level: string | null = null, types?: Record<string, [number, number]>): AttemptLite => ({
  section, item_id, level, score_pct, band, created_at, detail: types ? { types } : null,
});

test('summarize: son 3 deneme ortalaması ve band', () => {
  const a = [
    att('reading', 'r1', 50, null, '2026-01-01'), att('reading', 'r2', 75, null, '2026-01-02'), att('reading', 'r3', 100, null, '2026-01-03'), att('reading', 'r4', 100, null, '2026-01-04'),
    att('writing', 'w1', 70, 6, '2026-01-01'), att('writing', 'w2', 80, 7, '2026-01-02'),
  ];
  const s = summarize('ielts', a);
  assert.equal(Math.round(s.reading.pct as number), 92); // r2, r3, r4
  assert.equal(s.reading.band, bandFromPct('reading', (75 + 100 + 100) / 3));
  assert.equal(s.writing.band, 6.5);
  assert.equal(s.listening.band, null);
  assert.equal(s.reading.attempts, 4);
  assert.equal(estimatedOverall(s), null); // dinleme ve konuşma denenmedi
});

test('summarize: Goethe seviyeye göre süzer', () => {
  const a = [att('reading', 'r1', 90, null, '2026-01-01', 'B1'), att('reading', 'r2', 20, null, '2026-01-02', 'B2')];
  assert.equal(summarize('goethe', a, 'B1').reading.pct, 90);
  assert.equal(summarize('goethe', a, 'B2').reading.pct, 20);
});

test('Goethe geçme durumu', () => {
  const a = [att('reading', 'r', 80, null, '2026-01-01', 'B1'), att('listening', 'l', 40, null, '2026-01-01', 'B1')];
  const g = goethePassState(summarize('goethe', a, 'B1'));
  assert.deepEqual(g.passed, ['reading']);
  assert.deepEqual(g.failing, ['listening']);
  assert.deepEqual(g.untried.sort(), ['speaking', 'writing']);
});

const refs: ItemRef[] = EXAM_SECTIONS.flatMap((s) => [{ id: `${s}-1`, section: s, title: `${s} 1` }, { id: `${s}-2`, section: s, title: `${s} 2` }]);

test('nextStep: önce denenmemiş beceri, sonra hedeften en uzak', () => {
  let n = nextStep('ielts', summarize('ielts', []), refs, [], 7);
  assert.equal(n?.section, 'listening');
  assert.equal(n?.item?.id, 'listening-1');

  const attempts = [
    att('listening', 'listening-1', 90, 8, '2026-01-01'), att('reading', 'reading-1', 90, 8, '2026-01-01'),
    att('writing', 'writing-1', 50, 5.5, '2026-01-01'), att('speaking', 'speaking-1', 70, 6.5, '2026-01-01'),
  ];
  n = nextStep('ielts', summarize('ielts', attempts), refs, attempts, 7);
  assert.equal(n?.section, 'writing'); // band 5,5 en uzak
  assert.equal(n?.item?.id, 'writing-2'); // yapılmamış ilk görev
});

test('nextStep: hepsi çözüldüyse en düşük puanlıyı önerir', () => {
  const attempts = [
    att('listening', 'listening-1', 90, 8, '2026-01-01'), att('listening', 'listening-2', 90, 8, '2026-01-02'),
    att('reading', 'reading-1', 90, 8, '2026-01-01'), att('reading', 'reading-2', 90, 8, '2026-01-02'),
    att('writing', 'writing-1', 80, 7, '2026-01-01'), att('writing', 'writing-2', 40, 4, '2026-01-02'),
    att('speaking', 'speaking-1', 90, 8, '2026-01-01'), att('speaking', 'speaking-2', 90, 8, '2026-01-02'),
  ];
  const n = nextStep('ielts', summarize('ielts', attempts), refs, attempts, 7);
  assert.equal(n?.section, 'writing');
  assert.equal(n?.item?.id, 'writing-2');
});

test('nextStep: görev yoksa null', () => {
  assert.equal(nextStep('ielts', summarize('ielts', []), [], [], 7), null);
});

test('typeAccuracy: yeterli veri olan tipleri zayıftan güçlüye sıralar', () => {
  const a = [
    att('reading', 'r1', 50, null, '2026-01-01', null, { tfng: [1, 4], mcq: [2, 2], fill: [1, 2] }),
    att('listening', 'l1', 50, null, '2026-01-02', null, { tfng: [1, 2], mcq: [1, 1] }),
  ];
  const t = typeAccuracy(a);
  assert.deepEqual(t.map((x) => x.type), ['tfng', 'mcq']); // fill: 2 soru < 3, elenir
  assert.equal(t[0].total, 6);
});

test('gün hesabı ve haftalık plan', () => {
  assert.equal(daysUntil('2026-03-10', '2026-03-01'), 9);
  assert.equal(daysUntil(null, '2026-03-01'), null);
  const far = weeklyPlan(100, 'writing');
  assert.equal(far.perWeek.writing, 3);
  assert.equal(far.perWeek.reading, 2);
  const near = weeklyPlan(14, null);
  assert.equal(near.perWeek.reading, 3);
  assert.equal(near.weeks, 2);
  assert.equal(weeklyPlan(null, null).weeks, null);
});

// ── Tekrar mantığı ──────────────────────────────────────────────────────────

const card = (id: string, type: string, front: string, back: string, lapses = 0, wrong = 0, correct = 0): CardLite => ({ id, card_type: type, front, back, lapses, wrong_count: wrong, correct_count: correct });

test('zorlanılan kart tespiti', () => {
  assert.equal(isWeakCard({ lapses: 0, wrong_count: 0, correct_count: 0 }), false);
  assert.equal(isWeakCard({ lapses: 0, wrong_count: 1, correct_count: 5 }), false);
  assert.equal(isWeakCard({ lapses: 1, wrong_count: 1, correct_count: 5 }), true);
  assert.equal(isWeakCard({ lapses: 0, wrong_count: 3, correct_count: 3 }), true);
});

test('mini alıştırma: dört benzersiz seçenek ve doğru yanıt içerir', () => {
  const pool = [
    card('1', 'word_to_meaning', 'a (n)', 'elma\nex', 2, 3, 0), card('2', 'word_to_meaning', 'b (n)', 'armut\nex'), card('3', 'word_to_meaning', 'c (n)', 'kiraz\nex'),
    card('4', 'word_to_meaning', 'd (n)', 'muz\nex'), card('5', 'cloze', '___', 'x\ny', 3, 3, 0),
  ];
  const drill = buildDrill([pool[0], pool[4]], pool, 8, () => 0.3);
  assert.equal(drill.length, 1); // cloze alıştırmaya uygun değil
  assert.equal(drill[0].answer, 'elma');
  assert.equal(drill[0].options?.length, 4);
  assert.ok(drill[0].options?.includes('elma'));
  assert.equal(new Set(drill[0].options).size, 4);
});

test('mini alıştırma: çeldirici yetersizse seçenek yok (kendini değerlendirme)', () => {
  const only = card('1', 'word_to_meaning', 'a', 'elma', 1, 2, 0);
  assert.equal(buildDrill([only], [only])[0].options, null);
});

test('yol haritası zayıf adımları', () => {
  const steps = [
    { key: 'listening:a', kind: 'listening', slug: 'a', title: 'A' }, { key: 'reading:b', kind: 'reading', slug: 'b', title: 'B' },
    { key: 'writing:c', kind: 'writing', slug: 'c', title: 'C' },
  ];
  const scores = new Map([['listening:a', { best: 40, attempts: 1 }], ['reading:b', { best: 90, attempts: 1 }]]);
  const w = weakJourneySteps(steps, scores, 65);
  assert.deepEqual(w.map((x) => x.slug), ['a']); // writing hiç denenmedi, reading yeterli
});

// ── İçerik doğrulaması ──────────────────────────────────────────────────────

const read = (p: string) => JSON.parse(readFileSync(new URL(`../content/exam/${p}`, import.meta.url), 'utf8'));

function checkQuestions(id: string, questions: ExamQuestion[]) {
  assert.ok(questions.length >= 4, `${id}: en az 4 soru`);
  for (const [i, x] of questions.entries()) {
    const where = `${id} #${i + 1}`;
    assert.ok(['tfng', 'tf', 'mcq', 'fill', 'match'].includes(x.t), `${where}: soru tipi`);
    assert.ok(x.q && x.why, `${where}: soru ve açıklama`);
    if (x.t === 'fill') {
      assert.ok(Array.isArray(x.answer) && x.answer.length > 0 && x.answer.every((a) => typeof a === 'string' && a.trim()), `${where}: fill yanıtları`);
    } else {
      const opts = optionsOf(x);
      assert.ok(opts.length >= 2, `${where}: seçenekler`);
      assert.equal(new Set(opts).size, opts.length, `${where}: seçenekler benzersiz`);
      assert.ok(Number.isInteger(x.answer) && (x.answer as number) >= 0 && (x.answer as number) < opts.length, `${where}: yanıt indeksi`);
      if (x.t === 'mcq') assert.ok(opts.length >= 3, `${where}: mcq en az 3 seçenek`);
      if (x.t === 'tfng' || x.t === 'tf') assert.equal(x.options, undefined, `${where}: varsayılan seçenekler kullanılmalı`);
    }
  }
}

for (const lang of ['en', 'de'] as const) {
  const exam = lang === 'en' ? 'ielts' : 'goethe';
  const prefix = lang === 'en' ? 'ielts-' : 'goethe-';

  test(`${lang} sınav içeriği: okuma ve dinleme`, () => {
    const ids = new Set<string>();
    for (const section of ['reading', 'listening'] as const) {
      const items = read(`${lang}/${section}.json`);
      assert.ok(items.length >= 4);
      for (const it of items) {
        assert.ok(it.id.startsWith(prefix), `${it.id}: önek`);
        assert.ok(!ids.has(it.id), `${it.id}: benzersiz`);
        ids.add(it.id);
        assert.ok(it.title && it.minutes > 0);
        if (section === 'reading') assert.ok(it.text && it.text.length > 200, `${it.id}: metin`);
        else assert.ok(Array.isArray(it.script) && it.script.length >= 2 && it.script.every((l: { text: string }) => l.text.length > 5), `${it.id}: senaryo`);
        if (exam === 'goethe') assert.ok((GOETHE_LEVELS as readonly string[]).includes(it.level), `${it.id}: seviye`);
        checkQuestions(it.id, it.questions);
      }
    }
  });

  test(`${lang} sınav içeriği: yazma ve konuşma`, () => {
    const meta = read(`${lang}/meta.json`);
    const ids = new Set<string>();
    for (const w of read(`${lang}/writing.json`)) {
      assert.ok(w.id.startsWith(prefix) && !ids.has(w.id), `${w.id}: kimlik`);
      ids.add(w.id);
      assert.ok(w.prompt && w.minWords > 0 && w.minutes > 0);
      assert.ok(meta.essayTypes[w.kind], `${w.id}: tür '${w.kind}' meta'da tanımlı olmalı`);
      if (w.data) assert.ok(w.data.rows.every((r: string[]) => r.length === w.data.headers.length), `${w.id}: tablo satırları`);
      if (exam === 'goethe') assert.ok((GOETHE_LEVELS as readonly string[]).includes(w.level) && w.points?.length >= 2, `${w.id}: seviye ve maddeler`);
    }
    for (const s of read(`${lang}/speaking.json`)) {
      assert.ok(s.id.startsWith(prefix) && !ids.has(s.id), `${s.id}: kimlik`);
      ids.add(s.id);
      assert.ok(s.steps.length >= 2);
      for (const st of s.steps) {
        assert.ok(['q', 'cue'].includes(st.kind) && st.text && st.seconds >= 20 && st.seconds <= 300, `${s.id}: adım`);
        if (st.kind === 'cue') assert.ok(st.points?.length >= 3 && st.prep > 0, `${s.id}: cue kartı`);
      }
    }
  });

  test(`${lang} sınav içeriği: meta, ölçütler, stratejiler`, () => {
    const meta = read(`${lang}/meta.json`);
    for (const kind of ['writing', 'speaking'] as const) {
      const rub = meta.rubrics[kind];
      assert.equal(rub.length, 4, `${kind}: dört ölçüt`);
      for (const c of rub) {
        assert.equal(c.options.length, 4, `${c.key}: dört seçenek`);
        const vals = c.options.map((o: { value: number }) => o.value);
        if (exam === 'ielts') assert.deepEqual([...vals].sort((a, b) => a - b), vals, `${c.key}: değerler artan`);
        if (exam === 'goethe') assert.deepEqual(vals, [100, 75, 50, 25], `${c.key}: Goethe yüzdeleri`);
      }
    }
    for (const t of Object.values(meta.essayTypes) as { outline: string[]; phrases: string[] }[]) assert.ok(t.outline.length >= 3 && t.phrases.length >= 3);
    for (const k of ['listening', 'reading', 'writing', 'speaking']) assert.ok(meta.strategies[k], `strateji: ${k}`);
    for (const qt of Object.keys(DEFAULT_OPTIONS)) if (qt === (exam === 'ielts' ? 'tfng' : 'tf')) assert.ok(meta.strategies[qt], `strateji: ${qt}`);
  });
}

test('Goethe: her seviyede dört modülden en az biri tam, hepsi için görev var', () => {
  for (const level of GOETHE_LEVELS) {
    for (const section of ['reading', 'listening', 'writing', 'speaking']) {
      const items = read(`de/${section}.json`).filter((i: { level: string }) => i.level === level);
      assert.ok(items.length >= 1, `${level} ${section}: görev yok`);
    }
  }
});

test('IELTS: kelime listesi', () => {
  const meta = read('en/meta.json');
  const lemmas = meta.vocab.map((v: { lemma: string }) => v.lemma);
  assert.equal(new Set(lemmas).size, lemmas.length, 'lemma benzersiz');
  assert.ok(lemmas.length >= 50);
  for (const v of meta.vocab) assert.ok(v.lemma && v.pos && v.meaning_tr && v.example, v.lemma);
});

test('IELTS: Task 1 ve Task 2 minimum kelime sayıları', () => {
  for (const w of read('en/writing.json')) assert.equal(w.minWords, w.task === 't1' ? 150 : 250, w.id);
});
