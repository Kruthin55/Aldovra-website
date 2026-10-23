# Aldovra Job Pipeline Operations Runbook

This runbook documents safe recovery and release checks for the job discovery pipeline. It does not replace production monitoring or guarantee that every employer board is always available.

## Current production contract

- Edge Function: `sync-job-sources`
- Source sync cron: `aldovra-job-source-sync` — every 5 minutes
- Application-link check cron: `aldovra-application-link-check` — at minute 15 every 4 hours
- The sync function processes a rotating batch of four sources per invocation. A 5-minute cron does **not** mean each source is refreshed every 5 minutes.
- Import only listings with a usable HTTP(S) application URL and a positive fresher/early-career signal; do not classify unknown experience as fresher.
- Only deactivate unseen listings when the provider response is known to be a complete snapshot. Partial/capped feeds must not be used to close jobs.
- Keep provider credentials and the cron secret in Supabase secrets/Vault; never commit them to the repository or expose them in client code.

## Automated public-site smoke check

GitHub Actions workflow: `.github/workflows/aldovra-live-smoke-check.yml`

- Runs hourly and can also be started manually from the repository's Actions tab.
- Checks that `https://aldovra.com/` responds with HTTP 200, includes a basic Aldovra content marker, and does not redirect away from the expected Aldovra domain.
- A failed workflow run is recorded in GitHub Actions. Repository notification/email delivery depends on the repository owner's GitHub notification settings; verify those settings if you need an actual alert.
- This is a **homepage availability check only**. It does not prove login, Supabase queries, resume analysis, payments, or the full student dashboard are healthy. Those need separate end-to-end tests.
- First scheduled execution has not yet been independently verified; check the Actions tab after the workflow's first run.

## Routine health checks

Run these read-only SQL checks in the Supabase SQL editor or through the authorized operations connection.

### 1. Scheduler is present and enabled

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in ('aldovra-job-source-sync', 'aldovra-application-link-check')
order by jobname;
```

Expected: both jobs exist and `active = true`; source sync schedule is `*/5 * * * *`.

### 2. Recent scheduler execution

```sql
select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where start_time > now() - interval '24 hours'
order by start_time desc
limit 30;
```

Expected: recent executions are succeeding. Note: a successful cron dispatch only confirms the HTTP request was queued; it does not alone prove the asynchronous Edge Function finished successfully. Verify source timestamps/statuses too.

### 3. Source freshness and failures

```sql
select
  count(*) filter (where enabled) as enabled_sources,
  count(*) filter (where enabled and (last_synced_at is null or last_synced_at < now() - interval '2 hours')) as stale_over_2h,
  count(*) filter (where enabled and (last_sync_status ilike 'error%' or last_sync_status ilike 'partial%')) as failed_or_partial
from public.job_sources;
```

Expected: no enabled source should remain stale for over two hours during normal operations. Investigate stale sources and repeated provider errors; do not automatically disable a source on one transient failure.

### 4. Student-facing listing quality

```sql
select
  count(*) filter (where active) as active_jobs,
  count(*) filter (where active and experience_level = 'fresher') as active_fresher_jobs,
  count(*) filter (where active and (application_url is null or btrim(application_url) = '')) as active_missing_apply_url,
  count(*) filter (where active and application_check_status ilike 'failed%') as active_failed_apply_check
from public.opportunities;
```

Investigate any active listing without an application URL. Review repeated application-check failures before deactivating a job; providers can temporarily rate-limit or block checks.

## Incident response

1. **Do not immediately redeploy or disable all sources.** First capture current cron status, latest Edge Function logs, and affected source rows.
2. If cron is inactive, verify the Vault secret exists and the job command targets the deployed function. Never print the secret into logs.
3. If one provider is failing, validate its public board URL and response format. Disable only when the board is confirmed unavailable or the integration is no longer supported; document the reason.
4. If imports suddenly drop, compare the selected source batch, HTTP status, parser output count, and skipped/error reasons. A successful HTTP response with zero parsed jobs may still indicate a parser regression.
5. If the fresher count drops, inspect recent source data and the experience classifier before relaxing eligibility rules. Never label unknown-experience roles as fresher just to increase counts.
6. Before a production Edge Function deployment, preserve the current deployed source/version, review the diff, test representative provider payloads, and verify the next scheduled run after deployment.
7. After recovery, confirm source timestamps/statuses, application URLs, fresher count, and student-facing search results.

## Release safety checklist

- Preserve existing authentication, student dashboard, resume analysis, assessments, pricing, and application tracking flows.
- Prefer small, reversible changes over broad rewrites.
- Validate SQL migrations against the current schema and check migration history before applying.
- Never use a partial/capped provider feed as a complete snapshot for job deactivation.
- Verify one end-to-end student path after changes: sign in, open jobs, filter fresher jobs, open an employer application link, and confirm the dashboard still loads on mobile.
- Keep a rollback plan for every production Edge Function or schema change.

## Verified snapshot (2026-10-23)

The live database check showed 85 registered sources, 76 enabled sources, 189 active jobs, 94 active fresher jobs, zero enabled sources older than two hours, and zero active jobs missing application URLs. Both scheduled cron jobs were present and enabled. These are point-in-time measurements, not guarantees of future uptime.
