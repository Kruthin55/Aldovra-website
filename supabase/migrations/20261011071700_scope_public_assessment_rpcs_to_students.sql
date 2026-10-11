CREATE OR REPLACE FUNCTION public.get_public_student_assessment_stats(target_student_id uuid)
RETURNS TABLE(total_assessments bigint, passed_assessments bigint, average_score numeric, best_score numeric, verified_skill_count bigint, skill_performance jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH best_assessment_scores AS (
    SELECT aa.user_id, aa.assessment_id, max(aa.percentage) AS best_score
    FROM public.assessment_attempts aa
    WHERE aa.user_id = target_student_id
      AND aa.percentage IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = target_student_id AND p.role = 'student'
      )
    GROUP BY aa.user_id, aa.assessment_id
  ),
  assessment_summary AS (
    SELECT
      count(*) AS total_assessments,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.assessment_attempts passed_attempt
          WHERE passed_attempt.user_id = target_student_id
            AND passed_attempt.assessment_id = bas.assessment_id
            AND passed_attempt.passed = true
        )
      ) AS passed_assessments,
      round(avg(bas.best_score), 2) AS average_score,
      round(max(bas.best_score), 2) AS best_score
    FROM best_assessment_scores bas
  ),
  verified_skills AS (
    SELECT count(DISTINCT a.skill_id) AS verified_skill_count
    FROM public.assessment_attempts aa
    JOIN public.assessments a ON a.id = aa.assessment_id
    WHERE aa.user_id = target_student_id
      AND aa.passed = true
      AND a.skill_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = target_student_id AND p.role = 'student'
      )
  ),
  skill_scores AS (
    SELECT s.id AS skill_id, s.name AS skill_name,
      round(max(aa.percentage), 2) AS score
    FROM public.assessment_attempts aa
    JOIN public.assessments a ON a.id = aa.assessment_id
    JOIN public.skills s ON s.id = a.skill_id
    WHERE aa.user_id = target_student_id
      AND aa.passed = true
      AND aa.percentage IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = target_student_id AND p.role = 'student'
      )
    GROUP BY s.id, s.name
  ),
  skill_json AS (
    SELECT coalesce(
      jsonb_agg(jsonb_build_object('id', skill_id, 'name', skill_name, 'score', score)
        ORDER BY skill_name),
      '[]'::jsonb
    ) AS skill_performance
    FROM skill_scores
  )
  SELECT assessment_summary.total_assessments,
    assessment_summary.passed_assessments,
    assessment_summary.average_score,
    assessment_summary.best_score,
    verified_skills.verified_skill_count,
    skill_json.skill_performance
  FROM assessment_summary
  CROSS JOIN verified_skills
  CROSS JOIN skill_json;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_student_assessments(p_student_id uuid)
RETURNS TABLE(assessment_id bigint, assessment_title text, skill_name text, best_score integer, best_percentage numeric, best_passed boolean, attempt_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH ranked_attempts AS (
    SELECT aa.assessment_id, aa.score, aa.percentage, aa.passed, aa.created_at,
      row_number() OVER (
        PARTITION BY aa.assessment_id
        ORDER BY aa.percentage DESC NULLS LAST, aa.created_at DESC
      ) AS score_rank
    FROM public.assessment_attempts aa
    WHERE aa.user_id = p_student_id
      AND aa.submitted_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_student_id AND p.role = 'student'
      )
  )
  SELECT a.id AS assessment_id, a.title AS assessment_title, s.name AS skill_name,
    best.score AS best_score, best.percentage AS best_percentage,
    best.passed AS best_passed, count(all_attempts.assessment_id) AS attempt_count
  FROM public.assessments a
  JOIN public.skills s ON s.id = a.skill_id
  JOIN ranked_attempts best ON best.assessment_id = a.id AND best.score_rank = 1
  JOIN ranked_attempts all_attempts ON all_attempts.assessment_id = a.id
  GROUP BY a.id, a.title, s.name, best.score, best.percentage, best.passed
  ORDER BY max(all_attempts.created_at) DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_public_student_assessment_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_student_assessment_stats(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_public_student_assessments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_student_assessments(uuid) TO authenticated;
