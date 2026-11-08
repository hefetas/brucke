// Sınav hedefi ve deneme kayıtları için veritabanı erişimi (tarayıcıdan; RLS kullanıcıya göre süzer).

import type { Db } from './db.ts';
import type { AttemptLite, ExamKind, ExamSection, GoetheLevel } from './exam.ts';

export interface ExamSettings {
  exam: ExamKind;
  target_band: number | null;
  goethe_level: GoetheLevel | null;
  exam_date: string | null;
}

export async function loadSettings(db: Db, userId: string, lang: string): Promise<ExamSettings | null> {
  const { data, error } = await db
    .from('exam_settings')
    .select('exam, target_band, goethe_level, exam_date')
    .eq('user_id', userId)
    .eq('language_code', lang)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as ExamSettings;
  return { ...d, target_band: d.target_band === null ? null : Number(d.target_band) };
}

export async function saveSettings(db: Db, userId: string, lang: string, s: ExamSettings): Promise<void> {
  const { error } = await db.from('exam_settings').upsert({ user_id: userId, language_code: lang, ...s }, { onConflict: 'user_id,language_code' });
  if (error) throw error;
}

export async function loadAttempts(db: Db, userId: string, lang: string, limit = 500): Promise<AttemptLite[]> {
  const { data, error } = await db
    .from('exam_attempts')
    .select('section, item_id, level, score_pct, band, detail, created_at')
    .eq('user_id', userId)
    .eq('language_code', lang)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as AttemptLite[]).map((a) => ({ ...a, score_pct: Number(a.score_pct), band: a.band === null ? null : Number(a.band) }));
}

export interface NewAttempt {
  exam: ExamKind;
  section: ExamSection;
  itemId: string;
  level?: string | null;
  scorePct: number;
  band?: number | null;
  raw?: number | null;
  total?: number | null;
  seconds?: number;
  detail?: Record<string, unknown>;
}

export async function saveAttempt(db: Db, userId: string, lang: string, a: NewAttempt): Promise<void> {
  const { error } = await db.from('exam_attempts').insert({
    user_id: userId,
    language_code: lang,
    exam: a.exam,
    section: a.section,
    item_id: a.itemId,
    level: a.level ?? null,
    score_pct: Math.max(0, Math.min(100, Math.round(a.scorePct * 100) / 100)),
    band: a.band ?? null,
    raw: a.raw ?? null,
    total: a.total ?? null,
    seconds: a.seconds ?? null,
    detail: a.detail ?? {},
  });
  if (error) throw error;
}
