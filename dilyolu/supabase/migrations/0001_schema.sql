-- DilYolu — veritabanı şeması (PostgreSQL / Supabase)
-- Tasarım dokümanı bölüm 10 ile uyumludur. İçerik tabloları `slug` ile tanımlanır,
-- anahtar kelimeler içeriğin içinde (jsonb) tutulur; kartlar oluşurken `vocabulary`'ye eklenir.

create domain public.cefr as text
  check (value in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

-- ───────────────────────────── Ortak yardımcılar ──────────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────────── Dil ve profil ──────────────────────────────────
create table public.languages (
  code        text primary key,
  name_native text not null,
  name_tr     text not null,
  tts_locale  text not null,
  stt_locale  text not null,
  is_enabled  boolean not null default true,
  is_target   boolean not null default true
);

create table public.user_profile (
  id                   uuid primary key references auth.users (id) on delete cascade,
  display_name         text,
  native_language_code text references public.languages (code),
  daily_minutes        smallint not null default 20 check (daily_minutes in (10, 20, 40, 60)),
  interests            text[] not null default '{}',
  reminder_time        time not null default '21:00',
  reminder_channel     text not null default 'browser' check (reminder_channel in ('browser', 'email', 'inapp')),
  timezone             text not null default 'Europe/Istanbul',
  theme                text not null default 'system' check (theme in ('light', 'dark', 'system')),
  tts_rate             numeric(3, 2) not null default 1.00 check (tts_rate between 0.5 and 1.5),
  show_subtitles       boolean not null default true,
  push_subscription    jsonb,
  onboarding_done      boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger user_profile_updated before update on public.user_profile
  for each row execute function public.set_updated_at();

create table public.user_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.user_profile (id) on delete cascade,
  kind         text not null check (kind in ('purpose', 'weekly', 'personal')),
  title        text not null,
  target_value integer,
  unit         text,
  target_date  date,
  status       text not null default 'active' check (status in ('active', 'done', 'dropped')),
  created_at   timestamptz not null default now()
);
create index user_goals_user_idx on public.user_goals (user_id, kind, status);

create table public.user_languages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.user_profile (id) on delete cascade,
  language_code    text not null references public.languages (code),
  role             text not null check (role in ('target', 'native')),
  is_active        boolean not null default false,
  level_listening  public.cefr not null default 'A1',
  level_reading    public.cefr not null default 'A1',
  level_speaking   public.cefr not null default 'A1',
  level_writing    public.cefr not null default 'A1',
  level_vocab      public.cefr not null default 'A1',
  level_grammar    public.cefr not null default 'A1',
  placement_done   boolean not null default false,
  xp               integer not null default 0,
  started_at       timestamptz not null default now(),
  unique (user_id, language_code, role)
);
-- Aynı anda tek aktif hedef dil
create unique index user_languages_one_active on public.user_languages (user_id)
  where role = 'target' and is_active;

-- ───────────────────────────── İçerik tabloları (herkese okunur) ──────────────
create table public.vocabulary (
  id             uuid primary key default gen_random_uuid(),
  language_code  text not null references public.languages (code),
  lemma          text not null,
  part_of_speech text not null default '',
  meaning_tr     text not null,
  example        text,
  example_tr     text,
  cefr_level     public.cefr,
  audio_url      text,
  image_url      text,
  frequency_rank integer,
  source         text not null default 'content' check (source in ('seed', 'content', 'user')),
  created_at     timestamptz not null default now(),
  unique (language_code, lemma, part_of_speech)
);

create table public.grammar_topics (
  id             uuid primary key default gen_random_uuid(),
  language_code  text not null references public.languages (code),
  slug           text not null,
  title_tr       text not null,
  title_target   text not null,
  cefr_level     public.cefr not null,
  summary_tr     text not null,
  examples       jsonb not null default '[]',        -- [{text, tr, highlight}]
  practice_items jsonb not null default '[]',        -- [{type, prompt, options?, answer, explain_tr?}]
  order_index    integer not null default 0,
  unique (language_code, slug)
);

