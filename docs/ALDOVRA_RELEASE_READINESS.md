# Aldovra — Release Readiness Audit
Updated: 2026-10-11

## Product direction — preserve existing work
- Keep the current UI, styling, authentication, dashboard, assessment flow, resume workflow, pricing pages, and Career Agent. Do not rebuild the app or remove existing features.
- Student journey: Register → basic profile → resume upload/analysis → required skill assessments → verification → AI Career Agent → matched job discovery/application preparation → application tracking.
- Assessment model: 30 MCQs / 20 minutes, 75% pass threshold, coding assessments for coding skills, and the existing ₹50/₹100 reattempt model.
- Razorpay/payment activation remains disabled. No student charges are enabled.

## Changes applied and verified
- Supabase migrations applied: `harden_aldovra_rpc_and_question_view_security`, `lock_assessment_writes_to_trusted_edge_functions`, `disable_legacy_direct_assessment_rpc`, `force_student_role_on_signup`, `restrict_explore_directory_to_students`, `align_assessment_duration_and_pass_threshold`, and `set_assessment_request_defaults_to_30_questions_20_minutes`.
- Assessment question view uses `security_invoker=true` and does not expose `correct_option`.
- Browser INSERT/UPDATE/DELETE grants are absent for `assessment_attempts`, `assessment_answers`, `assessment_reports`, `assessment_requests`, and `assessment_payments`.
- Legacy `submit_assessment` RPC has no client EXECUTE grant; assessment submissions use the authenticated Edge Function.
- New signup profiles are forced to role `student`; Explore directory returns student profiles only.
- Live Edge Function versions: `submit-assessment` v8 and `generate-assessment` v16.
- Passing results (75%+) sync the assessment's linked skill to `student_skills.status='verified'`; failed attempts do not downgrade existing verified skills.
- Expired submissions get a 15-second network-transit grace period, then are rejected and cannot earn verification.
- The generator now returns server-calculated `remaining_seconds` for both new and resumed sessions; the assessment UI uses it so refreshing cannot reset the full timer.
- All 48 active assessment rows are set to 20 minutes / 75%, and all 48 have linked skill IDs.
- Future `assessment_request_details` defaults are `question_count=30` and `duration_minutes=20`. Historical completed/rejected request details were intentionally preserved.
- Assessment page display/countdown fallback values match 30 questions / 20 minutes.
- GitHub Actions static-check run #51 passed: inline JavaScript syntax, required page metadata, assessment configuration/verification invariants, future request defaults, and server-authoritative timer behavior. Additional Twitter metadata assertions were added afterward; their run is pending.
- The seven remaining SECURITY DEFINER RPCs have EXECUTE grants for `authenticated` only, not `anon`; no blanket revocations were applied.
- Homepage canonical URL, Open Graph URL/site name/image, and Twitter title/description/image metadata are present in the repo. `robots.txt` and `sitemap.xml` exist and list the public homepage.
- The deployed `submit-assessment` and `generate-assessment` sources are version-controlled under `supabase/functions/`.

## Not yet verified — do not claim production-ready
- Real browser end-to-end: signup/login/logout, profile save, resume upload/analysis, assessment request/start/submit/result, exactly 30 generated questions and 20-minute expiry, timer auto-submit with network delay, expired-session rejection, passing skill verification sync, failed-reattempt non-downgrade, ₹50/₹100 UI states, Career Agent context/matching, and external application links.
- Responsive visual QA on mobile/tablet/desktop; keyboard/focus/accessibility checks.
- Confirmation that canonical/social metadata, robots/sitemap, and headers serve correctly on the live domain. Direct access to the live site could not be confirmed in this audit.
- Leaked-password protection remains disabled and requires a deliberate Supabase Auth settings change.
- Confirm database backup/restore and rollback steps before production release.

## Release gate
PR #9 remains open and unmerged: https://github.com/Kruthin55/Aldovra-website/pull/9

Do not merge/deploy until browser end-to-end checks pass. Keep Razorpay/payment disabled.
