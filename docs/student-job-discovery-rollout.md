# Student job discovery rollout checklist

This checklist accompanies `supabase/functions/student-job-discovery/index.ts` and the rate-limit migration.

## Current status
The student discovery function, rate-limit migration, Jobicy provider migration, and dashboard Refresh Jobs control are staged in the feature branch only. They have not been applied to the live database or deployed to Supabase. GitHub Actions Deno static check has passed, but no real browser E2E has been run.

## Pre-deploy requirements
- [ ] Review migration SQL and confirm service-role-only access to the rate-limit table and RPC.
- [x] Wire the dashboard Refresh Jobs control into the existing job section while preserving existing jobs tabs, filters and tracking actions.
- [ ] Validate candidate job sources using their official APIs; do not treat configured candidates as validated just because they are enabled.
- [ ] Confirm provider response formats and source-specific rate limits, including a live Jobicy smoke test (public endpoint is documented; direct endpoint validation has not yet succeeded in this environment).
- [ ] Run static TypeScript/Deno checks against the Edge Function.
- [ ] Test with a student JWT: first refresh allowed, immediate second refresh returns 429 with retry seconds, unauthenticated request returns 401.
- [ ] Test with no sources, one invalid source, a valid source, a source returning zero jobs, and a provider timeout.
- [ ] Verify one provider failure does not block other sources.
- [ ] Verify repeated imports do not duplicate opportunities.
- [ ] Verify invalid/unreachable feeds never cause stale-job expiry. Student-triggered refresh deliberately does not expire jobs.
- [ ] Test recommended and all-jobs tabs, saved jobs, open application links and applied tracker in a real browser.
- [ ] Keep payment functions disabled.
- [ ] Deploy the migration first, then the Edge Function, then merge the dashboard integration only after tests pass.

## Known limitation
The staged Jobicy migration changes the atomic upsert to retain valid jobs even when no current skill maps; such jobs appear in Explore All but do not receive fabricated skill matches. The public Jobicy feed only covers listings published in the last 7 days; absence from the feed must not be interpreted as a closed job. The student-triggered importer checks a bounded subset of listings per source to stay within Edge Function runtime limits; broader pagination belongs in a separate ingestion worker.

## Rollback
Disable the dashboard refresh control first, then redeploy/revert the Edge Function. Do not drop the rate-limit table until confirming no deployed function calls it. Existing jobs and application tracker data should remain untouched.