create table public.listening_contents (
  id            uuid primary key default gen_random_uuid(),
  language_code text not null references public.languages (code),
  slug          text not null,
  title         text not null,
  kind          text not null default 'dialogue' check (kind in ('dialogue', 'story', 'podcast', 'news', 'video', 'daily')),
  cefr_level    public.cefr not null,
  topics        text[] not null default '{}',
  duration_sec  integer,
  audio_url     text,                                -- boşsa tarayıcı ses sentezi kullanılır
  transcript    jsonb not null default '[]',         -- [{speaker, text, tr}]
  glossary      jsonb not null default '[]',         -- [{lemma, pos, meaning_tr, example, example_tr}]
  questions     jsonb not null default '[]',         -- [{prompt, options, answer, explain_tr?}]
  source        text,
  license       text,
  unique (language_code, slug)
);

create table public.reading_contents (
  id            uuid primary key default gen_random_uuid(),
  language_code text not null references public.languages (code),
  slug          text not null,
  title         text not null,
  kind          text not null default 'article' check (kind in ('story', 'news', 'dialogue', 'article')),
  cefr_level    public.cefr not null,
  topics        text[] not null default '{}',
  body          text not null,
  word_count    integer,
  est_read_sec  integer,
  glossary      jsonb not null default '[]',
  questions     jsonb not null default '[]',
  source        text,
  license       text,
  unique (language_code, slug)
);

create table public.speaking_tasks (
  id               uuid primary key default gen_random_uuid(),
  language_code    text not null references public.languages (code),
  slug             text not null,
  cefr_level       public.cefr not null,
  kind             text not null default 'describe' check (kind in ('repeat', 'describe', 'answer', 'roleplay')),
  title_tr         text not null,
  prompt_tr        text not null,
  model_text       text not null,
  target_phrases   text[] not null default '{}',
  max_seconds      smallint not null default 30,
  topics           text[] not null default '{}',
  roleplay_script  jsonb,
  unique (language_code, slug)
);

create table public.writing_tasks (
  id             uuid primary key default gen_random_uuid(),
  language_code  text not null references public.languages (code),
  slug           text not null,
  cefr_level     public.cefr not null,
  kind           text not null default 'short_paragraph'
                   check (kind in ('sentence_completion', 'short_paragraph', 'email', 'diary')),
  title_tr       text not null,
  prompt_tr      text not null,
  target_phrases text[] not null default '{}',
  min_words      smallint not null default 15,
  max_words      smallint not null default 80,
  sample_answer  text,
  topics         text[] not null default '{}',
  unique (language_code, slug)
);

create table public.achievements (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  title_tr       text not null,
  description_tr text not null,
  category       text not null check (category in ('consistency', 'speaking', 'writing', 'vocab', 'milestone')),
  criteria       jsonb not null,                     -- {type, value}
  xp_reward      integer not null default 0,
  icon           text
);

-- ───────────────────────────── Ders ───────────────────────────────────────────
create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.user_profile (id) on delete cascade,
  language_code text not null references public.languages (code),
  lesson_date   date not null,
  plan_minutes  smallint not null check (plan_minutes in (10, 20, 40, 60)),
  status        text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'skipped')),
  current_step  smallint not null default 1,         -- sıradaki blok (1 tabanlı)
  started_at    timestamptz,
  completed_at  timestamptz,
  summary       jsonb not null default '{}',
  xp_earned     integer not null default 0,
  unique (user_id, language_code, lesson_date)
);

