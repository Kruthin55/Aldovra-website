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

-- Assessment submission: signed-in students only.
REVOKE ALL ON FUNCTION public.submit_assessment(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_assessment(bigint, jsonb)
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

-- Trigger functions should not be directly callable through the client API.
-- Existing triggers remain attached; validate them after applying in staging.
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
