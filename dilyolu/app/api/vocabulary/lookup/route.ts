import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { askJson, type FeedbackConfig, type FetchLike } from '@/lib/feedback';

export const runtime = 'nodejs';

const timedFetch: FetchLike = async (url, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

export async function GET(request: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 });

  const url = new URL(request.url);
  const word = (url.searchParams.get('word') ?? '').trim().slice(0, 60);
  const lang = url.searchParams.get('lang') ?? '';
  if (!word || !lang) return NextResponse.json({ error: 'Kelime ve dil gerekli' }, { status: 400 });

  // Önce kendi sözlüğümüzde ara
  const { data: hit } = await supabase
    .from('vocabulary').select('lemma, part_of_speech, meaning_tr, example, example_tr')
    .eq('language_code', lang).ilike('lemma', word).limit(1).maybeSingle();
  if (hit) {
    return NextResponse.json({
      entry: { lemma: hit.lemma, pos: hit.part_of_speech, meaning_tr: hit.meaning_tr, example: hit.example ?? undefined, example_tr: hit.example_tr ?? undefined },
      source: 'dictionary',
    });
  }

  const cfg: FeedbackConfig = {
    geminiKey: process.env.GEMINI_API_KEY || undefined,
    geminiModel: process.env.GEMINI_MODEL || undefined,
    groqKey: process.env.GROQ_API_KEY || undefined,
    groqModel: process.env.GROQ_MODEL || undefined,
    ollamaUrl: process.env.OLLAMA_URL || undefined,
    ollamaModel: process.env.OLLAMA_MODEL || undefined,
  };
  if (!cfg.geminiKey && !cfg.groqKey && !cfg.ollamaUrl) {
    return NextResponse.json({ error: 'Bu kelime sözlükte yok ve yapay zekâ anahtarı tanımlı değil. Kendi kartını elle yazabilirsin.' }, { status: 404 });
  }
  const { data: language } = await supabase.from('languages').select('name_tr').eq('code', lang).maybeSingle();
  const name = (language as { name_tr: string } | null)?.name_tr ?? lang;
  const ai = (await askJson(
    `Sen bir ${name}-Türkçe sözlüksün. Yalnızca JSON döndür: {"lemma": "<sözlük biçimi; Almanca isimlerde artikelle>", "pos": "<noun|verb|adj|adv|prep|other>", "meaning_tr": "<kısa Türkçe karşılık>", "example": "<A2-B1 seviyesinde ${name} örnek cümle>", "example_tr": "<Türkçesi>"}. Kelime geçerli değilse {"error": "geçersiz"} döndür.`,
    `Kelime: ${word}`,
    cfg,
    timedFetch,
  )) as Record<string, unknown> | null;
  if (!ai || ai.error || typeof ai.lemma !== 'string' || typeof ai.meaning_tr !== 'string') {
    return NextResponse.json({ error: 'Kelime bulunamadı.' }, { status: 404 });
  }
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : undefined);
  return NextResponse.json({
    entry: { lemma: s(ai.lemma), pos: s(ai.pos) ?? '', meaning_tr: s(ai.meaning_tr), example: s(ai.example), example_tr: s(ai.example_tr) },
    source: 'ai',
  });
}
