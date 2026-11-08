-- Sınav hazırlığı (IELTS / Goethe): kullanıcının hedefi ve çözdüğü deneme sonuçları.
-- Sınav içeriği (okuma/dinleme metinleri, yazma ve konuşma görevleri) depoda JSON olarak durur; burada yalnızca kullanıcı verisi vardır.
create table public.exam_settings (
  user_id       uuid not null references public.user_profile (id) on delete cascade,
  language_code text not null references public.languages (code),
  exam          text not null check (exam in ('ielts', 'goethe')),
  target_band   numeric(2, 1) check (target_band between 4 and 9),
  goethe_level  text check (goethe_level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  exam_date     date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, language_code)
);
create trigger exam_settings_updated before update on public.exam_settings
  for each row execute function public.set_updated_at();

create table public.exam_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.user_profile (id) on delete cascade,
  language_code text not null references public.languages (code),
  exam          text not null check (exam in ('ielts', 'goethe')),
  section       text not null check (section in ('reading', 'listening', 'writing', 'speaking')),
  item_id       text not null,
  level         text,
  score_pct     numeric(5, 2) not null check (score_pct between 0 and 100),
  band          numeric(2, 1) check (band between 0 and 9),
  raw           int,
  total         int,
  seconds       int,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index exam_attempts_user_idx on public.exam_attempts (user_id, language_code, created_at desc);

alter table public.exam_settings enable row level security;
alter table public.exam_attempts enable row level security;
create policy exam_settings_own on public.exam_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy exam_attempts_own on public.exam_attempts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