create table public.lesson_contents (
  id              uuid primary key default gen_random_uuid(),
  lesson_id       uuid not null references public.lessons (id) on delete cascade,
  user_id         uuid not null references public.user_profile (id) on delete cascade,
  step            smallint not null check (step between 1 and 5),   -- 1 girdi/anlama, 3 hatırlama, 4 üretim/geri bildirim
  position        smallint not null,
  content_type    text not null check (content_type in ('listening', 'reading', 'grammar', 'speaking', 'writing', 'review', 'real_world', 'free')),
  content_id      uuid,
  content_slug    text,
  title           text,
  planned_seconds integer not null default 300,
  actual_seconds  integer,
  status          text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  result          jsonb not null default '{}'
);
create index lesson_contents_lesson_idx on public.lesson_contents (lesson_id, position);

-- ───────────────────────────── Kartlar ve tekrar ──────────────────────────────
create table public.user_cards (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.user_profile (id) on delete cascade,
  language_code       text not null references public.languages (code),
  card_type           text not null check (card_type in (
                        'word_to_meaning', 'meaning_to_word', 'image_to_word', 'cloze',
                        'tr_to_target', 'audio_to_meaning', 'error_correction', 'speaking_prompt')),
  vocabulary_id       uuid references public.vocabulary (id) on delete set null,
  grammar_topic_id    uuid references public.grammar_topics (id) on delete set null,
  front               text not null,
  back                text not null,
  context_sentence    text,
  source_content_type text,
  source_content_slug text,
  learned_at          timestamptz not null default now(),
  state               text not null default 'learning' check (state in ('new', 'learning', 'review', 'relearning', 'suspended')),
  step                smallint not null default 0,
  ease                numeric(3, 2) not null default 2.50,
  interval_days       integer not null default 0,
  due_at              timestamptz not null default now(),
  correct_count       integer not null default 0,
  wrong_count         integer not null default 0,
  lapses              integer not null default 0,
  last_response_ms    integer,
  difficulty_label    text not null default 'normal' check (difficulty_label in ('easy', 'normal', 'hard')),
  used_in_speaking    boolean not null default false,
  used_in_writing     boolean not null default false,
  is_leech            boolean not null default false,
  usage_bonus_given   boolean not null default false,
  deleted_at          timestamptz
);
create index user_cards_due_idx on public.user_cards (user_id, language_code, due_at)
  where state <> 'suspended' and deleted_at is null;
create unique index user_cards_unique_vocab_type on public.user_cards (user_id, vocabulary_id, card_type)
  where vocabulary_id is not null and deleted_at is null;

create table public.card_reviews (
  id              uuid primary key default gen_random_uuid(),
  user_card_id    uuid not null references public.user_cards (id) on delete cascade,
  user_id         uuid not null references public.user_profile (id) on delete cascade,
  reviewed_at     timestamptz not null default now(),
  grade           smallint not null check (grade between 1 and 4),
  is_correct      boolean not null,
  response_ms     integer,
  state_before    text,
  state_after     text,
  interval_before integer,
  interval_after  integer,
  ease_before     numeric(3, 2),
  ease_after      numeric(3, 2),
  due_after       timestamptz,
  client_event_id uuid not null unique
);
create index card_reviews_user_idx on public.card_reviews (user_id, reviewed_at desc);

-- ───────────────────────────── İlerleme, hata, bildirim ──────────────────────
create table public.user_progress (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.user_profile (id) on delete cascade,
  language_code      text not null references public.languages (code),
  skill              text not null check (skill in ('listening', 'reading', 'speaking', 'writing', 'vocab', 'grammar')),
  activity_type      text not null check (activity_type in (
                       'comprehension', 'card_review', 'speaking_task', 'writing_task', 'grammar_practice', 'placement')),
  content_type       text,
  content_slug       text,
  lesson_id          uuid references public.lessons (id) on delete set null,
  content_cefr_level public.cefr,
  score              numeric(5, 2) not null check (score between 0 and 100),
  duration_sec       integer,
  occurred_at        timestamptz not null default now()
);
create index user_progress_idx on public.user_progress (user_id, language_code, skill, occurred_at desc);

