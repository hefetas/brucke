// Tarayıcıdan Supabase'e giden veri katmanı. Tüm tablolarda RLS açık olduğundan her sorgu yalnızca kullanıcının satırlarını görür.

import type { SupabaseClient } from '@supabase/supabase-js';
import { nextReview, type Grade, type SrsCard } from './srs.ts';
import { SKILLS, type Cefr, type Skill } from './levels.ts';
import { addDays, localDate, weekdayOf } from './dates.ts';
import { computeStreak, type StreakRow } from './streak.ts';
import type { CardRow, GlossaryItem, Language, Profile, UserLanguage } from './types.ts';

export type Db = SupabaseClient;

export interface AppState {
  userId: string;
  email: string | null;
  profile: Profile;
  languages: Language[];
  userLangs: UserLanguage[];
  active: UserLanguage | null;
  activeLanguage: Language | null;
}

// ── Tarih yardımcıları (lib/dates.ts) ───────────────────────────────────────

export { localDate, addDays, weekdayOf };

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

// ── Uygulama durumu ────────────────────────────────────────────────────────

export async function loadApp(db: Db): Promise<AppState | null> {
  const { data: auth } = await db.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  let { data: profile } = await db.from('user_profile').select('*').eq('id', user.id).maybeSingle();
  if (!profile) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul';
    const ins = await db.from('user_profile').insert({ id: user.id, timezone: tz }).select('*').single();
    if (ins.error) throw ins.error;
    profile = ins.data;
  }
  const [langs, ul] = await Promise.all([
    db.from('languages').select('*').eq('is_enabled', true).order('code'),
    db.from('user_languages').select('*').eq('user_id', user.id),
  ]);
  if (langs.error) throw langs.error;
  if (ul.error) throw ul.error;
  const languages = (langs.data ?? []) as Language[];
  const userLangs = (ul.data ?? []) as UserLanguage[];
  const active = userLangs.find((u) => u.role === 'target' && u.is_active) ?? null;
  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile as Profile,
    languages,
    userLangs,
    active,
    activeLanguage: active ? languages.find((l) => l.code === active.language_code) ?? null : null,
  };
}

export function levelsOf(ul: UserLanguage): Record<Skill, Cefr> {
  return {
    listening: ul.level_listening,
    reading: ul.level_reading,
    speaking: ul.level_speaking,
    writing: ul.level_writing,
    vocab: ul.level_vocab,
    grammar: ul.level_grammar,
  };
}

export async function setActiveLanguage(db: Db, userId: string, code: string) {
  const r1 = await db.from('user_languages').update({ is_active: false }).eq('user_id', userId).eq('role', 'target');
  if (r1.error) throw r1.error;
  const r2 = await db.from('user_languages').update({ is_active: true }).eq('user_id', userId).eq('role', 'target').eq('language_code', code);
  if (r2.error) throw r2.error;
}

export async function setSkillLevel(db: Db, userId: string, code: string, skill: Skill, level: Cefr) {
  const col = `level_${skill}`;
  const { error } = await db.from('user_languages').update({ [col]: level }).eq('user_id', userId).eq('language_code', code).eq('role', 'target');
  if (error) throw error;
}

// ── Kartlar ────────────────────────────────────────────────────────────────

export function toSrs(row: CardRow): SrsCard {
  return {
    state: row.state,
    step: row.step,
    ease: Number(row.ease),
    intervalDays: row.interval_days,
    dueAt: row.due_at,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    lapses: row.lapses,
    usedInSpeaking: row.used_in_speaking,
    usedInWriting: row.used_in_writing,
    usageBonusGiven: row.usage_bonus_given,
    isLeech: row.is_leech,
  };
}

export async function getDueCards(db: Db, userId: string, lang: string, limit = 50): Promise<CardRow[]> {
  const { data, error } = await db
    .from('user_cards')
    .select('*')
    .eq('user_id', userId)
    .eq('language_code', lang)
    .neq('state', 'suspended')
    .is('deleted_at', null)
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CardRow[];
}

export async function countDue(db: Db, userId: string, lang: string): Promise<number> {
  const { count, error } = await db
    .from('user_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('language_code', lang)
    .neq('state', 'suspended')
    .is('deleted_at', null)
    .lte('due_at', new Date().toISOString());
  if (error) throw error;
  return count ?? 0;
}

interface QueuedReview {
  eventId: string;
  userId: string;
  cardId: string;
  update: Record<string, unknown>;
  review: Record<string, unknown>;
}

const QUEUE_KEY = 'dilyolu.review-queue';

function readQueue(): QueuedReview[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueuedReview[];
  } catch {
    return [];
  }
}
function writeQueue(q: QueuedReview[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* depolama dolu ya da kapalı */
  }
}
export const queuedCount = () => (typeof localStorage === 'undefined' ? 0 : readQueue().length);

