-- Run this once in Supabase SQL Editor
create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
-- Accessed only via service role key from Next.js API routes; keep RLS on with no public policies.
alter table app_state enable row level security;
