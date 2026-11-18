-- Certificate proof summary (18 Nov 2026): what the test was and how it was checked,
-- shown on /cert and to approved recruiters. Never exposes the environment video link,
-- snapshots or questions; only counts and yes/no facts.
create or replace function public.certificate_proof(p_certificate_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'questions', r.total_questions,
    'minutes', case when s.expires_at is not null and s.started_at is not null
                    then round(extract(epoch from (s.expires_at - s.started_at)) / 60)::int end,
    'proctored', (e.id is not null and (coalesce(e.snapshot_count, 0) > 0 or e.camera_path is not null or e.audio_path is not null)),
    'environment_reviewed', (e.environment_video_url is not null
                             and coalesce(d.verification_status, '') = 'verified'),
    'integrity_events', (select count(*)::int from public.assessment_monitor_events m
                          where m.session_id = r.session_id
                            and m.event_type in ('tab_hidden','window_blur','fullscreen_exit','screen_share_stopped','blocked_shortcut'))
  )
  from public.skill_certificates c
  left join public.assessment_reports r on r.id = c.report_id
  left join public.assessment_sessions s on s.id = r.session_id
  left join public.assessment_evidence e on e.session_id = r.session_id
  left join public.assessment_request_details d on d.request_id::text = s.request_id
  where c.id = p_certificate_id
  limit 1;
$$;
revoke all on function public.certificate_proof(uuid) from public, anon, authenticated;

create or replace function public.verify_certificate(p_code text)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  c public.skill_certificates;
  pp public.public_profiles;
  holder text;
  skill text;
  title text;
begin
  select * into c from public.skill_certificates where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('found', false);
  end if;
  select * into pp from public.public_profiles where user_id = c.user_id;
  select coalesce(nullif(btrim(full_name), ''), 'Aldovra Student') into holder from public.profiles where id = c.user_id;
  select name into skill from public.skills where id = c.skill_id;
  select a.title into title from public.assessments a where a.id = c.assessment_id;
  return jsonb_build_object(
    'found', true,
    'valid', c.revoked_at is null,
    'code', c.code,
    'holder', holder,
    'skill', skill,
    'assessment', title,
    'score', case when coalesce(pp.show_scores, true) then c.score end,
    'issued_at', c.issued_at,
    'revoked_at', c.revoked_at,
    'profile_slug', case when pp.is_public then pp.slug end,
    'proof', public.certificate_proof(c.id));
end;
$function$;

create or replace function public.get_verified_candidates_for_recruiters(p_search text DEFAULT NULL::text, p_skill text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(student_id uuid, full_name text, city text, college text, degree text, graduation_year integer, career_track text, profile_completion integer, github_url text, linkedin_url text, verified_skills jsonb, average_score numeric, verified_skill_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    select c.user_id, s.name as skill_name, c.score::numeric as score, c.issued_at as verified_at, c.code,
           public.certificate_proof(c.id) as proof
    from public.skill_certificates c
    join public.skills s on s.id = c.skill_id
    where c.revoked_at is null
  ),
  evidence_rollup as (
    select
      e.user_id,
      jsonb_agg(jsonb_build_object('name', e.skill_name, 'score', e.score, 'verified_at', e.verified_at, 'certificate', e.code, 'proof', e.proof)
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