async function sendReview(db: Db, q: QueuedReview): Promise<boolean> {
  const upd = await db.from('user_cards').update(q.update).eq('id', q.cardId).eq('user_id', q.userId);
  if (upd.error) return false;
  const ins = await db.from('card_reviews').insert(q.review);
  // 23505: aynı client_event_id daha önce gönderilmiş, yinelenen gönderim sorun değil
  if (ins.error && ins.error.code !== '23505') return false;
  return true;
}

/** Çevrimdışı birikenleri gönderir; başarısızlar kuyrukta kalır. */
export async function flushQueue(db: Db): Promise<number> {
  const queue = readQueue();
  if (!queue.length) return 0;
  const left: QueuedReview[] = [];
  for (const item of queue) {
    if (!(await sendReview(db, item))) left.push(item);
  }
  writeQueue(left);
  return queue.length - left.length;
}

export interface AnswerOutcome {
  card: SrsCard;
  isCorrect: boolean;
  queued: boolean;
}

export async function answerCard(db: Db, userId: string, row: CardRow, grade: Grade, responseMs: number): Promise<AnswerOutcome> {
  const before = toSrs(row);
  const { card, isCorrect } = nextReview(before, grade);
  const update = {
    state: card.state,
    step: card.step,
    ease: card.ease,
    interval_days: card.intervalDays,
    due_at: card.dueAt,
    correct_count: card.correctCount,
    wrong_count: card.wrongCount,
    lapses: card.lapses,
    is_leech: card.isLeech,
    usage_bonus_given: card.usageBonusGiven,
    last_response_ms: Math.round(responseMs),
  };
  const eventId = uuid();
  const review = {
    user_card_id: row.id,
    user_id: userId,
    grade,
    is_correct: isCorrect,
    response_ms: Math.round(responseMs),
    state_before: before.state,
    state_after: card.state,
    interval_before: before.intervalDays,
    interval_after: card.intervalDays,
    ease_before: before.ease,
    ease_after: card.ease,
    due_after: card.dueAt,
    client_event_id: eventId,
  };
  const item: QueuedReview = { eventId, userId, cardId: row.id, update, review };
  const ok = await sendReview(db, item).catch(() => false);
  if (!ok) writeQueue([...readQueue(), item]);
  return { card, isCorrect, queued: !ok };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

function blank(example: string, lemma: string, forms: string[] = []): string | null {
  const bare = lemma.replace(/^(der|die|das)\s+/i, '');
  for (const w of [lemma, bare, ...forms].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^\\p{L}])(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^\\p{L}])`, 'iu');
    if (re.test(example)) return example.replace(re, (_m, pre) => `${pre}_____`);
  }
  return null;
}

export interface WordSource {
  type: string;
  slug: string;
  cefr?: Cefr;
}

/** Kelimeleri sözlüğe ve kullanıcının kartlarına ekler. Yeni oluşturulan kart sayısını döndürür. */
export async function addCardsFromWords(
  db: Db,
  userId: string,
  lang: string,
  words: GlossaryItem[],
  source?: WordSource,
): Promise<number> {
  if (!words.length) return 0;
  let created = 0;
  for (const w of words) {
    const pos = w.pos ?? '';
    const found = await db
      .from('vocabulary')
      .select('id')
      .eq('language_code', lang)
      .eq('lemma', w.lemma)
      .eq('part_of_speech', pos)
      .maybeSingle();
    let vocabId = found.data?.id as string | undefined;
    if (!vocabId) {
      const ins = await db
        .from('vocabulary')
        .insert({
          language_code: lang,
          lemma: w.lemma,
          part_of_speech: pos,
          meaning_tr: w.meaning_tr,
          example: w.example ?? null,
          example_tr: w.example_tr ?? null,
          cefr_level: source?.cefr ?? null,
          source: 'user',
        })
        .select('id')
        .single();
      if (ins.error) continue;
      vocabId = ins.data.id as string;
    }
    const types: { type: string; front: string; back: string }[] = [
      { type: 'word_to_meaning', front: pos ? `${w.lemma} (${pos})` : w.lemma, back: w.example ? `${w.meaning_tr}\n${w.example}` : w.meaning_tr },
      { type: 'meaning_to_word', front: w.meaning_tr, back: w.example ? `${w.lemma}\n${w.example}` : w.lemma },
    ];
    const cloze = w.example ? blank(w.example, w.lemma, w.forms) : null;
    if (cloze && w.example) {
      types.push({ type: 'cloze', front: `${cloze}${w.example_tr ? `\n(${w.example_tr})` : ''}`, back: `${w.example}\n${w.lemma}` });
    }
    const existing = await db.from('user_cards').select('card_type').eq('user_id', userId).eq('vocabulary_id', vocabId).is('deleted_at', null);
    const have = new Set((existing.data ?? []).map((r: { card_type: string }) => r.card_type));
    const rows = types
      .filter((t) => !have.has(t.type))
      .map((t) => ({
        user_id: userId,
        language_code: lang,
        card_type: t.type,
        vocabulary_id: vocabId,
        front: t.front,
        back: t.back,
        context_sentence: w.example ?? null,
        source_content_type: source?.type ?? null,
        source_content_slug: source?.slug ?? null,
      }));
    if (rows.length) {
      const r = await db.from('user_cards').insert(rows);
      if (!r.error) created += rows.length;
    }
  }
  return created;
}

/** Seviyene uygun, henüz kartı olmayan başlangıç kelimelerinden `count` tanesini kartlara ekler. */
export async function addStarterWords(db: Db, userId: string, lang: string, level: Cefr, count = 10): Promise<number> {
  const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const allowed = order.slice(0, order.indexOf(level) + 1);
  const [vocab, mine] = await Promise.all([
    db.from('vocabulary').select('id, lemma, part_of_speech, meaning_tr, example, example_tr, cefr_level, frequency_rank')
      .eq('language_code', lang).eq('source', 'seed').in('cefr_level', allowed).order('frequency_rank', { ascending: true }),
    db.from('user_cards').select('vocabulary_id').eq('user_id', userId).eq('language_code', lang).is('deleted_at', null).not('vocabulary_id', 'is', null),
  ]);
  const have = new Set((mine.data ?? []).map((r: { vocabulary_id: string }) => r.vocabulary_id));
  const pick = ((vocab.data ?? []) as { id: string; lemma: string; part_of_speech: string; meaning_tr: string; example: string | null; example_tr: string | null; cefr_level: Cefr }[])
    .filter((v) => !have.has(v.id))
    .slice(0, count);
  if (!pick.length) return 0;
  return addCardsFromWords(
    db, userId, lang,
    pick.map((v) => ({ lemma: v.lemma, pos: v.part_of_speech, meaning_tr: v.meaning_tr, example: v.example ?? undefined, example_tr: v.example_tr ?? undefined })),
    { type: 'starter', slug: level, cefr: level },
  );
}

export async function addCustomCard(db: Db, userId: string, lang: string, front: string, back: string) {
  const { error } = await db.from('user_cards').insert({
    user_id: userId, language_code: lang, card_type: 'word_to_meaning', front, back,
  });
  if (error) throw error;
}

/** Konuşma/yazmada kullanılan kelimelerin kartlarını işaretler (ilk "İyi" cevapta aralık bonusu için). */
export async function markCardsUsed(db: Db, userId: string, lang: string, phrases: string[], where: 'speaking' | 'writing') {
  if (!phrases.length) return;
  const col = where === 'speaking' ? 'used_in_speaking' : 'used_in_writing';
  const vocab = await db.from('vocabulary').select('id, lemma').eq('language_code', lang).in('lemma', phrases);
  const ids = (vocab.data ?? []).map((v: { id: string }) => v.id);
  if (!ids.length) return;
  await db.from('user_cards').update({ [col]: true }).eq('user_id', userId).in('vocabulary_id', ids);
}

// ── İlerleme, seri, XP, rozet ──────────────────────────────────────────────

export async function logProgress(
  db: Db,
  userId: string,
  e: {
    lang: string;
    skill: Skill;
    activity: 'comprehension' | 'card_review' | 'speaking_task' | 'writing_task' | 'grammar_practice' | 'placement';
    contentType?: string;
    contentSlug?: string;
    lessonId?: string | null;
    level?: Cefr | null;
    score: number;
    durationSec?: number;
  },
) {
  const { error } = await db.from('user_progress').insert({
    user_id: userId,
    language_code: e.lang,
    skill: e.skill,
    activity_type: e.activity,
    content_type: e.contentType ?? null,
    content_slug: e.contentSlug ?? null,
    lesson_id: e.lessonId ?? null,
    content_cefr_level: e.level ?? null,
    score: Math.max(0, Math.min(100, Math.round(e.score * 100) / 100)),
    duration_sec: e.durationSec ?? null,
  });
  if (error) throw error;
}

export async function awardXp(db: Db, userId: string, lang: string, xp: number) {
  if (xp <= 0) return;
  const cur = await db.from('user_languages').select('xp').eq('user_id', userId).eq('language_code', lang).eq('role', 'target').maybeSingle();
  const next = (cur.data?.xp ?? 0) + Math.round(xp);
  await db.from('user_languages').update({ xp: next }).eq('user_id', userId).eq('language_code', lang).eq('role', 'target');
}

export interface StreakInfo {
  length: number;
  todayMet: boolean;
  freezeAvailable: boolean;
}

/** Bugünün satırını günceller; hedef karşılandıysa seriyi hesaplar (7 günde bir dondurma hakkı). */
export async function touchStreak(
  db: Db,
  userId: string,
  tz: string,
  dailyMinutes: number,
  add: { minutes?: number; cards?: number; lessons?: number; xp?: number },
): Promise<StreakInfo> {
  const today = localDate(tz);
  const { data } = await db
    .from('daily_streaks')
    .select('*')
    .eq('user_id', userId)
    .gte('activity_date', addDays(today, -8))
    .order('activity_date', { ascending: false });
  const result = computeStreak((data ?? []) as StreakRow[], today, dailyMinutes, add);
  const strip = ({ ...r }: StreakRow) => ({ user_id: userId, ...r });
  if (result.freeze) {
    await db.from('daily_streaks').upsert(strip(result.freeze), { onConflict: 'user_id,activity_date' });
  }
  await db.from('daily_streaks').upsert(strip(result.today), { onConflict: 'user_id,activity_date' });
  return { length: result.today.streak_length, todayMet: result.today.goal_met, freezeAvailable: result.freezeAvailable };
}

export interface NewAchievement {
  code: string;
  title_tr: string;
  xp_reward: number;
}

async function countOf(db: Db, table: string, userId: string, filter?: (q: any) => any): Promise<number> {
  let q = db.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId);
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

/** Ölçütleri kontrol eder, yeni kazanılan rozetleri kaydeder ve XP ödülünü verir. */
export async function checkAchievements(db: Db, userId: string, lang: string, streakLength: number): Promise<NewAchievement[]> {
  const [all, mine] = await Promise.all([
    db.from('achievements').select('*'),
    db.from('user_achievements').select('achievement_id').eq('user_id', userId),
  ]);
  const have = new Set((mine.data ?? []).map((r: { achievement_id: string }) => r.achievement_id));
  const todo = (all.data ?? []).filter((a: { id: string }) => !have.has(a.id)) as {
    id: string; code: string; title_tr: string; xp_reward: number; criteria: { type: string; value: number };
  }[];
  if (!todo.length) return [];
  const needs = new Set(todo.map((a) => a.criteria.type));
  const stats: Record<string, number> = { streak_days: streakLength };
  if (needs.has('cards_reviewed')) stats.cards_reviewed = await countOf(db, 'card_reviews', userId);
  if (needs.has('lessons_completed')) stats.lessons_completed = await countOf(db, 'lessons', userId, (q) => q.eq('status', 'completed'));
  if (needs.has('speaking_tasks')) stats.speaking_tasks = await countOf(db, 'task_attempts', userId, (q) => q.eq('task_type', 'speaking').eq('status', 'done'));
  if (needs.has('writing_tasks')) stats.writing_tasks = await countOf(db, 'task_attempts', userId, (q) => q.eq('task_type', 'writing').eq('status', 'done'));
  if (needs.has('vocab_cards')) stats.vocab_cards = await countOf(db, 'user_cards', userId, (q) => q.is('deleted_at', null).not('vocabulary_id', 'is', null));
  if (needs.has('mature_cards')) stats.mature_cards = await countOf(db, 'user_cards', userId, (q) => q.gte('interval_days', 21).is('deleted_at', null));

  const earned: NewAchievement[] = [];
  for (const a of todo) {
    if ((stats[a.criteria.type] ?? 0) >= a.criteria.value) {
      const r = await db.from('user_achievements').insert({ user_id: userId, achievement_id: a.id });
      if (!r.error) {
        earned.push({ code: a.code, title_tr: a.title_tr, xp_reward: a.xp_reward });
        if (a.xp_reward > 0) await awardXp(db, userId, lang, a.xp_reward);
      }
    }
  }
  return earned;
}

export const xpFor = {
  card: 2,
  comprehension: (pct: number) => 10 + Math.round(pct / 10),
  task: (score: number) => 15 + Math.round(score / 10),
  lesson: 30,
};

export { SKILLS };

// ── Ders içeriği ───────────────────────────────────────────────────────────

export async function completeBlock(db: Db, lessonContentId: string, seconds: number, result: Record<string, unknown>) {
  const { error } = await db
    .from('lesson_contents')
    .update({ status: 'done', actual_seconds: Math.round(seconds), result })
    .eq('id', lessonContentId);
  if (error) throw error;
}

export { norm as normalizeWord };
