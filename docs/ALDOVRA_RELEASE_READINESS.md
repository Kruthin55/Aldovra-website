# Aldovra — Release Readiness Audit
Updated: 2026-10-11

## Product direction — preserve existing work
- Keep the current UI, styling, authentication, dashboard, assessment flow, resume workflow, pricing pages, and Career Agent. Do not rebuild the app or remove existing features.
- Student journey: Register → basic profile → resume upload/analysis → required skill assessments → verification → AI Career Agent → matched job discovery/application preparation → application tracking.
- Assessment model: 30 MCQs / 20 minutes, 75% pass threshold, coding assessments for coding skills, and the existing ₹50/₹100 reattempt model.
- Razorpay/payment activation remains disabled. No student charges are enabled. The two live payment Edge Functions now return HTTP 410 `PAYMENTS_DISABLED`, and both require a valid JWT; no order creation or payment verification is performed.

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
- GitHub Actions static-check run #55 passed: inline JavaScript syntax, required page metadata, assessment configuration/verification invariants, future request defaults, server-authoritative timer behavior, and branded social metadata.
- The seven remaining SECURITY DEFINER RPCs have EXECUTE grants for `authenticated` only, not `anon`; no blanket revocations were applied.
- `create-razorpay-order` v3 and `verify-razorpay-payment` v2 are fail-closed stubs returning HTTP 410 `PAYMENTS_DISABLED`; `verify_jwt=true` for both. Static CI now guards these invariants.
- The existing payment table contains three rows marked `paid` (₹250 total); one has `entitlement_used=true` and two have `entitlement_used=false`. These historical records were not modified. Their legitimacy and the two unused entitlements require manual reconciliation before any payment feature is considered.
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


## Job automation milestone — 2026-10-11
- Added `job_application_tracker` with per-user RLS, authenticated-only grants, status tracking (`saved`, `preparing`, `ready`, `applied`, `interview`, `rejected`, `withdrawn`), and unique user/opportunity tracking.
- Career Agent now has a saved-job tracker and a Save job action on matched opportunities. Students can update their own application status and open the stored opportunity URL only when it is a valid HTTP(S) URL.
- This is the first working automation layer: discover existing Aldovra opportunities → match against career context/skills → save matches → track application status. It does not scrape job boards or auto-submit third-party applications.
- Career Agent application preparation now creates an editable, role-specific draft from the highest-scoring current match with a valid HTTP(S) application link. It uses available profile data and verified skills, saves the draft to the user's tracker, supports edit/autosave/copy, and explicitly requires review; it never auto-submits applications.
- Scheduled job discovery and first-source live ingestion remain blocked until an admin validates and enables an official board. No payments are enabled.

## Job discovery engine — 2026-10-11
- Deployed Supabase Edge Function `sync-job-sources` v6 with JWT verification enabled. It validates the user token and requires membership in `admin_users` before manual use; the scheduled path only accepts the exact server-side service-role token.
- Added job_sources registry restricted by RLS to admin users and supports only approved Greenhouse and Lever public board APIs; no login-gated scraping or anti-bot bypass.
- Imported jobs are deduplicated by provider/external job ID, application URLs must be HTTP(S), text is normalized, and records without a match to the existing Aldovra skill catalogue are skipped to avoid artificially high skill-free match scores.
- Source board token is stored per opportunity so stale-job expiry is scoped to the exact board. Listings older than 14 days are deactivated only after a successful provider response.
- The admin page validates the provider's fixed public API response before saving a board token, shows a small sample of role titles, and masks tokens in the source list. It never accepts arbitrary URLs.
- Source creation and enable/disable now run through the authenticated admin Edge Function. Browser clients have SELECT-only grants on `job_sources`, so direct client inserts/updates cannot bypass provider validation.
- Static CI run #108 passed after adding board-validation invariants.
- Current live counts: 0 configured sources, 0 enabled sources, 0 imported active jobs, and 1 existing active manual opportunity. Enterpret (Greenhouse) and Portcast (Lever) are candidates only; neither has been API-validated or saved. The admin page's built-in validation must succeed before saving; do not bypass it with direct SQL inserts.
- Scheduled sync remains disabled until a verified source is enabled and the service-role secret is stored in Supabase Vault. Do not expose the secret in client code or repository files.
- CI run #121 passed for the Career Agent application-draft workflow. CI run #125 passed after adding a least-privilege invariant guard.
- A database audit found excess `TRUNCATE`, `REFERENCES`, and `TRIGGER` grants for `authenticated` on `job_application_tracker`. Migration `revoke_excess_client_table_privileges` was applied live and committed to the repo; both job tables now explicitly grant authenticated clients only SELECT/INSERT/UPDATE/DELETE, with RLS retaining row ownership/admin boundaries. Rechecked that no `anon` or `authenticated` role retains TRUNCATE/REFERENCES/TRIGGER on public tables.
- Job imports now use the service-role-only `upsert_job_opportunity_atomic` RPC so an opportunity and its skill mappings commit together or roll back together; this avoids partial listings with missing skill mappings. CI guards the RPC privileges and transaction path.
- Added and applied 16 missing foreign-key indexes flagged by the Supabase performance advisor, covering assessment answers/attempts/reports/requests/sessions, skill lookups, resumes, and job matching/tracking. A live audit now confirms all 36 public-schema foreign keys have a covering leading index.
- Updated existing RLS policies to wrap `auth.uid()`, `auth.role()`, and `auth.jwt()` calls in scalar subqueries, preserving policy names and access logic while avoiding per-row helper reevaluation. Supabase's RLS-initplan performance warnings cleared in the latest advisor response; policy migration history is committed.
- Latest static CI run #182 passed after the RLS/FK performance hardening: https://github.com/Kruthin55/Aldovra-website/actions/runs/38120830972. Browser E2E tests and first-source live ingestion remain unverified.