-- Aldovra RPC execute-grant hardening proposal
-- Branch: fix/assessment-reattempt-request-scope
--
-- IMPORTANT:
-- 1. This file is a proposed migration only. It has NOT been run against Supabase.
-- 2. Review and test in a non-production Supabase project first.
-- 3. This intentionally does not enable Razorpay or any payment flow.
-- 4. Trigger functions below are retained; only direct client EXECUTE grants are removed.
--
-- Intended access:
-- - submit_assessment: authenticated users only (function itself requires auth.uid()).
-- - match_my_opportunities: authenticated users only (function itself requires auth.uid()).
-- - consume_assessment_reattempt: service_role only until the payment/reattempt caller is
--   reviewed. The current function accepts p_user_id as an argument and does not itself
--   compare it with auth.uid(), so it must not be callable by untrusted client roles.
-- - notification functions: trigger-only; no direct client EXECUTE grants.
--
-- Apply as a single transaction after confirming the exact function signatures and
-- testing the assessment submit and notification trigger flows.

BEGIN;

-- Remove non-application table privileges that bypass RLS or are unnecessary
-- for normal web clients. CRUD access remains governed by the existing RLS policies.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- Question view should honor the querying user's underlying table permissions/RLS.
-- The base table exposes questions to authenticated users; correct answers are not
-- selected by this view.
ALTER VIEW public.assessment_question_public SET (security_invoker = true);
REVOKE ALL ON public.assessment_question_public FROM anon;
GRANT SELECT ON public.assessment_question_public TO authenticated;

-- Assessment submission: signed-in students only.
REVOKE ALL ON FUNCTION public.submit_assessment(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_assessment(bigint, jsonb)
  TO authenticated;

-- Profile save and platform statistics: signed-in users only.
-- Both are SECURITY DEFINER functions exposed in the public API schema.
REVOKE ALL ON FUNCTION public.save_student_profile(text, text, text, text, integer, text, text, text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_student_profile(text, text, text, text, integer, text, text, text, text, integer)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_platform_statistics()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_statistics()
  TO authenticated;

-- Career opportunity matching: signed-in users only.
REVOKE ALL ON FUNCTION public.match_my_opportunities()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_my_opportunities()
  TO authenticated;

-- Payment entitlement consumption: backend/service role only.
-- Do not grant this to authenticated until the caller and authorization checks
-- have been redesigned and reviewed. This does not enable payment processing.
REVOKE ALL ON FUNCTION public.consume_assessment_reattempt(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_assessment_reattempt(uuid, uuid, bigint)
  TO service_role;

-- Trigger/event-trigger functions should not be directly callable through the client API.
-- Revoking direct EXECUTE does not remove existing triggers; verify trigger flows in staging.
REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_screening_call()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_assessment_result()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_resume_analysis()
  FROM PUBLIC, anon, authenticated;

COMMIT;

-- Post-migration verification (run separately):
-- SELECT p.proname, x.grantee, x.privilege_type
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'submit_assessment', 'match_my_opportunities',
--     'consume_assessment_reattempt',
--     'notify_assessment_result', 'notify_resume_analysis'
--   )
-- ORDER BY p.proname, x.grantee;
