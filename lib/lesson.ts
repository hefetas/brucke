// Bugünün dersini oluşturur (yoksa) ve seri bilgisini hesaplar.

import { addDays, countDue, levelsOf, localDate, weekdayOf, type AppState, type Db } from './db.ts';
import { cefrIndex, weakSkills, type Cefr, type ProgressEntry, type Skill } from './levels.ts';
import { buildPlan, pickContent, weakGrammarOf, type BlockType, type PlanMinutes } from './planner.ts';
import type { LessonContentRow, LessonRow } from './types.ts';

export interface TodayLesson {
  lesson: LessonRow;
  blocks: LessonContentRow[];
  created: boolean;
}

const TABLE: Partial<Record<BlockType, string>> = {
  listening: 'listening_contents',
  reading: 'reading_contents',
  grammar: 'grammar_topics',
  speaking: 'speaking_tasks',
  writing: 'writing_tasks',
};
const SKILL_OF: Partial<Record<BlockType, Skill>> = {
  listening: 'listening', reading: 'reading', grammar: 'grammar', speaking: 'speaking', writing: 'writing',
};

interface Pick {
  slug: string;
  title: string;
  cefrLevel: Cefr;
  topics: string[];
}

async function loadCatalog(db: Db, type: BlockType, lang: string): Promise<Pick[]> {
  const table = TABLE[type];
  if (!table) return [];
  const cols = type === 'grammar' ? 'slug, title_tr, cefr_level' : type === 'speaking' || type === 'writing'
    ? 'slug, title_tr, cefr_level, topics' : 'slug, title, cefr_level, topics';
  const { data } = await db.from(table).select(cols).eq('language_code', lang);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    slug: r.slug as string,
    title: (r.title ?? r.title_tr) as string,
    cefrLevel: r.cefr_level as Cefr,
    topics: (r.topics as string[] | undefined) ?? [],
  }));
}

export async function loadProgressBySkill(db: Db, userId: string, lang: string) {
  const { data } = await db
    .from('user_progress')
    .select('skill, score, content_cefr_level, occurred_at, content_type, content_slug')
    .eq('user_id', userId)
    .eq('language_code', lang)
    .order('occurred_at', { ascending: false })
    .limit(400);
  const rows = (data ?? []) as {
    skill: Skill; score: number; content_cefr_level: Cefr | null; occurred_at: string; content_type: string | null; content_slug: string | null;
  }[];
  const bySkill: Partial<Record<Skill, ProgressEntry[]>> = {};
  const done = new Set<string>();
  for (const r of rows) {
    (bySkill[r.skill] ??= []).push({
      score: Number(r.score),
      contentLevel: r.content_cefr_level ?? 'A1',
      occurredAt: r.occurred_at,
    });
    if (r.content_type && r.content_slug) done.add(`${r.content_type}:${r.content_slug}`);
  }
  return { bySkill, done, rows };
}

