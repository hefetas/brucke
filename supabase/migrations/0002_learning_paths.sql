-- Yol haritası: kullanıcının dil başına seçtiği seviye aralığı (ör. B1 → C1).
-- Adımlar içerik kataloğundan ve user_progress'ten uygulamada hesaplanır; burada yalnızca seçim saklanır.
create table public.learning_paths (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.user_profile (id) on delete cascade,
  language_code text not null references public.languages (code),
  start_level   public.cefr not null,
  target_level  public.cefr not null,
  counted_since timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, language_code)
);
create trigger learning_paths_updated before update on public.learning_paths
  for each row execute function public.set_updated_at();

alter table public.learning_paths enable row level security;
create policy learning_paths_own on public.learning_paths
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
