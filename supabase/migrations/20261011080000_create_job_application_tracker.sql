create table if not exists public.job_application_tracker (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  job_title text not null check (char_length(job_title) between 1 and 240),
  company_name text not null default 'Company' check (char_length(company_name) <= 240),
  application_url text,
  status text not null default 'saved' check (status in ('saved','preparing','ready','applied','interview','rejected','withdrawn')),
  application_draft jsonb not null default '{}'::jsonb,
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);
create unique index if not exists job_application_tracker_user_opportunity_unique
  on public.job_application_tracker(user_id, opportunity_id) where opportunity_id is not null;
create index if not exists job_application_tracker_user_status_updated
  on public.job_application_tracker(user_id, status, updated_at desc);
alter table public.job_application_tracker enable row level security;
drop policy if exists "Students manage own job application tracker" on public.job_application_tracker;
create policy "Students manage own job application tracker"
  on public.job_application_tracker for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.job_application_tracker from anon;
revoke all on public.job_application_tracker from public;
grant select, insert, update, delete on public.job_application_tracker to authenticated;
