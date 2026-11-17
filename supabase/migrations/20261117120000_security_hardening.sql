-- 17 Nov 2026 security audit (27-step checklist). Defence in depth; RLS already blocked these.
-- 1) anon never needs to write to these tables (no anon policies exist), so drop the grants.
revoke insert, update, delete on
  public.student_skills, public.profiles, public.skills, public.assessments, public.career_tracks,
  public.assessment_questions, public.admin_users, public.assessment_request_details,
  public.screening_calls, public.career_track_skills
from anon;

-- 2) Students may edit their own profile fields, but not role/id/created_at.
--    Profiles are created by handle_new_user()/save_student_profile() (SECURITY DEFINER)
--    and removed by purge_user_account(), so no direct insert/delete is needed.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, city, college, degree, graduation_year, career_track, bio,
              github_url, linkedin_url, profile_completion)
  on public.profiles to authenticated;

-- 3) Old "Explore students" RPCs (page retired) let any signed-in user read another
--    student's scores by id. Nothing calls them now.
revoke execute on function public.get_public_student_assessments(uuid) from public, anon, authenticated;
revoke execute on function public.get_public_student_assessment_stats(uuid) from public, anon, authenticated;

-- 4) Trigger function: never meant to be called over the API.
revoke execute on function public.notify_welcome_student() from public, anon, authenticated;
