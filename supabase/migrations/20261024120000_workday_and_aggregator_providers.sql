-- Allow Workday career sites and the Adzuna / Jooble aggregators as job sources,
-- and persist salary text supplied by sources that publish it.

alter table public.job_sources drop constraint if exists job_sources_provider_check;
alter table public.job_sources add constraint job_sources_provider_check
  check (provider = any (array['greenhouse','lever','ashby','jobicy','smartrecruiters','official_careers','remoteok','himalayas','workday','adzuna','jooble']));

create or replace function public.upsert_job_opportunity_atomic(p_job jsonb, p_skill_ids bigint[])
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare v_id uuid; v_provider text; v_external_id text; v_title text; v_company text; v_url text; v_skill_count integer; v_posting_date date; v_salary text;
begin
  if jsonb_typeof(p_job) <> 'object' then raise exception 'Job payload must be an object'; end if;
  v_provider := p_job->>'source_provider';
  v_external_id := nullif(btrim(p_job->>'source_external_id'), '');
  v_title := nullif(btrim(p_job->>'title'), '');
  v_company := nullif(btrim(p_job->>'company_name'), '');
  v_url := p_job->>'application_url';
  v_salary := left(nullif(btrim(p_job->>'salary_text'), ''), 120);
  if v_provider not in ('greenhouse', 'lever', 'ashby', 'jobicy', 'smartrecruiters', 'official_careers', 'remoteok', 'himalayas', 'workday', 'adzuna', 'jooble') then raise exception 'Unsupported job provider'; end if;
  if v_external_id is null or length(v_external_id) > 200 or v_title is null or length(v_title) > 240 or v_company is null or length(v_company) > 200 then raise exception 'Required job fields are missing or invalid'; end if;
  if v_url is null or length(v_url) > 2048 or v_url !~* '^https?://' then raise exception 'Application URL must use HTTP or HTTPS'; end if;
  if coalesce(array_length(p_skill_ids, 1), 0) > 0 then
    select count(distinct s.id)::integer into v_skill_count from public.skills s where s.id = any(p_skill_ids);
    if v_skill_count = 0 then raise exception 'No valid skill matches supplied'; end if;
  end if;
  begin v_posting_date := nullif(p_job->>'posting_date','')::date; exception when others then v_posting_date := null; end;
  insert into public.opportunities (source_provider, source_board_token, source_external_id, source_url, source_last_seen_at, title, company_name, location, work_mode, employment_type, description, experience_level, salary_text, application_url, active, posting_date, first_seen_at)
  values (v_provider, p_job->>'source_board_token', v_external_id, p_job->>'source_url', coalesce(nullif(p_job->>'source_last_seen_at','')::timestamptz, now()), v_title, v_company, nullif(p_job->>'location',''), nullif(p_job->>'work_mode',''), nullif(p_job->>'employment_type',''), nullif(p_job->>'description',''), nullif(p_job->>'experience_level',''), v_salary, v_url, true, v_posting_date, now())
  on conflict (source_provider, source_external_id) do update set source_board_token=excluded.source_board_token, source_url=excluded.source_url, source_last_seen_at=excluded.source_last_seen_at, title=excluded.title, company_name=excluded.company_name, location=excluded.location, work_mode=excluded.work_mode, employment_type=excluded.employment_type, description=excluded.description, experience_level=excluded.experience_level, salary_text=coalesce(excluded.salary_text, opportunities.salary_text), application_url=excluded.application_url, active=true, posting_date=coalesce(excluded.posting_date, opportunities.posting_date)
  returning id into v_id;
  delete from public.opportunity_skills where opportunity_id=v_id;
  insert into public.opportunity_skills (opportunity_id, skill_id, required, importance)
  select v_id, s.id, true, 'required' from public.skills s where s.id=any(p_skill_ids)
  on conflict (opportunity_id, skill_id) do update set required=excluded.required, importance=excluded.importance;
  return v_id;
end;
$function$;

create or replace function public.reconcile_job_source_feed(p_source_provider text, p_board_token text, p_live_external_ids text[], p_feed_complete boolean)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare v_deactivated integer := 0;
begin
  if coalesce(p_feed_complete, false) is not true then return 0; end if;
  if p_source_provider not in ('greenhouse','lever','ashby','smartrecruiters','jobicy','remoteok','himalayas','workday') then raise exception 'Unsupported job source provider'; end if;
  if nullif(btrim(p_board_token), '') is null then raise exception 'Job source board token is required'; end if;
  update public.opportunities o set active=false
  where o.active=true and o.source_provider=p_source_provider and o.source_board_token=p_board_token
    and not (coalesce(o.source_external_id, '') = any(coalesce(p_live_external_ids, array[]::text[])));
  get diagnostics v_deactivated = row_count;
  return v_deactivated;
end;
$function$;

-- Helps the aggregator duplicate check (same company + title already listed).
create index if not exists opportunities_active_company_title_idx
  on public.opportunities (lower(company_name), lower(title)) where active;
