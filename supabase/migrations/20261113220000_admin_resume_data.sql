-- 13 Nov 2026: data for the admin resume builder (admin-resume.html?user=<uuid>).
-- One student's contact + profile, valid certificates and the latest parsed resume, so the team
-- can produce the promised resume in the standard Aldovra layout in one click. Works for any
-- student (admin only); the builder is opened from the "Verified students" tab.
create or replace function public.admin_resume_data(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  out jsonb;
begin
  perform public.assert_aldovra_admin();
  select jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'phone', coalesce(nullif(u.phone, ''), u.raw_user_meta_data->>'phone', ''),
    'full_name', coalesce(nullif(p.full_name, ''), u.raw_user_meta_data->>'full_name', ''),
    'city', p.city, 'college', p.college, 'degree', p.degree, 'graduation_year', p.graduation_year,
    'career_track', p.career_track, 'bio', p.bio, 'linkedin_url', p.linkedin_url, 'github_url', p.github_url,
    'profile_slug', pp.slug, 'is_public', coalesce(pp.is_public, false),
    'certificates', coalesce((
      select jsonb_agg(jsonb_build_object('skill', coalesce(s.name, 'Skill'), 'score', c.score, 'code', c.code, 'issued_at', c.issued_at) order by c.score desc nulls last)
      from public.skill_certificates c left join public.skills s on s.id = c.skill_id
      where c.user_id = u.id and c.revoked_at is null), '[]'::jsonb),
    'resume', (select r.parsed_data from public.student_resumes r
               where r.user_id = u.id and r.parsed_data is not null and r.status <> 'deleted'
               order by r.uploaded_at desc limit 1)
  ) into out
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.public_profiles pp on pp.user_id = u.id
  where u.id = p_user;
  return out;
end;
$$;
revoke all on function public.admin_resume_data(uuid) from public, anon;
grant execute on function public.admin_resume_data(uuid) to authenticated;
