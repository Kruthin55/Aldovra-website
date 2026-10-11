# Aldovra Job Discovery Operations

## Current state
- Supabase Edge Function: `sync-job-sources` v5, JWT gateway verification enabled.
- Manual invocation requires a signed-in user present in `public.admin_users`.
- Source creation and enable/disable changes are performed by the Edge Function with service-role privileges after checking the admin session; browser clients have SELECT-only access to `job_sources`.
- Scheduled invocation is accepted only when the bearer token exactly matches the server-side `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to a browser or commit it.
- Supported public ATS APIs: Greenhouse boards API and Lever postings API. Do not scrape login-gated pages, bypass bot protection, or assume a board token is valid.
- Jobs without a skill match in Aldovra's current skill catalogue are skipped so they do not receive misleading high match scores.
- Listings not seen for 14 days are deactivated only after a successful sync of their exact source board.

## Configure an approved source
Sign in as the existing Aldovra admin and open `/admin-job-sources.html`. The page checks membership in `admin_users`, validates the public API response before saving a board, lets you enable/disable official boards, and runs a manual sync. Board tokens are masked in the configured-source list. The SQL method below is an alternative for database administrators.

Only save a source through the admin page after its built-in API validation succeeds. Do not bypass validation with direct SQL inserts; the registry must contain only verified public boards.

## Candidate boards to validate first

These are **candidates only**, not pre-approved or enabled sources. Open the employer's official careers page, confirm the board still belongs to that employer, then enter the provider/token in the admin page. The page's API validation must succeed before saving.

| Employer | Provider | Candidate token | Official careers board | Why test it |
| --- | --- | --- | --- | --- |
| Enterpret | Greenhouse | `enterpret` | https://job-boards.greenhouse.io/enterpret | Public board currently lists a Bengaluru software engineering internship. |
| Portcast | Lever | `portcast` | https://jobs.lever.co/portcast/ | Public board currently lists a remote Data Analyst internship with India locations. |

A public careers page is not proof that an API token is currently valid. Do not insert either candidate directly into the database if the admin-page validation has not passed. Start with one source, inspect imported titles and skills, and only then add the next.

## Optional scheduled sync (every 6 hours)
1. In Supabase Vault, create a secret named `aldovra_supabase_service_role_key` whose value is the project's service-role key. Do not put the key in GitHub, SQL source files, frontend code, or chat.
2. Ensure the Supabase `pg_cron`, `pg_net`, and Vault extensions are enabled.
3. Run the following in SQL Editor as a database administrator:

```sql
select cron.schedule(
  'aldovra-job-source-sync',
  '15 */6 * * *',
  $$
  select net.http_post(
    url := 'https://lgefwfrjzweayfxahogs.supabase.co/functions/v1/sync-job-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'aldovra_supabase_service_role_key'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

4. Check cron run history and Edge Function logs after the first run. Do not schedule the sync until at least one verified source is enabled.
5. To pause it: `select cron.unschedule('aldovra-job-source-sync');`

## Safety notes
- The service-role key has broad database privileges. Store it only in Supabase Vault and rotate it if exposed.
- Sync is idempotent by provider/job ID and does not submit job applications.
- Student applications remain user-reviewed; this pipeline only discovers, classifies, matches, and stores opportunities.
- The tracker and source registry are separate: only admins manage source definitions; students can only manage their own application tracker rows.
