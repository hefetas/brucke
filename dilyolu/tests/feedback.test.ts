import test from 'node:test';
import assert from 'node:assert/strict';
import { alignWords, usedPhrases, normalize, levenshtein, countWords, sameAnswer } from '../lib/align.ts';
import {
  parseFeedback, ruleBasedFeedback, getFeedback, listProviders, buildPrompt,
  type FeedbackRequest, type FetchLike,
} from '../lib/feedback.ts';

test('normalize: aksan, ß ve noktalama', () => {
  assert.equal(normalize('Ich möchte Straße, bitte!'), 'ich mochte strasse bitte');
  assert.equal(normalize("Don't  stop."), "don't stop");
});

test('levenshtein', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
});

test('alignWords: eksik, fazla ve yakın kelimeler', () => {
  const r = alignWords('I would like a coffee please', 'I would like coffe please now');
  const status = Object.fromEntries(r.words.map((w) => [w.word, w.status]));
  assert.equal(status['i'], 'ok');
  assert.equal(status['a'], 'missing');
  assert.equal(status['coffee'], 'close');
  assert.equal(status['now'], 'extra');
  assert.ok(r.accuracy > 60 && r.accuracy < 100);
  assert.equal(alignWords('hello world', 'Hello, world!').accuracy, 100);
  assert.equal(alignWords('hello world', '').accuracy, 0);
});

test('usedPhrases kelime sınırında ve aksan duyarsız eşleşir', () => {
  assert.deepEqual(usedPhrases('Ich möchte einen Kaffee', ['ich mochte', 'einen tee']), ['ich mochte']);
  assert.deepEqual(usedPhrases('The cat sat', ['cat', 'at']), ['cat']);
  assert.equal(countWords('one two  three'), 3);
});

const goodJson = {
  score: 78.4,
  cefr_estimate: 'a2',
  summary_tr: 'İyi iş.',
  strengths_tr: ['Net cümleler'],
  errors: [{ type: 'tense', original: 'I go yesterday', corrected: 'I went yesterday', explanation_tr: 'Geçmiş zaman.' }],
  corrected_text: 'I went yesterday.',
  natural_version: 'I went there yesterday.',
  used_phrases: ['x'],
  next_focus_tr: 'Geçmiş zaman.',
};

test('parseFeedback: geçerli, kod bloklu ve geçersiz çıktı', () => {
  const ok = parseFeedback(goodJson)!;
  assert.equal(ok.score, 78);
  assert.equal(ok.cefr_estimate, 'A2');
  assert.equal(parseFeedback('```json\n' + JSON.stringify(goodJson) + '\n```')?.score, 78);
  assert.equal(parseFeedback('merhaba'), null);
  assert.equal(parseFeedback({ ...goodJson, cefr_estimate: 'Z9' }), null);
  assert.equal(parseFeedback({ ...goodJson, errors: [{ type: 'tense' }] }), null);
  assert.equal(parseFeedback({ ...goodJson, score: 'abc' }), null);
  const unknownType = parseFeedback({ ...goodJson, errors: [{ ...goodJson.errors[0], type: 'weird' }] })!;
  assert.equal(unknownType.errors[0].type, 'other');
  assert.equal(parseFeedback({ ...goodJson, score: 500 })!.score, 100);
});

const req: FeedbackRequest = {
  kind: 'writing', languageName: 'İngilizce', cefrLevel: 'A2',
  taskPrompt: 'Dünü anlat', targetPhrases: ['yesterday', 'went to'], text: 'Yesterday I went to school.',
  minWords: 3, maxWords: 50,
};

test('ruleBasedFeedback: dürüst ve sınırlı', () => {
  const f = ruleBasedFeedback(req);
  assert.deepEqual(f.used_phrases, ['yesterday', 'went to']);
  assert.ok(f.score >= 80 && f.score <= 95);
  assert.deepEqual(f.errors, []);
  assert.equal(ruleBasedFeedback({ ...req, text: '' }).score, 0);
});

test('buildPrompt: hedef dil, seviye ve şema içerir', () => {
  const { system, user } = buildPrompt(req);
  assert.match(system, /İngilizce/);
  assert.match(system, /A2/);
  assert.match(system, /corrected_text/);
  assert.match(user, /Yesterday I went to school/);
});

const jsonRes = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('getFeedback: Gemini bozuk → Groq başarılı; kullanılan ifadeler sunucuda hesaplanır', async () => {
  const calls: string[] = [];
  const f: FetchLike = async (url) => {
    calls.push(url);
    if (url.includes('googleapis')) return jsonRes({ candidates: [{ content: { parts: [{ text: 'bozuk' }] } }] });
    return jsonRes({ choices: [{ message: { content: JSON.stringify(goodJson) } }] });
  };
  const out = await getFeedback(req, { geminiKey: 'g', groqKey: 'q' }, f);
  assert.equal(out.provider, 'groq');
  assert.equal(out.attempts.length, 1);
  assert.deepEqual(out.feedback.used_phrases, ['yesterday', 'went to']);
  assert.equal(calls.length, 2);
});

test('getFeedback: hepsi hata verirse kural tabanlı yedek', async () => {
  const f: FetchLike = async () => jsonRes({}, false, 429);
  const out = await getFeedback(req, { geminiKey: 'g', groqKey: 'q', ollamaUrl: 'http://x' }, f);
  assert.equal(out.provider, 'rules');
  assert.equal(out.attempts.length, 3);
  const none = await getFeedback(req, {}, f);
  assert.equal(none.provider, 'rules');
});

test('getFeedback: Ollama yanıtı ve anahtarın başlıkta gönderilmesi', async () => {
  let header = '';
  const f: FetchLike = async (url, init) => {
    header = init.headers['x-goog-api-key'] ?? '';
    assert.ok(!url.includes('key='));
    return jsonRes({ candidates: [{ content: { parts: [{ text: JSON.stringify(goodJson) }] } }] });
  };
  const out = await getFeedback(req, { geminiKey: 'SECRET' }, f);
  assert.equal(out.provider, 'gemini');
  assert.equal(header, 'SECRET');
  assert.deepEqual(listProviders({}).length, 0);
  const o = await getFeedback(req, { ollamaUrl: 'http://localhost:11434/' }, async (url) => {
    assert.equal(url, 'http://localhost:11434/api/chat');
    return jsonRes({ message: { content: JSON.stringify(goodJson) } });
  });
  assert.equal(o.provider, 'ollama');
});

test('boş metin sağlayıcıya gönderilmez', async () => {
  let called = false;
  const out = await getFeedback({ ...req, text: '   ' }, { geminiKey: 'g' }, async () => {
    called = true;
    return jsonRes({});
  });
  assert.equal(called, false);
  assert.equal(out.provider, 'rules');
});

test('sameAnswer: aksan serttir, harf boyutu ve nokta esnektir', () => {
  assert.equal(sameAnswer('Went.', 'went'), true);
  assert.equal(sameAnswer('  has   gone ', 'has gone|have gone'), true);
  assert.equal(sameAnswer('schon', 'schön'), false);
  assert.equal(sameAnswer('goed', 'went'), false);
});
