-- Extend the existing Aldovra job-source model for the documented public Jobicy feed.
-- Staged only: review and apply through the normal migration/release process.
alter table public.job_sources drop constraint if exists job_sources_provider_check;
alter table public.job_sources
  add constraint job_sources_provider_check
  check (provider = any (array['greenhouse'::text, 'lever'::text, 'ashby'::text, 'jobicy'::text]));

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
  if v_provider not in ('greenhouse', 'lever', 'ashby', 'jobicy') then raise exception 'Unsupported job provider'; end if;
  if v_external_id is null or length(v_external_id) > 200 or v_title is null or length(v_title) > 240 or v_company is null or length(v_company) > 200 then
    raise exception 'Required job fields are missing or invalid';
  end if;
  if v_url is null or length(v_url) > 2048 or v_url !~* '^https?://' then raise exception 'Application URL must use HTTP or HTTPS'; end if;
  if coalesce(array_length(p_skill_ids, 1), 0) = 0 then raise exception 'At least one skill match is required'; end if;
  select count(distinct s.id)::integer into v_skill_count from public.skills s where s.id = any(p_skill_ids);
  if v_skill_count = 0 then raise exception 'No valid skill matches supplied'; end if;
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

revoke all on function public.upsert_job_opportunity_atomic(jsonb, bigint[]) from public, anon, authenticated;
grant execute on function public.upsert_job_opportunity_atomic(jsonb, bigint[]) to service_role;

-- Public feed: no API key. Keep a single bounded source; the student refresh fetches
-- at most 100 listings and does not mark absent feed items closed.
insert into public.job_sources(provider, board_token, company_name, enabled)
values ('jobicy', 'remote-jobs', 'Jobicy Public Remote Jobs', true)
on conflict (provider, board_token) do update
set company_name = excluded.company_name, enabled = true, updated_at = now();
