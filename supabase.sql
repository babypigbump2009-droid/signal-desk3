-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  watchlist jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "read own data" on public.user_data
  for select using (auth.uid() = user_id);
create policy "insert own data" on public.user_data
  for insert with check (auth.uid() = user_id);
create policy "update own data" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own data" on public.user_data
  for delete using (auth.uid() = user_id);

-- Email alerts (optional). Run this part too if you want emails when a trade reaches its stop or target.
alter table public.user_data add column if not exists alerts_email boolean not null default false;
alter table public.user_data add column if not exists alerted jsonb not null default '[]'::jsonb;
