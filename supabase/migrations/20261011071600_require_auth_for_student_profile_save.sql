CREATE OR REPLACE FUNCTION public.save_student_profile(
  p_full_name text,
  p_city text,
  p_college text,
  p_degree text,
  p_graduation_year integer,
  p_bio text,
  p_github_url text,
  p_linkedin_url text,
  p_career_track text,
  p_profile_completion integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.profiles (
    id, full_name, role, city, college, degree, graduation_year,
    bio, github_url, linkedin_url, career_track, profile_completion
  )
  VALUES (
    v_user_id, p_full_name, 'student', p_city, p_college, p_degree,
    p_graduation_year, p_bio, p_github_url, p_linkedin_url, p_career_track,
    greatest(0, least(coalesce(p_profile_completion, 0), 100))
  )
  ON CONFLICT (id)
  DO UPDATE SET
    full_name = excluded.full_name,
    city = excluded.city,
    college = excluded.college,
    degree = excluded.degree,
    graduation_year = excluded.graduation_year,
    bio = excluded.bio,
    github_url = excluded.github_url,
    linkedin_url = excluded.linkedin_url,
    career_track = excluded.career_track,
    profile_completion = excluded.profile_completion;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_student_profile(text, text, text, text, integer, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_student_profile(text, text, text, text, integer, text, text, text, text, integer) TO authenticated;
