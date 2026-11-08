// content/*.json dosyalarından supabase/seed.sql üretir. Çalıştır: npm run seed:build
// Aynı SQL tekrar çalıştırılabilir (içerik slug ile güncellenir, kullanıcı verisine dokunmaz).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(root, 'content', f), 'utf8'));

const s = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => `${s(JSON.stringify(v))}::jsonb`;
const arr = (a) => (a && a.length ? `ARRAY[${a.map(s).join(', ')}]::text[]` : `'{}'::text[]`);
const n = (v) => (v === null || v === undefined ? 'null' : String(Number(v)));
const b = (v) => (v ? 'true' : 'false');
const words = (t) => t.split(/\s+/).filter(Boolean).length;

const out = [];
const push = (line) => out.push(line);

push('-- DilYolu başlangıç içeriği. scripts/build-seed.mjs ile content/*.json dosyalarından üretilir; elle düzenleme.');
push('begin;');

const common = read('common.json');
for (const l of common.languages) {
  push(
    `insert into public.languages (code, name_native, name_tr, tts_locale, stt_locale, is_enabled, is_target) values (${s(l.code)}, ${s(l.name_native)}, ${s(l.name_tr)}, ${s(l.tts_locale)}, ${s(l.stt_locale)}, ${b(l.is_enabled)}, ${b(l.is_target)}) ` +
      `on conflict (code) do update set name_native = excluded.name_native, name_tr = excluded.name_tr, tts_locale = excluded.tts_locale, stt_locale = excluded.stt_locale, is_enabled = excluded.is_enabled, is_target = excluded.is_target;`,
  );
}
for (const a of common.achievements) {
  push(
    `insert into public.achievements (code, title_tr, description_tr, category, criteria, xp_reward, icon) values (${s(a.code)}, ${s(a.title_tr)}, ${s(a.description_tr)}, ${s(a.category)}, ${j(a.criteria)}, ${n(a.xp_reward)}, ${s(a.icon)}) ` +
      `on conflict (code) do update set title_tr = excluded.title_tr, description_tr = excluded.description_tr, category = excluded.category, criteria = excluded.criteria, xp_reward = excluded.xp_reward, icon = excluded.icon;`,
  );
}

const counts = {};
for (const lang of ['en', 'de']) {
  const c = read(`${lang}.json`);
  const L = s(lang);
  counts[lang] = {};

  for (const x of c.listening) {
    push(
      `insert into public.listening_contents (language_code, slug, title, kind, cefr_level, topics, duration_sec, transcript, glossary, questions, source, license) values (${L}, ${s(x.slug)}, ${s(x.title)}, ${s(x.kind)}, ${s(x.cefr_level)}, ${arr(x.topics)}, ${n(x.duration_sec)}, ${j(x.transcript)}, ${j(x.glossary)}, ${j(x.questions)}, 'DilYolu özgün içerik', 'Kişisel kullanım') ` +
        `on conflict (language_code, slug) do update set title = excluded.title, kind = excluded.kind, cefr_level = excluded.cefr_level, topics = excluded.topics, duration_sec = excluded.duration_sec, transcript = excluded.transcript, glossary = excluded.glossary, questions = excluded.questions;`,
    );
  }
  for (const x of c.reading) {
    const wc = words(x.body);
    push(
      `insert into public.reading_contents (language_code, slug, title, kind, cefr_level, topics, body, word_count, est_read_sec, glossary, questions, source, license) values (${L}, ${s(x.slug)}, ${s(x.title)}, ${s(x.kind)}, ${s(x.cefr_level)}, ${arr(x.topics)}, ${s(x.body)}, ${wc}, ${Math.round((wc / 150) * 60)}, ${j(x.glossary)}, ${j(x.questions)}, 'DilYolu özgün içerik', 'Kişisel kullanım') ` +
        `on conflict (language_code, slug) do update set title = excluded.title, kind = excluded.kind, cefr_level = excluded.cefr_level, topics = excluded.topics, body = excluded.body, word_count = excluded.word_count, est_read_sec = excluded.est_read_sec, glossary = excluded.glossary, questions = excluded.questions;`,
    );
  }
  for (const x of c.speaking) {
    push(
      `insert into public.speaking_tasks (language_code, slug, cefr_level, kind, title_tr, prompt_tr, model_text, target_phrases, max_seconds, topics) values (${L}, ${s(x.slug)}, ${s(x.cefr_level)}, ${s(x.kind)}, ${s(x.title_tr)}, ${s(x.prompt_tr)}, ${s(x.model_text)}, ${arr(x.target_phrases)}, ${n(x.max_seconds)}, ${arr(x.topics)}) ` +
        `on conflict (language_code, slug) do update set cefr_level = excluded.cefr_level, kind = excluded.kind, title_tr = excluded.title_tr, prompt_tr = excluded.prompt_tr, model_text = excluded.model_text, target_phrases = excluded.target_phrases, max_seconds = excluded.max_seconds, topics = excluded.topics;`,
    );
  }
  for (const x of c.writing) {
    push(
      `insert into public.writing_tasks (language_code, slug, cefr_level, kind, title_tr, prompt_tr, target_phrases, min_words, max_words, sample_answer, topics) values (${L}, ${s(x.slug)}, ${s(x.cefr_level)}, ${s(x.kind)}, ${s(x.title_tr)}, ${s(x.prompt_tr)}, ${arr(x.target_phrases)}, ${n(x.min_words)}, ${n(x.max_words)}, ${s(x.sample_answer)}, ${arr(x.topics)}) ` +
        `on conflict (language_code, slug) do update set cefr_level = excluded.cefr_level, kind = excluded.kind, title_tr = excluded.title_tr, prompt_tr = excluded.prompt_tr, target_phrases = excluded.target_phrases, min_words = excluded.min_words, max_words = excluded.max_words, sample_answer = excluded.sample_answer, topics = excluded.topics;`,
    );
  }
  for (const x of c.grammar) {
    push(
      `insert into public.grammar_topics (language_code, slug, title_tr, title_target, cefr_level, summary_tr, examples, practice_items, order_index) values (${L}, ${s(x.slug)}, ${s(x.title_tr)}, ${s(x.title_target)}, ${s(x.cefr_level)}, ${s(x.summary_tr)}, ${j(x.examples)}, ${j(x.practice_items)}, ${n(x.order_index)}) ` +
        `on conflict (language_code, slug) do update set title_tr = excluded.title_tr, title_target = excluded.title_target, cefr_level = excluded.cefr_level, summary_tr = excluded.summary_tr, examples = excluded.examples, practice_items = excluded.practice_items, order_index = excluded.order_index;`,
    );
  }
  for (const x of c.vocabulary) {
    push(
      `insert into public.vocabulary (language_code, lemma, part_of_speech, meaning_tr, example, example_tr, cefr_level, frequency_rank, source) values (${L}, ${s(x.lemma)}, ${s(x.pos)}, ${s(x.meaning_tr)}, ${s(x.example)}, ${s(x.example_tr)}, ${s(x.cefr_level)}, ${n(x.frequency_rank)}, 'seed') ` +
        `on conflict (language_code, lemma, part_of_speech) do update set meaning_tr = excluded.meaning_tr, example = excluded.example, example_tr = excluded.example_tr, cefr_level = excluded.cefr_level, frequency_rank = excluded.frequency_rank;`,
    );
  }
  counts[lang] = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.length]));
}

push('commit;');
mkdirSync(join(root, 'supabase'), { recursive: true });
writeFileSync(join(root, 'supabase', 'seed.sql'), out.join('\n') + '\n');
console.log('supabase/seed.sql yazıldı', JSON.stringify(counts));
