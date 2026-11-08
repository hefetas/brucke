// Her gün çalışır: Gemini ile yeni kelime, okuma metni ve dikte cümleleri üretir, daily.json'a ekler.
// Gerekli: GEMINI_API_KEY (GitHub Actions secret). İsteğe bağlı: GEMINI_MODEL, GEMINI_BASE (test için).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';
const OUT = process.env.DAILY_FILE || 'daily.json';
const HTML = process.env.SITE_FILE || 'index.html';
if (!KEY) { console.error('GEMINI_API_KEY yok'); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
const dayNum = Math.floor(Date.parse(today) / 86400000);
const TOPICS = ['technology and society', 'health and sleep', 'cities and transport', 'the environment', 'education and learning', 'work and careers', 'food and culture', 'travel and tourism',
  'science and discovery', 'money and consumer habits', 'sport and fitness', 'media and news', 'family and friendship', 'housing and neighbourhoods', 'history and heritage',
  'energy and industry', 'language and communication', 'art and music', 'weather and nature', 'engineering and manufacturing', 'volunteering and community', 'safety and rules',
  'free time and hobbies', 'shopping and services', 'animals and nature', 'health care', 'universities and student life', 'inventions', 'festivals and traditions', 'the future of work'];
const topic = TOPICS[dayNum % TOPICS.length];

const data = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
for (const m of ['en', 'de']) data[m] = Object.assign({ words: [], readings: [], dict: [] }, data[m]);

// words already in the site or in daily.json (so nothing repeats)
const html = existsSync(HTML) ? readFileSync(HTML, 'utf8') : '';
const block = (name) => ((html.match(new RegExp('const ' + name + ' = `([^`]*)`')) || [])[1] || '').split('\n');
const known = { en: new Set(), de: new Set() };
block('RAW_EN').forEach(l => known.en.add(l.split('|')[0].toLowerCase()));
block('RAW_DE').forEach(l => { const p = l.split('|'); if (p[1]) known.de.add(p[1].toLowerCase()); });
for (const m of ['en', 'de']) data[m].words.forEach(w => known[m].add(String(w.word).toLowerCase()));

const deLevel = (() => { const n = known.de.size; return n < 200 ? 'A1-A2' : n < 450 ? 'A2-B1' : 'B1-B2'; })();
const enLevel = 'B2-C1';

async function ask(prompt) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.8 } }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const t = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      return JSON.parse(t.map(x => x.text || '').join(''));
    } catch (e) { console.error('deneme', attempt, e.message); await new Promise(res => setTimeout(res, 4000 * attempt)); }
  }
  return null;
}

