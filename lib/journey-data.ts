// Yol haritası için veritabanı okuma/yazma (tarayıcıdan çağrılır; RLS kullanıcıya göre filtreler).

import { countDue, type Db } from './db.ts';
import type { Cefr } from './levels.ts';
import {
  attemptStats, buildJourney, journeyState, normalizeRange,
  type AttemptStat, type CatalogItem, type JourneyState, type JourneyStep, type StepKind,
} from './journey.ts';

export interface PathRow {
  id: string;
  language_code: string;
  start_level: Cefr;
  target_level: Cefr;
  counted_since: string | null;
}

const SOURCES: { kind: StepKind; table: string; cols: string }[] = [
  { kind: 'grammar', table: 'grammar_topics', cols: 'slug, title_tr, cefr_level, order_index' },
  { kind: 'listening', table: 'listening_contents', cols: 'slug, title, cefr_level' },
  { kind: 'reading', table: 'reading_contents', cols: 'slug, title, cefr_level' },
  { kind: 'speaking', table: 'speaking_tasks', cols: 'slug, title_tr, cefr_level' },
  { kind: 'writing', table: 'writing_tasks', cols: 'slug, title_tr, cefr_level' },
];

export async function loadCatalog(db: Db, lang: string): Promise<CatalogItem[]> {
  const parts = await Promise.all(
    SOURCES.map(async (s) => {
      const { data, error } = await db.from(s.table).select(s.cols).eq('language_code', lang);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(
        (r): CatalogItem => ({
          kind: s.kind,
          slug: r.slug as string,
          title: (r.title ?? r.title_tr) as string,
          level: r.cefr_level as Cefr,
          order: Number(r.order_index ?? 0),
        }),
      );
    }),
  );
  return parts.flat();
}

export async function loadPath(db: Db, userId: string, lang: string): Promise<PathRow | null> {
  const { data, error } = await db
    .from('learning_paths')
    .select('id, language_code, start_level, target_level, counted_since')
    .eq('user_id', userId)
    .eq('language_code', lang)
    .maybeSingle();
  if (error) throw error;
  return (data as PathRow | null) ?? null;
}

/** Aralığı kaydeder (varsa günceller). İlerleme sayımının başlangıcı korunur. */
export async function savePath(db: Db, userId: string, lang: string, start: Cefr, target: Cefr): Promise<void> {
  const r = normalizeRange(start, target);
  const { error } = await db
    .from('learning_paths')
    .upsert({ user_id: userId, language_code: lang, start_level: r.start, target_level: r.target }, { onConflict: 'user_id,language_code' });
  if (error) throw error;
}

/** Baştan başla: bu andan önceki çalışmalar yolculuğa sayılmaz. */
export async function restartPath(db: Db, pathId: string): Promise<void> {
  const { error } = await db.from('learning_paths').update({ counted_since: new Date().toISOString() }).eq('id', pathId);
  if (error) throw error;
}

export async function deletePath(db: Db, pathId: string): Promise<void> {
  const { error } = await db.from('learning_paths').delete().eq('id', pathId);
  if (error) throw error;
}

export interface LoadedJourney {
  path: PathRow;
  steps: JourneyStep[];
  state: JourneyState;
  /** Adım anahtarı → en iyi puan ve deneme sayısı */
  scores: Map<string, AttemptStat>;
  due: number;
}

export async function loadJourney(db: Db, userId: string, lang: string): Promise<LoadedJourney | null> {
  const path = await loadPath(db, userId, lang);
  if (!path) return null;
  const [catalog, progress, due] = await Promise.all([
    loadCatalog(db, lang),
    db
      .from('user_progress')
      .select('content_type, content_slug, score, occurred_at')
      .eq('user_id', userId)
      .eq('language_code', lang)
      .not('content_slug', 'is', null)
      .order('occurred_at', { ascending: false })
      .limit(3000),
    countDue(db, userId, lang),
  ]);
  if (progress.error) throw progress.error;
  const rows = (progress.data ?? []) as { content_type: string | null; content_slug: string | null; score: number; occurred_at: string }[];
  const steps = buildJourney(catalog, path.start_level, path.target_level);
  const stats = attemptStats(rows, path.counted_since);
  return { path, steps, scores: stats, state: journeyState(steps, stats, path.start_level, path.target_level, due), due };
}
