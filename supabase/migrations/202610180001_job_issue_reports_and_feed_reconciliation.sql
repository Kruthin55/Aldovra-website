-- Keep student-reported application issues reviewable and reconcile stale listings
-- only against a complete, successfully fetched live provider feed.

create table if not exists public.job_application_issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  issue_type text not null check (issue_type in ('closed', 'already-filled', 'broken-link', 'wrong-details', 'application-form-blocked')),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id, issue_type)
);

create index if not exists idx_job_application_issue_reports_open
on public.job_application_issue_reports(status, created_at desc);

alter table public.job_application_issue_reports enable row level security;

drop policy if exists "Students can submit own job application issue reports" on public.job_application_issue_reports;
create policy "Students can submit own job application issue reports"
on public.job_application_issue_reports for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Students can view own job application issue reports" on public.job_application_issue_reports;
create policy "Students can view own job application issue reports"
on public.job_application_issue_reports for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Admins can review job application issue reports" on public.job_application_issue_reports;
create policy "Admins can review job application issue reports"
on public.job_application_issue_reports for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

drop policy if exists "Admins can update job application issue reports" on public.job_application_issue_reports;
create policy "Admins can update job application issue reports"
on public.job_application_issue_reports for update to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

grant select, insert on table public.job_application_issue_reports to authenticated;
grant update on table public.job_application_issue_reports to authenticated;

create or replace function public.reconcile_job_source_feed(
  p_source_provider text,
  p_board_token text,
  p_live_external_ids text[],
  p_feed_complete boolean
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_deactivated integer := 0;
begin
  if coalesce(p_feed_complete, false) is not true then
    return 0;
  end if;
  if p_source_provider not in ('greenhouse','lever','ashby','smartrecruiters') then
    raise exception 'Unsupported job source provider';
  end if;
  if nullif(btrim(p_board_token), '') is null then
    raise exception 'Job source board token is required';
  end if;

  update public.opportunities o
     set active = false
   where o.active = true
     and o.source_provider = p_source_provider
     and o.source_board_token = p_board_token
     and not (coalesce(o.source_external_id, '') = any(coalesce(p_live_external_ids, array[]::text[])));

  get diagnostics v_deactivated = row_count;
  return v_deactivated;
end;
$function$;

revoke all on function public.reconcile_job_source_feed(text,text,text[],boolean) from public, anon, authenticated;
grant execute on function public.reconcile_job_source_feed(text,text,text[],boolean) to service_role;