create table public.daily_streaks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.user_profile (id) on delete cascade,
  activity_date     date not null,
  minutes_studied   numeric(6, 1) not null default 0,
  lessons_completed smallint not null default 0,
  cards_reviewed    integer not null default 0,
  goal_met          boolean not null default false,
  streak_length     integer not null default 0,
  freeze_used       boolean not null default false,
  xp_earned         integer not null default 0,
  unique (user_id, activity_date)
);

create table public.user_achievements (
  user_id        uuid not null references public.user_profile (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  earned_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.errors (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.user_profile (id) on delete cascade,
  language_code    text not null references public.languages (code),
  source_type      text not null check (source_type in ('speaking', 'writing', 'grammar', 'card_review', 'placement')),
  source_id        uuid,
  error_type       text not null check (error_type in (
                     'tense', 'preposition', 'article', 'agreement', 'word_order',
                     'word_choice', 'spelling', 'naturalness', 'unclear_speech', 'other')),
  grammar_topic_id uuid references public.grammar_topics (id) on delete set null,
  original         text not null,
  corrected        text not null,
  explanation_tr   text,
  accepted         boolean not null default true,
  card_id          uuid references public.user_cards (id) on delete set null,
  occurred_at      timestamptz not null default now(),
  resolved_at      timestamptz
);
create index errors_user_idx on public.errors (user_id, language_code, occurred_at desc);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.user_profile (id) on delete cascade,
  kind          text not null check (kind in ('daily_reminder', 'streak_warning', 'weak_area', 'weekly_report', 'achievement', 'info')),
  title         text not null,
  body          text not null,
  deep_link     text,
  channel       text not null default 'inapp' check (channel in ('browser', 'email', 'inapp')),
  scheduled_for timestamptz not null default now(),
  sent_at       timestamptz,
  read_at       timestamptz,
  payload       jsonb not null default '{}'
);
create index notifications_user_idx on public.notifications (user_id, scheduled_for desc);

-- ───────────────────────────── Ek tablolar ────────────────────────────────────
create table public.task_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.user_profile (id) on delete cascade,
  language_code   text not null references public.languages (code),
  lesson_id       uuid references public.lessons (id) on delete set null,
  task_type       text not null check (task_type in ('speaking', 'writing')),
  task_slug       text not null,
  started_at      timestamptz not null default now(),
  duration_sec    integer,
  word_count      integer,
  audio_path      text,
  keep_audio      boolean not null default false,
  transcript      text,
  submission_text text,
  feedback        jsonb,
  provider        text,
  status          text not null default 'draft' check (status in ('draft', 'pending_feedback', 'done', 'failed')),
  created_at      timestamptz not null default now()
);
create index task_attempts_user_idx on public.task_attempts (user_id, created_at desc);

create table public.placement_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.user_profile (id) on delete cascade,
  language_code text not null references public.languages (code),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  answers       jsonb not null default '[]',
  result        jsonb not null default '{}',
  is_current    boolean not null default false
);

-- ───────────────────────────── RLS ────────────────────────────────────────────
alter table public.user_profile enable row level security;
create policy user_profile_own on public.user_profile
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'user_goals', 'user_languages', 'lessons', 'lesson_contents', 'user_cards', 'card_reviews',
    'user_progress', 'daily_streaks', 'user_achievements', 'errors', 'notifications',
    'task_attempts', 'placement_attempts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_own', t);
  end loop;

  foreach t in array array[
    'languages', 'grammar_topics', 'listening_contents', 'reading_contents',
    'speaking_tasks', 'writing_tasks', 'achievements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

alter table public.vocabulary enable row level security;
create policy vocabulary_read on public.vocabulary for select to authenticated using (true);
create policy vocabulary_insert on public.vocabulary for insert to authenticated with check (source in ('user', 'content'));

-- ───────────────────────────── Ses kayıtları için özel kova ───────────────────
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

create policy recordings_select_own on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy recordings_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy recordings_update_own on storage.objects for update to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy recordings_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
