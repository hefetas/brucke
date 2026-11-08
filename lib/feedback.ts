// Geri bildirim: Gemini → Groq → Ollama → kural tabanlı yedek. Her sağlayıcı aynı JSON şemasını döndürmek zorundadır.

import { countWords, usedPhrases } from './align.ts';

export type ErrorType =
  | 'tense' | 'preposition' | 'article' | 'agreement' | 'word_order'
  | 'word_choice' | 'spelling' | 'naturalness' | 'unclear_speech' | 'other';

export const ERROR_TYPES: readonly ErrorType[] = [
  'tense', 'preposition', 'article', 'agreement', 'word_order',
  'word_choice', 'spelling', 'naturalness', 'unclear_speech', 'other',
];

export interface FeedbackError {
  type: ErrorType;
  original: string;
  corrected: string;
  explanation_tr: string;
}

export interface Feedback {
  score: number; // 0-100
  cefr_estimate: string;
  summary_tr: string;
  strengths_tr: string[];
  errors: FeedbackError[];
  corrected_text: string;
  natural_version: string;
  used_phrases: string[];
  next_focus_tr: string;
}

export interface FeedbackRequest {
  kind: 'speaking' | 'writing';
  languageName: string; // ör. "İngilizce"
  cefrLevel: string;
  taskPrompt: string;
  targetPhrases: string[];
  text: string; // yazı ya da konuşma dökümü
  minWords?: number;
  maxWords?: number;
}

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const JSON_SHAPE = `{
  "score": <0-100 tam sayı>,
  "cefr_estimate": "<A1|A2|B1|B2|C1|C2>",
  "summary_tr": "<Türkçe 1-2 cümle genel değerlendirme>",
  "strengths_tr": ["<Türkçe güçlü yön>", ...],
  "errors": [{"type": "<tense|preposition|article|agreement|word_order|word_choice|spelling|naturalness|unclear_speech|other>", "original": "<hatalı parça>", "corrected": "<doğrusu>", "explanation_tr": "<Türkçe kısa açıklama>"}],
  "corrected_text": "<tüm metnin düzeltilmiş hali>",
  "natural_version": "<daha doğal söylenişi>",
  "used_phrases": ["<kullanılan hedef ifadeler>"],
  "next_focus_tr": "<Türkçe tek cümle: sıradaki odak>"
}`;

export function buildPrompt(req: FeedbackRequest): { system: string; user: string } {
  const system = [
    `Sen sabırlı bir ${req.languageName} öğretmenisin. Öğrencinin ana dili Türkçe, hedef seviyesi ${req.cefrLevel}.`,
    'Yalnızca geçerli JSON döndür; başka metin, açıklama veya kod bloğu yazma.',
    'Açıklamaları Türkçe yaz, düzeltmeleri hedef dilde ver. Hata uydurma: metinde olmayan hatayı listeleme.',
    'En fazla 6 hata listele, en önemlilerini seç. Seviyeye uygun, cesaretlendirici ama dürüst ol.',
    req.kind === 'speaking'
      ? 'Metin konuşma tanıma çıktısıdır; noktalama ve büyük/küçük harf hatalarını yok say.'
      : 'Metin öğrencinin yazısıdır.',
    `JSON şeması:\n${JSON_SHAPE}`,
  ].join('\n');
  const user = [
    `Görev: ${req.taskPrompt}`,
    req.targetPhrases.length ? `Hedef ifadeler: ${req.targetPhrases.join(', ')}` : '',
    `Öğrenci metni:\n"""\n${req.text}\n"""`,
  ].filter(Boolean).join('\n');
  return { system, user };
}

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Sağlayıcı çıktısını doğrular; şemaya uymuyorsa null döner (bir sonraki sağlayıcıya geçilir). */
export function parseFeedback(raw: unknown): Feedback | null {
  let data: unknown = raw;
  if (isStr(raw)) {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      data = JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const score = typeof d.score === 'number' ? d.score : Number(d.score);
  if (!Number.isFinite(score)) return null;
  if (!isStr(d.summary_tr) || !isStr(d.corrected_text)) return null;
  const cefr = isStr(d.cefr_estimate) && CEFR.includes(d.cefr_estimate.toUpperCase()) ? d.cefr_estimate.toUpperCase() : null;
  if (!cefr) return null;
  if (!Array.isArray(d.errors)) return null;
  const errors: FeedbackError[] = [];
  for (const e of d.errors.slice(0, 6)) {
    if (!e || typeof e !== 'object') return null;
    const r = e as Record<string, unknown>;
    if (!isStr(r.original) || !isStr(r.corrected) || !isStr(r.explanation_tr)) return null;
    const type = ERROR_TYPES.includes(r.type as ErrorType) ? (r.type as ErrorType) : 'other';
    errors.push({ type, original: r.original, corrected: r.corrected, explanation_tr: r.explanation_tr });
  }
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter(isStr) : []);
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    cefr_estimate: cefr,
    summary_tr: d.summary_tr,
    strengths_tr: strArr(d.strengths_tr).slice(0, 5),
    errors,
    corrected_text: d.corrected_text,
    natural_version: isStr(d.natural_version) ? d.natural_version : d.corrected_text,
    used_phrases: strArr(d.used_phrases),
    next_focus_tr: isStr(d.next_focus_tr) ? d.next_focus_tr : '',
  };
}