const clean = (x, n = 300) => typeof x === 'string' && x.trim() && x.length <= n && !/[|\n`]/.test(x) ? x.trim() : null;
const GL = /\[\[([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]\]/g;

function checkReading(t, lang) {
  const minWords = lang === 'en' ? 100 : 50;
  if (!t || !clean(t.title, 120) || !Array.isArray(t.paras) || t.paras.length < 2 || t.paras.length > 4) return null;
  const paras = t.paras.map(p => typeof p === 'string' ? p.trim() : '').filter(Boolean);
  if (paras.length !== t.paras.length) return null;
  const text = paras.join(' ');
  const glossN = (text.match(GL) || []).length;
  const words = text.replace(GL, '$1').split(/\s+/).length;
  if (glossN < 4 || words < minWords || words > 420) return null;
  const qs = (Array.isArray(t.qs) ? t.qs : []).filter(q => Array.isArray(q) && q.length === 4 && typeof q[0] === 'string' && Array.isArray(q[1]) && q[1].length >= 3 && q[1].length <= 4 &&
    q[1].every(o => typeof o === 'string' && o) && Number.isInteger(q[2]) && q[2] >= 0 && q[2] < q[1].length && typeof q[3] === 'string');
  if (qs.length < 3) return null;
  return { id: `r-ai-${lang}-${today.replaceAll('-', '')}`, level: String(t.level || (lang === 'en' ? enLevel : deLevel)).slice(0, 8), title: t.title.trim(), minutes: Math.max(1, Math.round(words / 130)), paras, qs: qs.slice(0, 4) };
}

async function makeEnglish() {
  const have = [...known.en].slice(-400).join(', ');
  const j = await ask(`You create original study material for a Turkish-speaking learner of English preparing for IELTS/TOEFL (level ${enLevel}). Today's topic: "${topic}".
Return ONLY JSON: {"words":[{"word":"","pos":"verb|noun|adjective|adverb","def":"simple English definition","tr":"Turkish meaning","ex":"one natural example sentence"}],
"reading":{"title":"","level":"B2 or C1","paras":["..."],"qs":[["question",["a","b","c","d"],correctIndex0to3,"short reason quoting the text"]]},
"dict":["sentence","sentence"]}
Rules: exactly 8 useful ACADEMIC words (single words, base form, lower case, no | character, none of these: ${have}); reading = 3 short paragraphs, 150-220 words, factual, original; mark 6-8 harder words inside the paragraphs as [[word as written|Turkish meaning]] (double square brackets, exactly that format); exactly 4 multiple-choice questions with 4 options each; dict = 2 clear sentences of 10-18 words, no abbreviations. Never invent statistics or quote real people. Turkish must be natural.`);
  if (!j) return 0;
  let added = 0;
  for (const w of (Array.isArray(j.words) ? j.words : [])) {
    const word = clean(w && w.word, 40), pos = clean(w && w.pos, 20), def = clean(w && w.def), tr = clean(w && w.tr), ex = clean(w && w.ex, 400);
    if (!word || !pos || !def || !tr || !ex || known.en.has(word.toLowerCase()) || /\s/.test(word)) continue;
    known.en.add(word.toLowerCase()); data.en.words.push({ word, pos, def, tr, ex }); added++;
  }
  const r = checkReading(j.reading, 'en'); if (r && !data.en.readings.some(x => x.id === r.id)) { data.en.readings.push(r); added++; }
  for (const d of (Array.isArray(j.dict) ? j.dict : [])) { const s = clean(d, 250); if (s && !data.en.dict.includes(s)) { data.en.dict.push(s); added++; } }
  return added;
}

async function makeGerman() {
  const have = [...known.de].slice(-400).join(', ');
  const j = await ask(`You create original study material for a Turkish-speaking learner of German (CEFR ${deLevel}). Today's topic: "${topic}" (translate the idea to everyday German).
Return ONLY JSON: {"words":[{"art":"der|die|das or empty for verbs/others","word":"","forms":"plural for nouns; for verbs 'er/sie ...t, ...te, hat/ist ge...t'; empty for others","tr":"Turkish meaning","ex":"one natural example sentence"}],
"reading":{"title":"","level":"${deLevel.split('-')[1]}","paras":["..."],"qs":[["Frage",["a","b","c"],correctIndex,"short reason quoting the text"]]},
"dict":["Satz","Satz"]}
Rules: exactly 8 useful words at this level (nouns in singular with the correct article, verbs in the infinitive, no | character, none of these: ${have}); reading = 2-3 short paragraphs, 80-150 words, correct natural German at this level; mark 5-7 words inside the paragraphs as [[word as written|Turkish meaning]] and for nouns [[Noun as written|Turkish meaning|der/die/das]] and for inflected verbs [[form as written|Turkish meaning|=infinitive]]; exactly 3-4 multiple-choice questions in German with 3 options each; dict = 2 clear sentences of 8-14 words. Be careful with noun genders and plurals; if unsure of a gender, choose a different word.`);
  if (!j) return 0;
  let added = 0;
  for (const w of (Array.isArray(j.words) ? j.words : [])) {
    const word = clean(w && w.word, 40), tr = clean(w && w.tr), ex = clean(w && w.ex, 400);
    const art = ['der', 'die', 'das'].includes(w && w.art) ? w.art : '';
    const forms = w && typeof w.forms === 'string' && !/[|\n]/.test(w.forms) ? w.forms.trim().slice(0, 120) : '';
    if (!word || !tr || !ex || /\s/.test(word) || known.de.has(word.toLowerCase())) continue;
    if (!art && !forms && /^[A-ZÄÖÜ]/.test(word)) continue;           // capitalised word without an article: probably a noun, skip
    known.de.add(word.toLowerCase()); data.de.words.push({ art, word, forms, tr, ex }); added++;
  }
  const r = checkReading(j.reading, 'de'); if (r && !data.de.readings.some(x => x.id === r.id)) { data.de.readings.push(r); added++; }
  for (const d of (Array.isArray(j.dict) ? j.dict : [])) { const s = clean(d, 250); if (s && !data.de.dict.includes(s)) { data.de.dict.push(s); added++; } }
  return added;
}

const a = await makeEnglish(), b = await makeGerman();
console.log(`English +${a}, Deutsch +${b}, topic: ${topic}`);
if (a + b === 0) { console.error('Hiçbir şey eklenemedi.'); process.exit(1); }
for (const m of ['en', 'de']) { data[m].readings = data[m].readings.slice(-60); data[m].dict = data[m].dict.slice(-120); data[m].words = data[m].words.slice(-3000); }
data.updated = today;
writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
