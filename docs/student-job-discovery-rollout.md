# Student job discovery rollout checklist

This checklist accompanies `supabase/functions/student-job-discovery/index.ts` and the rate-limit migration.

## Current status
The function and migration are staged in the feature branch only. They have not been applied to the live database or deployed to Supabase. The dashboard refresh control still needs to be wired into the existing job section before the feature can be considered end-to-end.

## Pre-deploy requirements
- [ ] Review migration SQL and confirm service-role-only access to the rate-limit table and RPC.
- [ ] Fix/confirm the dashboard integration point and preserve existing jobs tabs, filters and tracking actions.
- [ ] Validate candidate job sources using their official APIs; do not treat configured candidates as validated just because they are enabled.
- [ ] Confirm provider response formats and source-specific rate limits.
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
The current atomic database upsert requires at least one matched skill. Valid postings that do not match the current skill catalogue are skipped. A future schema-safe improvement should allow valid jobs to be stored with zero mapped skills without generating an artificial match score.

## Rollback
Disable the dashboard refresh control first, then redeploy/revert the Edge Function. Do not drop the rate-limit table until confirming no deployed function calls it. Existing jobs and application tracker data should remain untouched.
