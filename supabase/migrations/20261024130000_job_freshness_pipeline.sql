-- Daily job freshness pipeline: only live, current roles stay visible; stale
-- and closed roles are retired automatically and archived; a daily snapshot
-- records pipeline health.

-- 1. Amazon Jobs (public search JSON) as a job source provider.
alter table public.job_sources drop constraint if exists job_sources_provider_check;
alter table public.job_sources add constraint job_sources_provider_check
  check (provider = any (array['greenhouse','lever','ashby','jobicy','smartrecruiters','official_careers','remoteok','himalayas','workday','adzuna','jooble','amazon']));

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.upsert_job_opportunity_atomic(jsonb,bigint[])'::regprocedure) into v_def;
  if position('''amazon''' in v_def) = 0 then
    v_def := replace(v_def, '''workday'', ''adzuna'', ''jooble'')', '''workday'', ''adzuna'', ''jooble'', ''amazon'')');
    execute v_def;
  end if;
end $$;

insert into public.job_sources (provider, board_token, company_name, enabled)
values ('amazon', 'india', 'Amazon', true)
on conflict (provider, board_token) do update set enabled = true;

-- 2. Archive only roles that have been inactive for a few days and that no
--    student has saved, tracked, applied to or been matched with.
create or replace function public.archive_inactive_opportunities(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare moved integer := 0;
begin
  with candidates as (
    select o.id
    from public.opportunities o
    where o.active = false
      and coalesce(o.source_last_seen_at, o.created_at) < now() - interval '3 days'
      and not exists (select 1 from public.student_job_applications a where a.opportunity_id = o.id)
      and not exists (select 1 from public.opportunity_matches m where m.opportunity_id = o.id)
      and not exists (select 1 from public.job_application_tracker t where t.opportunity_id = o.id)
    order by coalesce(o.source_last_seen_at, o.created_at) asc
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
    for update skip locked
  ), archived as (
    insert into public.opportunities_archive(id, original_row, archive_reason, source_provider, source_external_id, application_url)
    select o.id, to_jsonb(o), 'inactive_not_in_student_applications_or_matches', o.source_provider, o.source_external_id, o.application_url
    from public.opportunities o join candidates c on c.id = o.id
    on conflict (id) do nothing
    returning id
  )
  delete from public.opportunities o using archived a where o.id = a.id;
  get diagnostics moved = row_count;
  return jsonb_build_object('archived_count', moved, 'batch_limit', greatest(1, least(coalesce(p_limit, 500), 2000)));
end;
$function$;
revoke all on function public.archive_inactive_opportunities(integer) from public, anon, authenticated;

-- 3. Daily stats snapshot.
create table if not exists public.job_pipeline_daily_stats (
  stat_date date primary key,
  active_jobs integer not null,
  student_visible_jobs integer not null,
  new_jobs_24h integer not null,
  retired_jobs_24h integer not null,
  archived_jobs integer not null,
  verified_live_pct numeric,
  by_provider jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.job_pipeline_daily_stats enable row level security;
drop policy if exists "Admins read job pipeline stats" on public.job_pipeline_daily_stats;
create policy "Admins read job pipeline stats" on public.job_pipeline_daily_stats
  for select to authenticated
  using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));

-- 4. Freshness rules, run daily.
create or replace function public.refresh_job_freshness()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_not_seen integer := 0;
  v_too_old integer := 0;
  v_expired integer := 0;
  v_archive jsonb;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  -- Partial / search-based feeds cannot prove a role closed, so retire roles a
  -- sync has not seen live for 7 days. Complete feeds are reconciled by the sync.
  update public.opportunities set active = false
  where active
    and source_provider in ('workday','official_careers','jobicy','remoteok','himalayas','adzuna','jooble','amazon')
    and coalesce(source_last_seen_at, created_at) < now() - interval '7 days'
    and not exists (select 1 from public.job_application_tracker t where t.opportunity_id = opportunities.id);
  get diagnostics v_not_seen = row_count;

  -- Nothing older than 120 days stays listed, whatever the source says.
  update public.opportunities set active = false
  where active and coalesce(posting_date, (created_at at time zone 'Asia/Kolkata')::date) < v_today - 120;
  get diagnostics v_too_old = row_count;

  update public.opportunities set active = false
  where active and expires_at is not null and expires_at < now();
  get diagnostics v_expired = row_count;

  v_archive := public.archive_inactive_opportunities(2000);

  insert into public.job_pipeline_daily_stats (stat_date, active_jobs, student_visible_jobs, new_jobs_24h, retired_jobs_24h, archived_jobs, verified_live_pct, by_provider)
  select v_today,
    (select count(*) from public.opportunities where active),
    (select count(*) from public.student_active_opportunities),
    (select count(*) from public.opportunities where first_seen_at > now() - interval '24 hours'),
    v_not_seen + v_too_old + v_expired,
    coalesce((v_archive->>'archived_count')::integer, 0),
    (select round(100.0 * count(*) filter (where application_check_status = 'available') / nullif(count(*), 0), 1)
       from public.opportunities where active),
    (select coalesce(jsonb_object_agg(source_provider, n), '{}'::jsonb)
       from (select source_provider, count(*) n from public.student_active_opportunities group by 1) p)
  on conflict (stat_date) do update set
    active_jobs = excluded.active_jobs, student_visible_jobs = excluded.student_visible_jobs,
    new_jobs_24h = excluded.new_jobs_24h,
    retired_jobs_24h = job_pipeline_daily_stats.retired_jobs_24h + excluded.retired_jobs_24h,
    archived_jobs = job_pipeline_daily_stats.archived_jobs + excluded.archived_jobs,
    verified_live_pct = excluded.verified_live_pct, by_provider = excluded.by_provider, created_at = now();

  return jsonb_build_object('retired_not_seen_7d', v_not_seen, 'retired_older_than_120d', v_too_old,
    'retired_expired', v_expired, 'archive', v_archive);
end;
$function$;
revoke all on function public.refresh_job_freshness() from public, anon, authenticated;

-- 5. Aggregate, non-sensitive pipeline health for monitoring.
create or replace function public.job_pipeline_health()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'checked_at', now(),
    'student_visible_jobs', (select count(*) from public.student_active_opportunities),
    'active_jobs', (select count(*) from public.opportunities where active),
    'new_jobs_24h', (select count(*) from public.opportunities where first_seen_at > now() - interval '24 hours'),
    'last_source_sync_at', (select max(last_synced_at) from public.job_sources where enabled),
    'sources_enabled', (select count(*) from public.job_sources where enabled),
    'sources_synced_24h', (select count(*) from public.job_sources where enabled and last_synced_at > now() - interval '24 hours'),
    'sources_erroring', (select count(*) from public.job_sources where enabled and last_synced_at > now() - interval '24 hours' and last_sync_status like 'error%'),
    'links_checked_24h', (select count(*) from public.opportunities where active and application_checked_at > now() - interval '24 hours'),
    'links_live_pct', (select round(100.0 * count(*) filter (where application_check_status = 'available') / nullif(count(*) filter (where application_check_status is not null), 0), 1) from public.opportunities where active)
  );
$function$;
revoke all on function public.job_pipeline_health() from public, anon, authenticated;

-- 6. Schedule: run the freshness rules daily at 03:05 IST.
select cron.unschedule(jobid) from cron.job where jobname = 'aldovra-job-freshness';
select cron.schedule('aldovra-job-freshness', '35 21 * * *', $$select public.refresh_job_freshness();$$);
