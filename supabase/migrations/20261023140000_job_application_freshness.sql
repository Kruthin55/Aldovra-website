-- Track application-link health and safely reconcile provider identities.
alter table public.opportunities
  add column if not exists application_checked_at timestamptz,
  add column if not exists application_check_status text,
  add column if not exists application_check_failures integer not null default 0;

alter table public.opportunities
  drop constraint if exists opportunities_application_check_failures_check;
alter table public.opportunities
  add constraint opportunities_application_check_failures_check
  check (application_check_failures >= 0 and application_check_failures <= 10);

create index if not exists opportunities_active_application_check_idx
  on public.opportunities (application_checked_at nulls first)
  where active = true;

create or replace function public.upsert_job_opportunity_atomic(p_job jsonb, p_skill_ids bigint[])
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_id uuid;
  v_provider text;
  v_external_id text;
  v_title text;
  v_company text;
  v_url text;
  v_skill_count integer;
begin
  if jsonb_typeof(p_job) <> 'object' then raise exception 'Job payload must be an object'; end if;
  v_provider := p_job->>'source_provider';
  v_external_id := nullif(btrim(p_job->>'source_external_id'), '');
  v_title := nullif(btrim(p_job->>'title'), '');
  v_company := nullif(btrim(p_job->>'company_name'), '');
  v_url := p_job->>'application_url';
  if v_provider not in ('greenhouse', 'lever', 'ashby', 'jobicy', 'smartrecruiters', 'official_careers', 'remoteok') then raise exception 'Unsupported job provider'; end if;
  if v_external_id is null or length(v_external_id) > 200 or v_title is null or length(v_title) > 240 or v_company is null or length(v_company) > 200 then
    raise exception 'Required job fields are missing or invalid';
  end if;
  if v_url is null or length(v_url) > 2048 or v_url !~* '^https?://' then raise exception 'Application URL must use HTTP or HTTPS'; end if;
  if coalesce(array_length(p_skill_ids, 1), 0) > 0 then
    select count(distinct s.id)::integer into v_skill_count from public.skills s where s.id = any(p_skill_ids);
    if v_skill_count = 0 then raise exception 'No valid skill matches supplied'; end if;
  end if;
  insert into public.opportunities (
    source_provider, source_board_token, source_external_id, source_url, source_last_seen_at,
    title, company_name, location, work_mode, employment_type, description, experience_level, application_url, active
  ) values (
    v_provider, p_job->>'source_board_token', v_external_id, p_job->>'source_url',
    coalesce(nullif(p_job->>'source_last_seen_at','')::timestamptz, now()),
    v_title, v_company, nullif(p_job->>'location',''), nullif(p_job->>'work_mode',''),
    nullif(p_job->>'employment_type',''), nullif(p_job->>'description',''),
    nullif(p_job->>'experience_level',''), v_url, true
  )
  on conflict (source_provider, source_external_id) do update set
    source_board_token = excluded.source_board_token, source_url = excluded.source_url,
    source_last_seen_at = excluded.source_last_seen_at, title = excluded.title,
    company_name = excluded.company_name, location = excluded.location, work_mode = excluded.work_mode,
    employment_type = excluded.employment_type, description = excluded.description,
    experience_level = excluded.experience_level, application_url = excluded.application_url, active = true
  returning id into v_id;
  delete from public.opportunity_skills where opportunity_id = v_id;
  insert into public.opportunity_skills (opportunity_id, skill_id, required, importance)
  select v_id, s.id, true, 'required' from public.skills s where s.id = any(p_skill_ids)
  on conflict (opportunity_id, skill_id) do update set required = excluded.required, importance = excluded.importance;
  return v_id;
end;
$function$;

create or replace function public.reconcile_job_source_feed(p_source_provider text, p_board_token text, p_live_external_ids text[], p_feed_complete boolean)
 returns integer
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_deactivated integer := 0;
begin
  if coalesce(p_feed_complete, false) is not true then
    return 0;
  end if;
  if p_source_provider not in ('greenhouse','lever','ashby','smartrecruiters','jobicy','remoteok') then
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

-- Run the link checker every six hours. It deactivates a listing only after
-- two consecutive explicit closed/404/410 signals; blocked and transient pages
-- are recorded but do not cause false removals.
select cron.unschedule(jobid)
from cron.job
where jobname = 'aldovra-application-link-check';

select cron.schedule(
  'aldovra-application-link-check',
  '15 */6 * * *',
  $job$
  select net.http_post(
    url := 'https://lgefwfrjzweayfxahogs.supabase.co/functions/v1/check-job-links',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'aldovra_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
