-- Run this once in Supabase: Project -> SQL Editor -> New query

create table if not exists public.saju_draws (
  id uuid primary key default gen_random_uuid(),
  birth_date date not null,
  birth_time time,
  gender text check (gender in ('male', 'female', 'unspecified')) default 'unspecified',
  analysis text not null,
  main_numbers int[] not null,
  bonus_number int not null,
  created_at timestamptz not null default now()
);

-- Row Level Security is enabled and NO policies are added on purpose.
-- The serverless function writes using the service role key, which bypasses RLS entirely.
-- This means the table is completely inaccessible from the browser (anon key), by design.
alter table public.saju_draws enable row level security;
