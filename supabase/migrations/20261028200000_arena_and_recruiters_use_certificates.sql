-- Arena + recruiter talent pool count only admin-approved skills (28 Oct 2026).
-- Single source of truth: public.skill_certificates (issued only after 75%+, environment video, admin approval).
-- Signatures and return columns are unchanged, so the dashboard and HR pages need no change.

create or replace function public.get_competitive_leaderboard(p_scope text default 'all_time', p_skill_id bigint default null, p_limit integer default 50)
returns table(rank bigint, student_id uuid, display_name text, college text, points integer, average_score numeric,
              verified_skill_count integer, verified_skills jsonb, tier text, top_percent integer, total_competitors bigint, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_month_start timestamptz :=
    date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  with verified_skill_scores as (
    select c.user_id, c.skill_id, c.score as skill_score
    from public.skill_certificates c
    where c.revoked_at is null
      and (p_skill_id is null or c.skill_id = p_skill_id)
      and (coalesce(p_scope, 'all_time') <> 'month' or c.issued_at >= v_month_start)
  ),
  summary as (
    select
      p.id, p.full_name, nullif(btrim(p.college), '') as college,
      sum(round(v.skill_score * 10))::integer as pts,
      round(avg(v.skill_score), 1) as avg_score,
      count(*)::integer as skill_count,
      jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'score', round(v.skill_score))
        order by v.skill_score desc) as skills
    from verified_skill_scores v
    join public.profiles p on p.id = v.user_id and p.role = 'student'
    left join public.skills s on s.id = v.skill_id
    group by p.id, p.full_name, p.college
  ),
  ranked as (
    select su.*, rank() over (order by su.pts desc, su.avg_score desc) as rk, count(*) over () as total
    from summary su
  )
  select
    r.rk,
    r.id,
    case
      when nullif(btrim(r.full_name), '') is null then 'Aldovra Student'
      when array_length(regexp_split_to_array(btrim(r.full_name), '\s+'), 1) = 1
        then initcap(btrim(r.full_name))
      else initcap((regexp_split_to_array(btrim(r.full_name), '\s+'))[1]) || ' ' ||
           upper(left((regexp_split_to_array(btrim(r.full_name), '\s+'))[
             array_length(regexp_split_to_array(btrim(r.full_name), '\s+'), 1)
           ], 1)) || '.'
    end,
    r.college, r.pts, r.avg_score, r.skill_count, r.skills,
    case
      when r.pts >= 4500 then 'Diamond'
      when r.pts >= 3000 then 'Platinum'
      when r.pts >= 1800 then 'Gold'
      when r.pts >= 850 then 'Silver'
      else 'Bronze'
    end,
    greatest(1, ceil(100.0 * r.rk / r.total))::integer,
    r.total,
    r.id = v_uid
  from ranked r
  where r.rk <= v_limit or r.id = v_uid
  order by r.rk, r.pts desc;
end;
$function$;

create or replace function public.get_verified_candidates_for_recruiters(p_search text default null, p_skill text default null,
  p_location text default null, p_limit integer default 100, p_offset integer default 0)
returns table(student_id uuid, full_name text, city text, college text, degree text, graduation_year integer, career_track text,
              profile_completion integer, github_url text, linkedin_url text, verified_skills jsonb, average_score numeric, verified_skill_count integer)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not (
    exists (select 1 from public.recruiter_access r where r.user_id = auth.uid() and r.approved = true)
    or exists (select 1 from public.admin_users a where a.user_id = auth.uid())
  ) then
    raise exception 'Approved recruiter access required';
  end if;

  return query
  with skill_evidence as (
    select c.user_id, s.name as skill_name, c.score::numeric as score, c.issued_at as verified_at, c.code
    from public.skill_certificates c
    join public.skills s on s.id = c.skill_id
    where c.revoked_at is null
  ),
  evidence_rollup as (
    select
      e.user_id,
      jsonb_agg(jsonb_build_object('name', e.skill_name, 'score', e.score, 'verified_at', e.verified_at, 'certificate', e.code)
        order by e.skill_name) as skill_list,
      avg(e.score)::numeric as avg_score,
      count(*)::integer as skill_count
    from skill_evidence e
    group by e.user_id
  )
  select
    p.id,
    coalesce(nullif(p.full_name, ''), 'Aldovra student'),
    nullif(p.city, ''),
    nullif(p.college, ''),
    nullif(p.degree, ''),
    p.graduation_year,
    nullif(p.career_track, ''),
    coalesce(p.profile_completion, 0),
    nullif(p.github_url, ''),
    nullif(p.linkedin_url, ''),
    e.skill_list,
    round(e.avg_score, 1),
    e.skill_count
  from public.student_recruiter_visibility v
  join public.profiles p on p.id = v.user_id
  join evidence_rollup e on e.user_id = p.id
  where v.enabled = true
    and (
      p_search is null or btrim(p_search) = ''
      or coalesce(p.full_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(p.career_track, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(p.college, '') ilike '%' || btrim(p_search) || '%'
    )
    and (
      p_skill is null or btrim(p_skill) = ''
      or exists (select 1 from skill_evidence se where se.user_id = p.id and se.skill_name ilike '%' || btrim(p_skill) || '%')
    )
    and (
      p_location is null or btrim(p_location) = ''
      or coalesce(p.city, '') ilike '%' || btrim(p_location) || '%'
    )
  order by e.skill_count desc, e.avg_score desc, p.full_name asc
  limit greatest(1, least(coalesce(p_limit, 100), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$function$;
