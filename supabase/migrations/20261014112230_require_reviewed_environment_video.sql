ALTER TABLE public.assessment_reports
  DROP CONSTRAINT IF EXISTS assessment_reports_verification_status_check;

ALTER TABLE public.assessment_reports
  ADD CONSTRAINT assessment_reports_verification_status_check
  CHECK (
    verification_status = ANY (
      ARRAY[
        'pending'::text,
        'pending_review'::text,
        'eligible'::text,
        'reattempt_required'::text,
        'verified'::text,
        'rejected'::text
      ]
    )
  );

CREATE OR REPLACE FUNCTION public.get_explore_students()
RETURNS TABLE(
  student_id uuid,
  full_name text,
  role text,
  college text,
  overall_score numeric,
  verified boolean,
  verified_skills jsonb,
  rank bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH verified_skill_scores AS (
    SELECT aa.user_id, a.skill_id, max(aa.percentage) AS skill_score
    FROM public.assessment_attempts aa
    JOIN public.assessments a
      ON a.id = aa.assessment_id
    JOIN public.assessment_reports ar
      ON ar.session_id = aa.session_id
     AND ar.user_id = aa.user_id
     AND ar.verification_status IN ('eligible', 'verified')
     AND ar.percentage >= 75
    JOIN public.assessment_evidence ev
      ON ev.session_id = aa.session_id
     AND ev.user_id = aa.user_id
     AND nullif(btrim(ev.environment_video_url), '') IS NOT NULL
    WHERE aa.passed = true
      AND aa.percentage >= 75
      AND a.skill_id IS NOT NULL
    GROUP BY aa.user_id, a.skill_id
  ),
  student_summary AS (
    SELECT
      p.id AS student_id,
      p.full_name,
      p.role,
      p.college,
      round(avg(vss.skill_score), 2) AS overall_score,
      count(DISTINCT vss.skill_id) AS verified_skill_count,
      coalesce(
        jsonb_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name))
          FILTER (WHERE s.id IS NOT NULL),
        '[]'::jsonb
      ) AS verified_skills
    FROM public.profiles p
    LEFT JOIN verified_skill_scores vss ON vss.user_id = p.id
    LEFT JOIN public.skills s ON s.id = vss.skill_id
    WHERE p.role = 'student'
    GROUP BY p.id, p.full_name, p.role, p.college
  ),
  ranked_students AS (
    SELECT
      ss.*,
      dense_rank() OVER (ORDER BY ss.overall_score DESC NULLS LAST) AS calculated_rank
    FROM student_summary ss
  )
  SELECT
    rs.student_id,
    rs.full_name,
    rs.role,
    rs.college,
    rs.overall_score,
    (rs.verified_skill_count > 0) AS verified,
    rs.verified_skills,
    CASE WHEN rs.verified_skill_count > 0 THEN rs.calculated_rank ELSE NULL END AS rank
  FROM ranked_students rs
  ORDER BY (rs.verified_skill_count > 0) DESC, rs.overall_score DESC NULLS LAST, rs.full_name ASC;
$function$;