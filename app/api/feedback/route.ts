import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getFeedback, type FeedbackConfig, type FeedbackRequest, type FetchLike } from '@/lib/feedback';
import type { SpeakingTask, WritingTask } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const timedFetch: FetchLike = async (url, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

function config(): FeedbackConfig {
  return {
    geminiKey: process.env.GEMINI_API_KEY || undefined,
    geminiModel: process.env.GEMINI_MODEL || undefined,
    groqKey: process.env.GROQ_API_KEY || undefined,
    groqModel: process.env.GROQ_MODEL || undefined,
    ollamaUrl: process.env.OLLAMA_URL || undefined,
    ollamaModel: process.env.OLLAMA_MODEL || undefined,
  };
}

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }
  const kind = body.kind === 'speaking' || body.kind === 'writing' ? body.kind : null;
  const languageCode = typeof body.languageCode === 'string' ? body.languageCode : '';
  const taskSlug = typeof body.taskSlug === 'string' ? body.taskSlug : '';
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 4000) : '';
  if (!kind || !languageCode || !taskSlug) return NextResponse.json({ error: 'Eksik alan' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'Metin boş' }, { status: 400 });

  // Görev bilgisini istemciden değil veritabanından al
  const table = kind === 'speaking' ? 'speaking_tasks' : 'writing_tasks';
  const [taskRes, langRes, levelRes] = await Promise.all([
    supabase.from(table).select('*').eq('language_code', languageCode).eq('slug', taskSlug).maybeSingle(),
    supabase.from('languages').select('name_tr').eq('code', languageCode).maybeSingle(),
    supabase.from('user_languages').select('*').eq('user_id', auth.user.id).eq('language_code', languageCode).eq('role', 'target').maybeSingle(),
  ]);
  const task = taskRes.data as (SpeakingTask & WritingTask) | null;
  if (!task) return NextResponse.json({ error: 'Görev bulunamadı' }, { status: 404 });

  const level = (levelRes.data as Record<string, string> | null)?.[`level_${kind}`] ?? task.cefr_level;
  const req: FeedbackRequest = {
    kind,
    languageName: (langRes.data as { name_tr: string } | null)?.name_tr ?? languageCode,
    cefrLevel: level,
    taskPrompt: `${task.title_tr}: ${task.prompt_tr}`,
    targetPhrases: task.target_phrases ?? [],
    text,
    minWords: kind === 'writing' ? task.min_words : undefined,
    maxWords: kind === 'writing' ? task.max_words : undefined,
  };

  // Günlük yapay zekâ sınırı (son 24 saatte yapay zekâyla işlenen istek sayısı)
  const limit = Number(process.env.FEEDBACK_DAILY_LIMIT || 30);
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase
    .from('task_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
    .in('provider', ['gemini', 'groq', 'ollama'])
    .gte('created_at', since);
  const limited = (count ?? 0) >= limit;

  const outcome = await getFeedback(req, limited ? {} : config(), timedFetch);

  const durationSec = typeof body.durationSec === 'number' ? Math.round(body.durationSec) : null;
  const { data: attempt } = await supabase
    .from('task_attempts')
    .insert({
      user_id: auth.user.id,
      language_code: languageCode,
      lesson_id: null,
      task_type: kind,
      task_slug: taskSlug,
      duration_sec: durationSec,
      word_count: text.split(/\s+/).length,
      transcript: kind === 'speaking' ? text : null,
      submission_text: kind === 'writing' ? text : null,
      keep_audio: body.keepAudio === true,
      feedback: outcome.feedback,
      provider: outcome.provider,
      status: 'done',
    })
    .select('id')
    .single();

  return NextResponse.json({
    feedback: outcome.feedback,
    provider: outcome.provider,
    limited,
    attemptId: attempt?.id ?? null,
  });
}
