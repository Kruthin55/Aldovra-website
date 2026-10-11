# Aldovra Job Discovery Operations

## Current state
- Supabase Edge Function: `sync-job-sources` v3, JWT gateway verification enabled.
- Manual invocation requires a signed-in user present in `public.admin_users`.
- Scheduled invocation is accepted only when the bearer token exactly matches the server-side `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to a browser or commit it.
- Supported public ATS APIs: Greenhouse boards API and Lever postings API. Do not scrape login-gated pages, bypass bot protection, or assume a board token is valid.
- Jobs without a skill match in Aldovra's current skill catalogue are skipped so they do not receive misleading high match scores.
- Listings not seen for 14 days are deactivated only after a successful sync of their exact source board.

## Configure an approved source
Sign in as the existing Aldovra admin and open `/admin-job-sources.html`. The page checks membership in `admin_users`, lets you add/enable/disable official boards, and runs a manual sync. The SQL method below is an alternative for database administrators.

After verifying the employer's official career page and its public Greenhouse/Lever board token, run in Supabase SQL Editor as an authorized database administrator. Replace the placeholders with the verified provider, token, and company display name.

```sql
insert into public.job_sources (provider, board_token, company_name, enabled)
values ('greenhouse', 'VERIFIED_BOARD_TOKEN', 'Verified Company Name', true)
on conflict (provider, board_token) do update
set company_name = excluded.company_name, enabled = true, updated_at = now();
```

For Lever, set provider to `lever`. Add only employer-owned public board tokens that have been verified. Start with a small set, run a manual sync, inspect imported roles/skill mappings, and then expand.

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