/** Yapay zekâ yokken: sayılabilir şeylere dayalı dürüst ve sınırlı geri bildirim. */
export function ruleBasedFeedback(req: FeedbackRequest): Feedback {
  const words = countWords(req.text);
  const used = usedPhrases(req.text, req.targetPhrases);
  const min = req.minWords ?? 0;
  const max = req.maxWords ?? Infinity;
  const phraseRatio = req.targetPhrases.length ? used.length / req.targetPhrases.length : 1;
  const lengthOk = words >= min && words <= max;
  let score = 40 + Math.round(phraseRatio * 35) + (lengthOk ? 20 : 0);
  if (words === 0) score = 0;
  score = Math.min(95, score);
  const strengths: string[] = [];
  if (used.length) strengths.push(`Hedef ifadelerden ${used.length} tanesini kullandın: ${used.join(', ')}.`);
  if (lengthOk && words > 0) strengths.push('Uzunluk hedefine uydun.');
  const missing = req.targetPhrases.filter((p) => !used.includes(p));
  let next = 'Yapay zekâ geri bildirimi şu an kapalı; metnini bir kez yüksek sesle okuyup kendin düzelt.';
  if (missing.length) next = `Bir dahaki sefere şunları da kullanmayı dene: ${missing.slice(0, 3).join(', ')}.`;
  else if (words < min) next = `Metin kısa kaldı: en az ${min} kelime hedefle.`;
  else if (words > max) next = `Metin uzun kaldı: en fazla ${max} kelime hedefle.`;
  return {
    score,
    cefr_estimate: CEFR.includes(req.cefrLevel) ? req.cefrLevel : 'A1',
    summary_tr: `${words} kelime yazdın/söyledin. Dilbilgisi hataları için yapay zekâ anahtarı tanımlanmadığından yalnızca uzunluk ve hedef ifade kullanımı kontrol edildi.`,
    strengths_tr: strengths,
    errors: [],
    corrected_text: req.text,
    natural_version: req.text,
    used_phrases: used,
    next_focus_tr: next,
  };
}

// ── Sağlayıcılar ────────────────────────────────────────────────────────────

export interface FeedbackConfig {
  geminiKey?: string;
  geminiModel?: string;
  groqKey?: string;
  groqModel?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface Provider {
  name: 'gemini' | 'groq' | 'ollama';
  call(system: string, user: string, fetchImpl: FetchLike): Promise<string>;
}

export function listProviders(cfg: FeedbackConfig): Provider[] {
  const out: Provider[] = [];
  if (cfg.geminiKey) {
    const model = cfg.geminiModel || 'gemini-2.0-flash';
    out.push({
      name: 'gemini',
      async call(system, user, f) {
        const res = await f(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.geminiKey as string },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: 'user', parts: [{ text: user }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
            }),
          },
        );
        if (!res.ok) throw new Error(`gemini ${res.status}`);
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('gemini boş yanıt');
        return text;
      },
    });
  }
  if (cfg.groqKey) {
    const model = cfg.groqModel || 'llama-3.3-70b-versatile';
    out.push({
      name: 'groq',
      async call(system, user, f) {
        const res = await f('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.groqKey}` },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          }),
        });
        if (!res.ok) throw new Error(`groq ${res.status}`);
        const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = j.choices?.[0]?.message?.content;
        if (!text) throw new Error('groq boş yanıt');
        return text;
      },
    });
  }
  if (cfg.ollamaUrl) {
    const base = cfg.ollamaUrl.replace(/\/+$/, '');
    const model = cfg.ollamaModel || 'llama3.1';
    out.push({
      name: 'ollama',
      async call(system, user, f) {
        const res = await f(`${base}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            format: 'json',
            options: { temperature: 0.2 },
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          }),
        });
        if (!res.ok) throw new Error(`ollama ${res.status}`);
        const j = (await res.json()) as { message?: { content?: string } };
        if (!j.message?.content) throw new Error('ollama boş yanıt');
        return j.message.content;
      },
    });
  }
  return out;
}

export interface FeedbackOutcome {
  feedback: Feedback;
  provider: Provider['name'] | 'rules';
  attempts: { provider: string; error: string }[];
}

/** Sağlayıcıları sırayla dener; her biri bozuk çıktı verirse bir sonrakine geçer, sonunda kural tabanlı yedek. */
export async function getFeedback(
  req: FeedbackRequest,
  cfg: FeedbackConfig,
  fetchImpl: FetchLike,
): Promise<FeedbackOutcome> {
  const attempts: FeedbackOutcome['attempts'] = [];
  if (countWords(req.text) === 0) {
    return { feedback: ruleBasedFeedback(req), provider: 'rules', attempts };
  }
  const { system, user } = buildPrompt(req);
  for (const p of listProviders(cfg)) {
    try {
      const raw = await p.call(system, user, fetchImpl);
      const parsed = parseFeedback(raw);
      if (!parsed) {
        attempts.push({ provider: p.name, error: 'şemaya uymayan çıktı' });
        continue;
      }
      parsed.used_phrases = usedPhrases(req.text, req.targetPhrases); // doğrulamayı sunucuda biz yaparız
      return { feedback: parsed, provider: p.name, attempts };
    } catch (e) {
      attempts.push({ provider: p.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { feedback: ruleBasedFeedback(req), provider: 'rules', attempts };
}

/** Düz JSON isteği (ör. sözlük arama) için aynı zincir. */
export async function askJson(
  system: string,
  user: string,
  cfg: FeedbackConfig,
  fetchImpl: FetchLike,
): Promise<unknown | null> {
  for (const p of listProviders(cfg)) {
    try {
      const raw = await p.call(system, user, fetchImpl);
      return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      /* sıradaki sağlayıcı */
    }
  }
  return null;
}