export async function ensureTodayLesson(db: Db, app: AppState): Promise<TodayLesson | null> {
  const ul = app.active;
  if (!ul) return null;
  const lang = ul.language_code;
  const today = localDate(app.profile.timezone);

  const load = async () => {
    const { data: lesson } = await db
      .from('lessons').select('*').eq('user_id', app.userId).eq('language_code', lang).eq('lesson_date', today).maybeSingle();
    if (!lesson) return null;
    const { data: blocks } = await db.from('lesson_contents').select('*').eq('lesson_id', lesson.id).order('position');
    return { lesson: lesson as LessonRow, blocks: (blocks ?? []) as LessonContentRow[] };
  };

  const existing = await load();
  if (existing) return { ...existing, created: false };

  const levels = levelsOf(ul);
  const [dueCount, progress] = await Promise.all([countDue(db, app.userId, lang), loadProgressBySkill(db, app.userId, lang)]);
  const plan = buildPlan({
    minutes: app.profile.daily_minutes as PlanMinutes,
    weekday: weekdayOf(today),
    weakSkills: weakSkills(progress.bySkill),
    dueCount,
  });

  // Zorlanılan dilbilgisi konuları (son denemesi düşük) günlük planda öne alınır.
  const weakGrammar = weakGrammarOf(progress.rows).map((w) => w.slug);

  const catalogs: Partial<Record<BlockType, Pick[]>> = {};
  const used = new Set<string>();
  const rows: Omit<LessonContentRow, 'id' | 'lesson_id' | 'actual_seconds' | 'status' | 'result'>[] = [];
  let spare = 0;
  for (const b of plan) {
    if (b.type === 'review' || b.type === 'real_world' || b.type === 'free') {
      rows.push({ step: b.step, position: 0, content_type: b.type, content_slug: null, title: b.title, planned_seconds: b.seconds });
      continue;
    }
    catalogs[b.type] ??= await loadCatalog(db, b.type, lang);
    const skill = SKILL_OF[b.type] as Skill;
    const doneSlugs = [...progress.done].filter((k) => k.startsWith(`${b.type}:`)).map((k) => k.slice(b.type.length + 1));
    const candidates = (catalogs[b.type] ?? []).filter((c) => !used.has(`${b.type}:${c.slug}`));
    const chosen = pickContent(
      candidates,
      { level: levels[skill], interests: app.profile.interests, doneSlugs, weakSlugs: b.type === 'grammar' ? weakGrammar : [] },
      cefrIndex,
    );
    if (!chosen) {
      spare += b.seconds;
      continue;
    }
    used.add(`${b.type}:${chosen.slug}`);
    rows.push({ step: b.step, position: 0, content_type: b.type, content_slug: chosen.slug, title: chosen.title, planned_seconds: b.seconds });
  }
  if (spare) {
    const review = rows.find((r) => r.content_type === 'review');
    if (review) review.planned_seconds += spare;
  }
  rows.forEach((r, i) => (r.position = i + 1));

  const ins = await db
    .from('lessons')
    .insert({ user_id: app.userId, language_code: lang, lesson_date: today, plan_minutes: app.profile.daily_minutes })
    .select('*')
    .single();
  if (ins.error) {
    // Başka bir sekme aynı anda oluşturmuş olabilir
    const again = await load();
    return again ? { ...again, created: false } : null;
  }
  const lesson = ins.data as LessonRow;
  const { data: blocks, error } = await db
    .from('lesson_contents')
    .insert(rows.map((r) => ({ ...r, lesson_id: lesson.id, user_id: app.userId })))
    .select('*')
    .order('position');
  if (error) throw error;
  return { lesson, blocks: (blocks ?? []) as LessonContentRow[], created: true };
}

/** Bugün hedef karşılandıysa bugünün serisi; değilse dünün serisi (hâlâ devam ediyorsa). */
export async function currentStreak(db: Db, userId: string, tz: string): Promise<{ length: number; todayMet: boolean }> {
  const today = localDate(tz);
  const { data } = await db
    .from('daily_streaks')
    .select('activity_date, goal_met, freeze_used, streak_length')
    .eq('user_id', userId)
    .gte('activity_date', addDays(today, -2))
    .order('activity_date', { ascending: false });
  const rows = (data ?? []) as { activity_date: string; goal_met: boolean; freeze_used: boolean; streak_length: number }[];
  const t = rows.find((r) => r.activity_date === today);
  if (t?.goal_met) return { length: t.streak_length, todayMet: true };
  const y = rows.find((r) => r.activity_date === addDays(today, -1));
  if (y && (y.goal_met || y.freeze_used)) return { length: y.streak_length, todayMet: false };
  return { length: 0, todayMet: false };
}

export const BLOCK_LINK: Record<LessonContentRow['content_type'], (slug: string | null, lc: string) => string> = {
  listening: (s, lc) => `/listen/${s}?lc=${lc}`,
  reading: (s, lc) => `/read/${s}?lc=${lc}`,
  grammar: (s, lc) => `/grammar/${s}?lc=${lc}`,
  speaking: (s, lc) => `/speak/${s}?lc=${lc}`,
  writing: (s, lc) => `/write/${s}?lc=${lc}`,
  review: (_s, lc) => `/review?lc=${lc}`,
  real_world: () => '/lesson/today',
  free: () => '/library',
};
