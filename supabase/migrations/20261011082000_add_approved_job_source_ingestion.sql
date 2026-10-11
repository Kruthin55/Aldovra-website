alter table public.opportunities
  add column if not exists source_provider text,
  add column if not exists source_external_id text,
  add column if not exists source_url text,
  add column if not exists source_last_seen_at timestamptz;
create unique index if not exists opportunities_source_identity_unique
  on public.opportunities(source_provider, source_external_id)
  where source_provider is not null and source_external_id is not null;
create table if not exists public.job_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('greenhouse','lever')),
  board_token text not null check (board_token ~ '^[A-Za-z0-9_-]{1,120}$'),
  company_name text not null check (char_length(company_name) between 1 and 200),
  enabled boolean not null default false,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_count integer not null default 0 check (last_sync_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, board_token)
);
alter table public.job_sources enable row level security;
drop policy if exists "Admins manage job sources" on public.job_sources;
create policy "Admins manage job sources" on public.job_sources for all to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
revoke all on public.job_sources from public, anon, authenticated;
grant select, insert, update, delete on public.job_sources to authenticated;
