-- Only expose student profiles through the Explore directory RPC.
-- Scores/verified skills are intentionally summarized; admin/staff profiles are excluded.
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
SET search_path TO 'public'
AS $function$
  WITH verified_skill_scores AS (
    SELECT aa.user_id, a.skill_id, max(aa.percentage) AS skill_score
    FROM public.assessment_attempts aa
    JOIN public.assessments a ON a.id = aa.assessment_id
    WHERE aa.passed = true
      AND aa.percentage IS NOT NULL
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
