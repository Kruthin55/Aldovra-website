-- Aldovra Arena: competitive leaderboard for signed-in students.
-- Only students with a verified skill (passed >= 75%, eligible/verified report,
-- environment video submitted) are ranked. Names are shown as "First L."
-- so the board is competitive without exposing full identities.

create or replace function public.get_competitive_leaderboard(
  p_scope text default 'all_time',
  p_skill_id bigint default null,
  p_limit integer default 50
)
returns table (
  rank bigint,
  student_id uuid,
  display_name text,
  college text,
  points integer,
  average_score numeric,
  verified_skill_count integer,
  verified_skills jsonb,
  tier text,
  top_percent integer,
  total_competitors bigint,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    select aa.user_id, a.skill_id, max(aa.percentage) as skill_score
    from public.assessment_attempts aa
    join public.assessments a
      on a.id = aa.assessment_id
    join public.assessment_reports ar
      on ar.session_id = aa.session_id
     and ar.user_id = aa.user_id
     and ar.verification_status in ('eligible', 'verified')
     and ar.percentage >= 75
    join public.assessment_evidence ev
      on ev.session_id = aa.session_id
     and ev.user_id = aa.user_id
     and nullif(btrim(ev.environment_video_url), '') is not null
    where aa.passed = true
      and aa.percentage >= 75
      and a.skill_id is not null
      and (p_skill_id is null or a.skill_id = p_skill_id)
      and (coalesce(p_scope, 'all_time') <> 'month' or aa.submitted_at >= v_month_start)
    group by aa.user_id, a.skill_id
  ),
  summary as (
    select
      p.id,
      p.full_name,
      nullif(btrim(p.college), '') as college,
      sum(round(v.skill_score * 10))::integer as pts,
      round(avg(v.skill_score), 1) as avg_score,
      count(*)::integer as skill_count,
      jsonb_agg(
        jsonb_build_object('id', s.id, 'name', s.name, 'score', round(v.skill_score))
        order by v.skill_score desc
      ) as skills
    from verified_skill_scores v
    join public.profiles p
      on p.id = v.user_id
     and p.role = 'student'
    left join public.skills s
      on s.id = v.skill_id
    group by p.id, p.full_name, p.college
  ),
  ranked as (
    select
      su.*,
      rank() over (order by su.pts desc, su.avg_score desc) as rk,
      count(*) over () as total
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
    r.college,
    r.pts,
    r.avg_score,
    r.skill_count,
    r.skills,
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
$$;

revoke all on function public.get_competitive_leaderboard(text, bigint, integer) from public, anon;
grant execute on function public.get_competitive_leaderboard(text, bigint, integer) to authenticated;
