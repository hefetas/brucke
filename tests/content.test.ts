import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const read = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

type Q = { prompt: string; options: string[]; answer: number };
const checkQuestions = (qs: Q[], where: string) => {
  assert.ok(qs.length >= 2, `${where}: en az 2 soru`);
  for (const q of qs) {
    assert.ok(q.options.length >= 3, `${where}: seçenek sayısı`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${where}: cevap aralık dışı: ${q.prompt}`);
    assert.equal(new Set(q.options).size, q.options.length, `${where}: yinelenen seçenek: ${q.prompt}`);
  }
};

for (const lang of ['en', 'de']) {
  const c = read(`${lang}.json`);
  const p = read(`placement.${lang}.json`);

  test(`${lang}: yerleştirme bankası dengeli ve geçerli`, () => {
    for (const skill of ['vocab', 'grammar', 'reading', 'listening']) {
      const items = p.filter((i: { skill: string }) => i.skill === skill);
      assert.equal(items.length, 8, `${skill}: 8 soru`);
      for (const lv of ['A1', 'A2', 'B1', 'B2']) {
        assert.equal(items.filter((i: { level: string }) => i.level === lv).length, 2, `${skill} ${lv}: 2 soru`);
      }
    }
    for (const i of p) {
      assert.ok(i.answer >= 0 && i.answer < i.options.length);
      if (i.skill === 'listening') assert.ok(i.audio_text, 'dinleme sorusunda ses metni');
      if (i.skill === 'reading') assert.ok(i.passage, 'okuma sorusunda metin');
    }
  });

  test(`${lang}: içerik slug'ları benzersiz, seviyeler geçerli`, () => {
    for (const key of ['listening', 'reading', 'speaking', 'writing', 'grammar']) {
      const slugs = c[key].map((x: { slug: string }) => x.slug);
      assert.equal(new Set(slugs).size, slugs.length, `${key}: yinelenen slug`);
      for (const x of c[key]) {
        assert.ok(LEVELS.includes(x.cefr_level), `${x.slug}: seviye`);
        assert.ok(x.slug.startsWith(`${lang}-`), `${x.slug}: dil öneki`);
      }
    }
  });

  test(`${lang}: dinleme ve okuma soruları tutarlı, sözlük metinde geçiyor`, () => {
    for (const x of [...c.listening, ...c.reading]) {
      checkQuestions(x.questions, x.slug);
      const text: string = (x.transcript ? x.transcript.map((t: { text: string }) => t.text).join(' ') : x.body).toLowerCase();
      for (const g of x.glossary) {
        const candidates = [g.lemma, ...(g.forms ?? [])].map((f: string) => f.toLowerCase().replace(/^(der|die|das) /, ''));
        assert.ok(candidates.some((f: string) => text.includes(f)), `${x.slug}: “${g.lemma}” metinde (biçimleriyle) bulunamadı`);
        assert.ok(g.meaning_tr, `${x.slug}: ${g.lemma} anlamı`);
      }
    }
  });

  test(`${lang}: dilbilgisi alıştırmaları geçerli`, () => {
    for (const t of c.grammar) {
      assert.ok(t.practice_items.length >= 4, `${t.slug}: en az 4 alıştırma`);
      for (const it of t.practice_items) {
        if (it.type === 'mcq') {
          assert.ok(it.answer >= 0 && it.answer < it.options.length, `${t.slug}: mcq cevap aralığı`);
        } else {
          assert.equal(it.type, 'fill');
          assert.ok(typeof it.answer === 'string' && it.answer.length > 0);
        }
      }
      for (const e of t.examples) {
        if (e.highlight) assert.ok(e.text.includes(e.highlight), `${t.slug}: vurgu metinde yok: ${e.highlight}`);
      }
    }
  });

  test(`${lang}: konuşma/yazma görevleri geçerli`, () => {
    for (const s of c.speaking) {
      assert.ok(s.model_text.length > 20);
      assert.ok(s.max_seconds >= 20 && s.max_seconds <= 120);
    }
    for (const w of c.writing) {
      assert.ok(w.min_words < w.max_words, `${w.slug}: kelime aralığı`);
      assert.ok(w.sample_answer, `${w.slug}: örnek cevap`);
      const n = w.sample_answer.split(/\s+/).length;
      assert.ok(n >= w.min_words && n <= w.max_words, `${w.slug}: örnek cevap ${n} kelime, aralık dışı`);
    }
  });

  test(`${lang}: kelime listesi benzersiz`, () => {
    const keys = c.vocabulary.map((v: { lemma: string; pos: string }) => `${v.lemma}|${v.pos}`);
    assert.equal(new Set(keys).size, keys.length);
    for (const v of c.vocabulary) assert.ok(LEVELS.includes(v.cefr_level) && v.meaning_tr && v.example);
  });
}

test('rozet kodları benzersiz', () => {
  const { achievements, languages } = read('common.json');
  const codes = achievements.map((a: { code: string }) => a.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(languages.map((l: { code: string }) => l.code).sort(), ['de', 'en', 'tr']);
});
