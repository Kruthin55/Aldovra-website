-- 13 Nov 2026: Admin "Verified students" tab. Every student with at least one valid certificate,
-- with contact, profile, verified skills and the resume facts the team needs to prepare a
-- custom resume (a benefit promised on the homepage), plus a "resume sent" tracker.

create table if not exists public.resume_deliveries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sent_at timestamptz,
  note text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.resume_deliveries enable row level security;
-- No policies: only the admin RPCs below (security definer) read or write it.

create or replace function public.admin_verified_students()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  perform public.assert_aldovra_admin();
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.first_verified_at desc)
    from (
      select
        c.user_id,
        u.email,
        coalesce(p.full_name, u.raw_user_meta_data->>'full_name', '') as full_name,
        p.college, p.degree, p.graduation_year, p.city, p.career_track,
        p.linkedin_url, p.github_url,
        pp.slug as profile_slug, coalesce(pp.is_public, false) as is_public,
        min(c.issued_at) as first_verified_at,
        jsonb_agg(jsonb_build_object('skill', coalesce(s.name, 'Skill'), 'score', c.score, 'code', c.code, 'issued_at', c.issued_at) order by c.score desc) as skills,
        (select r.file_path from public.student_resumes r where r.user_id = c.user_id order by r.uploaded_at desc limit 1) as resume_path,
        (select jsonb_build_object(
            'summary', r.parsed_data->'summary', 'education', r.parsed_data->'education',
            'projects', r.parsed_data->'projects', 'experience', r.parsed_data->'experience',
            'certifications', r.parsed_data->'certifications', 'skills', r.parsed_data->'skills')
          from public.student_resumes r where r.user_id = c.user_id and r.parsed_data is not null
          order by r.uploaded_at desc limit 1) as resume_facts,
        d.sent_at as resume_sent_at, d.note as resume_note
      from public.skill_certificates c
      join auth.users u on u.id = c.user_id
      left join public.profiles p on p.id = c.user_id
      left join public.public_profiles pp on pp.user_id = c.user_id
      left join public.skills s on s.id = c.skill_id
      left join public.resume_deliveries d on d.user_id = c.user_id
      where c.revoked_at is null
      group by c.user_id, u.email, u.raw_user_meta_data, p.full_name, p.college, p.degree, p.graduation_year,
               p.city, p.career_track, p.linkedin_url, p.github_url, pp.slug, pp.is_public, d.sent_at, d.note
    ) t
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_verified_students() from public, anon;
grant execute on function public.admin_verified_students() to authenticated;

create or replace function public.admin_set_resume_sent(p_user uuid, p_sent boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.assert_aldovra_admin();
  insert into public.resume_deliveries (user_id, sent_at, note, updated_by, updated_at)
  values (p_user, case when p_sent then now() end, nullif(left(coalesce(p_note, ''), 300), ''), auth.uid(), now())
  on conflict (user_id) do update
    set sent_at = case when p_sent then coalesce(public.resume_deliveries.sent_at, now()) end,
        note = coalesce(nullif(left(coalesce(p_note, ''), 300), ''), public.resume_deliveries.note),
        updated_by = auth.uid(), updated_at = now();
end;
$$;
revoke all on function public.admin_set_resume_sent(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_resume_sent(uuid, boolean, text) to authenticated;

-- Admins may open a student's uploaded resume (to prepare the custom resume).
drop policy if exists "Admins view student resumes" on storage.objects;
create policy "Admins view student resumes" on storage.objects for select to authenticated
  using (bucket_id = 'student-resumes' and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
