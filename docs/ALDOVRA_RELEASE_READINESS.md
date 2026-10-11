# Aldovra — Release Readiness Audit
Updated: 2026-10-11

## Product direction (preserve)
- Keep the existing site, styling, authentication, student dashboard, assessments, resume workflow, pricing pages, and Career Agent. Do not rebuild the app or remove existing features.
- Student journey: Register → basic profile → resume upload/analysis → required skill assessments → verification → AI Career Agent → matched job discovery/application preparation → application tracking.
- Assessment model: 30 MCQs / 20 minutes as the agreed target; coding assessments for coding skills; 75% pass threshold; reattempt pricing model ₹50/₹100.
- Payment provider remains disabled until the business/payment setup is ready. Do not activate Razorpay or charge users.

## Verified in this work session
- Inline JavaScript syntax checks passed for index.html, dashboard.html, career-agent.html, and assessment.html.
- Supabase migrations applied: harden_aldovra_rpc_and_question_view_security, lock_assessment_writes_to_trusted_edge_functions, disable_legacy_direct_assessment_rpc, force_student_role_on_signup, restrict_explore_directory_to_students.
- Confirmed assessment_question_public uses security_invoker=true and exposes only question prompt/options (not correct_option).
- Confirmed browser INSERT/UPDATE/DELETE grants are absent for assessment_attempts, assessment_answers, assessment_reports, assessment_requests, and assessment_payments.
- Confirmed legacy submit_assessment RPC has no client EXECUTE grants; assessment submission stays on the authenticated submit-assessment Edge Function.
- Confirmed trigger on auth.users remains enabled after hardening handle_new_user; new profiles now default to role=student regardless of signup metadata.
- Restricted Explore directory RPC results to profiles with role=student, so admin/staff profiles are excluded.
- Razorpay remains disabled; no payment flow was enabled.
- PR #9 remains open and unmerged: https://github.com/Kruthin55/Aldovra-website/pull/9

## Not yet verified — do not claim production-ready
- Real browser end-to-end: signup/login/logout, profile save, resume upload and analysis, assessment request/start/submit/result, attempt/reattempt state and ₹50/₹100 UI states, Career Agent context and matching, external application links.
- Responsive visual QA on mobile/tablet/desktop; keyboard/focus/accessibility checks.
- Security Advisor findings still remain for intended authenticated SECURITY DEFINER RPCs: get_explore_students, get_my_career_context, get_platform_statistics, get_public_student_assessment_stats, get_public_student_assessments, match_my_opportunities, save_student_profile. Review callers and outputs before altering grants/function modes.
- Enable leaked-password protection in Supabase Auth after confirming product settings and impact.
- Verify signup behavior against the deployed frontend and test that existing users can still sign in.
- SEO deployment details: production canonical URL, robots.txt/sitemap, social preview metadata, real page URLs, and deployed headers are not confirmed in this repo audit.
- Confirm database backup/restore procedure and rollback steps before a production release.

## Release gate
Do not merge/deploy the current PR until browser end-to-end checks pass. Do not apply blanket permission changes to remaining RPCs without verifying frontend callers. Keep Razorpay/payment disabled.
