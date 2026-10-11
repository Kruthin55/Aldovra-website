-- Aldovra production security hardening
-- Applied to Supabase project after reviewing current Edge Function callers.
-- Razorpay remains disabled. Existing UI and read paths are preserved.
--
-- This migration is intentionally limited to:
--   * remove unneeded browser privileges that bypass RLS or allow DDL/trigger ops
--   * make assessment-question view use invoker permissions without exposing answers
--   * restrict SECURITY DEFINER RPC execution to intended roles
--   * keep assessment writes behind trusted Edge Functions (service-role client)
--
-- Apply to a matching schema only; run the post-migration checks separately.

BEGIN;

-- Browser clients do not need table-level TRUNCATE, REFERENCES, or TRIGGER.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- The view must enforce the caller's permissions/RLS on assessment_questions.
-- It intentionally omits correct_option. Column grants avoid exposing the answer key.
ALTER VIEW public.assessment_question_public SET (security_invoker = true);
REVOKE ALL ON public.assessment_question_public FROM PUBLIC, anon;
GRANT SELECT ON public.assessment_question_public TO authenticated;
GRANT SELECT (id, assessment_id, question_text, option_a, option_b, option_c, option_d, created_at)
  ON public.assessment_questions TO authenticated;

-- Assessment submission: signed-in users only. Actual writes are handled by the
-- submit-assessment Edge Function using its server-side service-role client.
REVOKE ALL ON FUNCTION public.submit_assessment(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_assessment(bigint, jsonb)
  TO authenticated;

-- Career opportunity matching: signed-in users only.
REVOKE ALL ON FUNCTION public.match_my_opportunities()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_my_opportunities()
  TO authenticated;

-- Profile save is used by the authenticated dashboard.
REVOKE ALL ON FUNCTION public.save_student_profile(text, text, text, text, integer, text, text, text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_student_profile(text, text, text, text, integer, text, text, text, text, integer)
  TO authenticated;

-- Statistics do not need anonymous execution.
REVOKE ALL ON FUNCTION public.get_platform_statistics()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_statistics()
  TO authenticated;

-- Entitlement consumption is backend-only. Payment integration remains disabled.
REVOKE ALL ON FUNCTION public.consume_assessment_reattempt(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_assessment_reattempt(uuid, uuid, bigint)
  TO service_role;

-- Trigger/event-trigger handlers are not API RPCs. Existing triggers stay attached.
REVOKE ALL ON FUNCTION public.notify_assessment_result()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_resume_analysis()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_screening_call()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated;

-- Keep assessment attempts, answers, reports, requests and payment rows read-only
-- to browser clients. Trusted Edge Functions perform the writes server-side.
DROP POLICY IF EXISTS "Users can update own assessment attempts"
  ON public.assessment_attempts;
REVOKE INSERT, UPDATE, DELETE ON public.assessment_attempts
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.assessment_answers
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.assessment_reports
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.assessment_requests
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.assessment_payments
  FROM PUBLIC, anon, authenticated;

COMMIT;

-- Verification queries:
-- 1. Supabase Security Advisor should no longer report security_definer_view or
--    anon_security_definer_function_executable for the functions above.
-- 2. Confirm public.assessment_question_public has security_invoker=true.
-- 3. Confirm assessment_attempts/answers/reports/requests/payments have no client
--    INSERT/UPDATE/DELETE grants and the trusted Edge Functions still work.
-- 4. Confirm the existing triggers remain attached and enabled.
