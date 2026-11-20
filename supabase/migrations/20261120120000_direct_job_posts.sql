-- Direct job posts from companies + admin "Remove company" switch (20 Nov 2026, agreed with the founder on 19 Nov).
-- Approved recruiters submit fresher jobs; nothing goes live until an admin approves it. Approved posts become rows in
-- public.opportunities (source_provider 'direct'), so the fresher_ok gate, 30-day window, dashboard, public /job pages
-- and Google Jobs all treat them like any other job. The company name always comes from the recruiter's approved
-- access request, so nobody can post in another company's name.

-- ---------- Direct job posts ----------
create table if not exists public.direct_job_posts (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_name text not null,
  title text not null,
  location text not null,
  work_mode text not null check (work_mode in ('Remote','Hybrid','On-site')),
  employment_type text not null check (employment_type in ('Full-time','Part-time','Internship','Contract')),
  salary_text text,
  apply_url text,
  apply_email text,
  description text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','closed')),
  admin_note text,
  opportunity_id uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  closed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists direct_job_posts_recruiter_idx on public.direct_job_posts (recruiter_id, created_at desc);
create index if not exists direct_job_posts_status_idx on public.direct_job_posts (status, created_at desc);
alter table public.direct_job_posts enable row level security;
revoke all on public.direct_job_posts from anon, authenticated;
grant select on public.direct_job_posts to authenticated;
create policy "Recruiters read own job posts" on public.direct_job_posts for select to authenticated
  using (recruiter_id = (select auth.uid()));

-- Phrases that mean the student is asked to pay (never allowed on Aldovra).
create or replace function public.job_text_asks_fee(p text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p, '') ~* '(registration fee|training fee|course fee|joining fee|processing fee|security deposit|refundable deposit|caution deposit|pay (a|the|an) (fee|amount|deposit)|fees? (is|are) (applicable|payable|required)|deposit (of|amount)|kit charges?|certification charges?)'
$$;

create or replace function public.recruiter_submit_job_post(p_post jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_company text;
  v_title text := btrim(coalesce(p_post->>'title', ''));
  v_location text := btrim(coalesce(p_post->>'location', ''));
  v_mode text := coalesce(p_post->>'work_mode', '');
  v_type text := coalesce(p_post->>'employment_type', '');
  v_salary text := nullif(btrim(coalesce(p_post->>'salary_text', '')), '');
  v_url text := nullif(btrim(coalesce(p_post->>'apply_url', '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_post->>'apply_email', ''))), '');
  v_desc text := btrim(coalesce(p_post->>'description', ''));
  v_id uuid;
begin
  if v_uid is null or not public.is_approved_recruiter() then raise exception 'RECRUITER_NOT_APPROVED'; end if;
  select btrim(company_name) into v_company from public.recruiter_access where user_id = v_uid;
  if coalesce(v_company, '') = '' then raise exception 'COMPANY_MISSING'; end if;
  if length(v_title) < 3 or length(v_title) > 120 then raise exception 'TITLE_LENGTH'; end if;
  if length(v_location) < 2 or length(v_location) > 120 then raise exception 'LOCATION_LENGTH'; end if;
  if v_mode not in ('Remote','Hybrid','On-site') then raise exception 'WORK_MODE'; end if;
  if v_type not in ('Full-time','Part-time','Internship','Contract') then raise exception 'EMPLOYMENT_TYPE'; end if;
  if length(v_desc) < 80 or length(v_desc) > 8000 then raise exception 'DESCRIPTION_LENGTH'; end if;
  if v_salary is not null and length(v_salary) > 80 then raise exception 'SALARY_LENGTH'; end if;
  if v_url is null and v_email is null then raise exception 'APPLY_METHOD_REQUIRED'; end if;
  if v_url is not null and (v_url !~* '^https://[a-z0-9.-]+\.[a-z]{2,}(/\S*)?$' or length(v_url) > 500) then raise exception 'APPLY_URL_INVALID'; end if;
  if v_email is not null and (v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' or length(v_email) > 200) then raise exception 'APPLY_EMAIL_INVALID'; end if;
  if public.job_text_asks_fee(v_title || ' ' || v_desc || ' ' || coalesce(v_salary, '')) then raise exception 'FEE_NOT_ALLOWED'; end if;
  if not public.job_fresher_ok(v_title, v_desc) then raise exception 'NOT_FRESHER'; end if;
  if (select count(*) from public.direct_job_posts where recruiter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'DAILY_LIMIT';
  end if;
  if (select count(*) from public.direct_job_posts where recruiter_id = v_uid and status = 'pending') >= 10 then
    raise exception 'PENDING_LIMIT';
  end if;
  insert into public.direct_job_posts (recruiter_id, company_name, title, location, work_mode, employment_type, salary_text, apply_url, apply_email, description)
  values (v_uid, v_company, v_title, v_location, v_mode, v_type, v_salary, v_url, v_email, v_desc)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.recruiter_my_job_posts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'location', p.location, 'work_mode', p.work_mode, 'employment_type', p.employment_type,
    'salary_text', p.salary_text, 'apply_url', p.apply_url, 'apply_email', p.apply_email, 'company_name', p.company_name,
    'status', case when p.status = 'approved' and p.expires_at < now() then 'expired' else p.status end,
    'admin_note', p.admin_note, 'created_at', p.created_at, 'reviewed_at', p.reviewed_at, 'expires_at', p.expires_at,
    'opportunity_id', p.opportunity_id) order by p.created_at desc), '[]'::jsonb)
  from public.direct_job_posts p where p.recruiter_id = auth.uid();
$$;

create or replace function public.recruiter_close_job_post(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_opp uuid;
begin
  update public.direct_job_posts set status = 'closed', closed_at = now(), updated_at = now()
   where id = p_id and recruiter_id = auth.uid() and status in ('pending','approved')
   returning opportunity_id into v_opp;
  if not found then return false; end if;
  if v_opp is not null then update public.opportunities set active = false where id = v_opp; end if;
  return true;
end $$;

create or replace function public.admin_list_job_posts(p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_aldovra_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'company_name', p.company_name, 'location', p.location, 'work_mode', p.work_mode,
    'employment_type', p.employment_type, 'salary_text', p.salary_text, 'apply_url', p.apply_url, 'apply_email', p.apply_email,
    'description', p.description, 'status', case when p.status = 'approved' and p.expires_at < now() then 'expired' else p.status end,
    'admin_note', p.admin_note, 'created_at', p.created_at, 'reviewed_at', p.reviewed_at, 'expires_at', p.expires_at,
    'fresher_ok', public.job_fresher_ok(p.title, p.description), 'opportunity_id', p.opportunity_id,
    'recruiter', jsonb_build_object('name', r.full_name, 'email', coalesce(r.work_email, u.email), 'designation', r.designation,
      'phone', r.phone, 'website', r.company_website)) order by p.created_at desc)
    from public.direct_job_posts p
    left join public.recruiter_access r on r.user_id = p.recruiter_id
    left join auth.users u on u.id = p.recruiter_id
    where p_status is null or p_status = 'all' or p.status = p_status), '[]'::jsonb);
end $$;

create or replace function public.admin_review_job_post(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.direct_job_posts%rowtype; v_opp uuid; v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform public.assert_aldovra_admin();
  select * into p from public.direct_job_posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if p.status <> 'pending' then raise exception 'POST_NOT_PENDING'; end if;
  if not p_approve then
    update public.direct_job_posts set status = 'rejected', admin_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now() where id = p_id;
    return jsonb_build_object('status', 'rejected');
  end if;
  insert into public.opportunities (title, company_name, location, work_mode, employment_type, description, experience_level,
    salary_text, application_url, active, source_provider, source_external_id, source_board_token, source_last_seen_at,
    application_checked_at, application_check_status, posting_date, expires_at)
  values (p.title, p.company_name, p.location, p.work_mode, p.employment_type, p.description, 'Fresher',
    p.salary_text, coalesce(p.apply_url, 'mailto:' || p.apply_email), true, 'direct', p.id::text, 'aldovra', now(),
    now(), 'direct_post', v_today, now() + interval '30 days')
  on conflict (source_provider, source_external_id) do update set active = true, expires_at = excluded.expires_at
  returning id into v_opp;
  update public.direct_job_posts set status = 'approved', opportunity_id = v_opp, admin_note = nullif(btrim(coalesce(p_note, '')), ''),
    reviewed_at = now(), reviewed_by = auth.uid(), expires_at = now() + interval '30 days', updated_at = now() where id = p_id;
  return jsonb_build_object('status', 'approved', 'opportunity_id', v_opp,
    'visible', exists (select 1 from public.student_active_opportunities s where s.id = v_opp));
end $$;

revoke all on function public.recruiter_submit_job_post(jsonb), public.recruiter_my_job_posts(), public.recruiter_close_job_post(uuid),
  public.admin_list_job_posts(text), public.admin_review_job_post(uuid, boolean, text) from public, anon;
grant execute on function public.recruiter_submit_job_post(jsonb), public.recruiter_my_job_posts(), public.recruiter_close_job_post(uuid),
  public.admin_list_job_posts(text), public.admin_review_job_post(uuid, boolean, text) to authenticated;

-- ---------- Remove company ----------
-- Rows are never deleted: "Restore" sets active = false, so the history of who was removed and why stays.
create table if not exists public.blocked_companies (
  name_key text primary key,
  company_name text not null,
  reason text,
  disabled_source_ids uuid[] not null default '{}',
  blocked_at timestamptz not null default now(),
  blocked_by uuid,
  active boolean not null default true,
  unblocked_at timestamptz
);
alter table public.blocked_companies enable row level security;
revoke all on public.blocked_companies from anon, authenticated;

-- Any job from a removed company stays switched off, whichever source (employer board, Jooble, direct post) brings it.
create or replace function public.opportunities_block_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.active and exists (select 1 from public.blocked_companies b where b.name_key = lower(btrim(new.company_name)) and b.active) then
    new.active := false;
  end if;
  return new;
end $$;
create or replace trigger opportunities_block_guard before insert or update of active, company_name on public.opportunities
  for each row execute function public.opportunities_block_guard();

create or replace function public.admin_company_search(p_q text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_aldovra_admin();
  if length(btrim(coalesce(p_q, ''))) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('company_name', s.company_name, 'live_jobs', s.live_jobs, 'sources', s.sources,
      'blocked', exists (select 1 from public.blocked_companies b where b.name_key = s.k and b.active)) order by s.live_jobs desc, s.company_name)
    from (
      select lower(btrim(c.company_name)) k, min(btrim(c.company_name)) company_name, sum(c.live)::int live_jobs, sum(c.src)::int sources
      from (
        select company_name, (active)::int live, 0 src from public.opportunities where company_name ilike '%' || btrim(p_q) || '%'
        union all
        select company_name, 0, 1 from public.job_sources where company_name ilike '%' || btrim(p_q) || '%'
        union all
        select company_name, 0, 0 from public.blocked_companies where active and company_name ilike '%' || btrim(p_q) || '%'
      ) c group by 1 order by 3 desc limit 20) s), '[]'::jsonb);
end $$;

create or replace function public.admin_block_company(p_name text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key text := lower(btrim(coalesce(p_name, ''))); v_src uuid[]; v_jobs int;
begin
  perform public.assert_aldovra_admin();
  if length(v_key) < 2 then raise exception 'COMPANY_REQUIRED'; end if;
  select coalesce(array_agg(id), '{}') into v_src from public.job_sources where lower(btrim(company_name)) = v_key and enabled;
  update public.job_sources set enabled = false, updated_at = now(),
    last_sync_status = 'removed by admin ' || to_char(now() at time zone 'Asia/Kolkata', 'DD Mon YYYY')
   where id = any(v_src);
  insert into public.blocked_companies (name_key, company_name, reason, disabled_source_ids, blocked_by)
  values (v_key, btrim(p_name), nullif(btrim(coalesce(p_reason, '')), ''), v_src, auth.uid())
  on conflict (name_key) do update set reason = excluded.reason, company_name = excluded.company_name,
    disabled_source_ids = case when blocked_companies.active
      then (select array(select distinct unnest(blocked_companies.disabled_source_ids || excluded.disabled_source_ids)))
      else excluded.disabled_source_ids end,
    active = true, unblocked_at = null, blocked_at = now(), blocked_by = excluded.blocked_by;
  update public.opportunities set active = false where active and lower(btrim(company_name)) = v_key;
  get diagnostics v_jobs = row_count;
  update public.direct_job_posts set status = 'closed', closed_at = now(), updated_at = now(),
    admin_note = coalesce(admin_note, 'Company removed by admin')
   where lower(btrim(company_name)) = v_key and status in ('pending','approved');
  return jsonb_build_object('jobs_hidden', v_jobs, 'sources_disabled', coalesce(array_length(v_src, 1), 0));
end $$;

create or replace function public.admin_unblock_company(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key text := lower(btrim(coalesce(p_name, ''))); v_src uuid[]; v_n int := 0;
begin
  perform public.assert_aldovra_admin();
  update public.blocked_companies set active = false, unblocked_at = now() where name_key = v_key and active
   returning disabled_source_ids into v_src;
  if not found then return jsonb_build_object('restored', false); end if;
  update public.job_sources set enabled = true, updated_at = now(), last_synced_at = null, last_sync_status = 'restored by admin'
   where id = any(coalesce(v_src, '{}'));
  get diagnostics v_n = row_count;
  return jsonb_build_object('restored', true, 'sources_enabled', v_n);
end $$;

create or replace function public.admin_list_blocked_companies()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_aldovra_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('company_name', company_name, 'reason', reason, 'blocked_at', blocked_at,
    'sources', coalesce(array_length(disabled_source_ids, 1), 0)) order by blocked_at desc) from public.blocked_companies where active), '[]'::jsonb);
end $$;

revoke all on function public.admin_company_search(text), public.admin_block_company(text, text), public.admin_unblock_company(text),
  public.admin_list_blocked_companies() from public, anon;
grant execute on function public.admin_company_search(text), public.admin_block_company(text, text), public.admin_unblock_company(text),
  public.admin_list_blocked_companies() to authenticated;
revoke all on function public.opportunities_block_guard(), public.job_text_asks_fee(text) from public, anon, authenticated;
