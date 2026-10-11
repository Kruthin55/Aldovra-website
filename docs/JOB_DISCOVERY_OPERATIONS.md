# Aldovra Job Discovery Operations

## Current state
- Supabase Edge Function: `sync-job-sources` v6, JWT gateway verification enabled.
- Manual invocation requires a signed-in user present in `public.admin_users`.
- Source creation and enable/disable changes are performed by the Edge Function with service-role privileges after checking the admin session; browser clients have SELECT-only access to `job_sources`.
- Scheduled invocation is accepted only when the bearer token exactly matches the server-side `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to a browser or commit it.
- Supported public ATS APIs: Greenhouse Job Board API, Lever postings API, and Ashby Job Postings API. Only public company boards that validate successfully may be enabled. Do not scrape login-gated pages, bypass bot protection, or assume a board token is valid.
- Jobs without a skill match in Aldovra's current skill catalogue are skipped so they do not receive misleading high match scores.
- Listings not seen for 14 days are deactivated only after a successful sync of their exact source board.

## India-wide coverage strategy

Aldovra uses a source-of-truth approach rather than claiming to mirror every job site:
1. **Automatic feeds:** verified public Greenhouse, Lever, and Ashby employer boards. Add many official employer boards over time; every board token is validated live before saving.
2. **Government and public-service listings:** National Career Service (https://www.ncs.gov.in/) is a high-value India-wide destination for private and government opportunities. No supported public ingestion API has been verified for this implementation, so link students to the official portal or pursue a formal data-sharing/API arrangement instead of scraping its login-protected pages.
3. **Other aggregators:** LinkedIn, Naukri, Indeed, Internshala, and similar services are not treated as freely scrapeable sources. Integrate only through an authorized API, partnership, licensed feed, or approved employer-provided feed. Until then, keep verified application links as an external discovery option rather than copying their listings.
4. **Quality filters:** prefer internships, fresher/graduate and entry-level roles, plus roles that match Aldovra's skill catalogue. Show source and freshness, deduplicate by provider/job ID, and expire stale records only after a successful sync of that exact source.
5. **No false “all India jobs” promise:** coverage grows as verified boards and permitted feeds are added. A public endpoint existing does not by itself grant permission to republish its content.

## Configure an approved source
Sign in as the existing Aldovra admin and open `/admin-job-sources.html`. The page checks membership in `admin_users`, validates the public API response before saving a board, lets you enable/disable official boards, and runs a manual sync. Board tokens are masked in the configured-source list. Do not create sources through direct SQL; source creation must go through the admin page's server-side API validation.

Only save a source through the admin page after its built-in API validation succeeds. Do not bypass validation with direct SQL inserts; the registry must contain only verified public boards.

## Candidate boards to validate first

These are **candidates only**, not pre-approved or enabled sources. Open the employer's official careers page, confirm the board still belongs to that employer, then enter the provider/token in the admin page. The page's API validation must succeed before saving.

| Employer | Provider | Candidate token | Official careers board | Why test it |
| --- | --- | --- | --- | --- |
| Enterpret | Greenhouse | `enterpret` | https://job-boards.greenhouse.io/enterpret | Public board currently lists a Bengaluru software engineering internship. |
| Portcast | Lever | `portcast` | https://jobs.lever.co/portcast/ | Candidate for India/remote data roles; validate live before enabling. |
| Add other employers | Ashby | Employer-specific board name | `https://jobs.ashbyhq.com/{board-name}` | Use the exact official employer board name; validate the public API before saving. |

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
- Each imported opportunity and its skill mappings are written through `upsert_job_opportunity_atomic` in one database transaction. The RPC is executable only by `service_role`, not browser roles.
- Student applications remain user-reviewed; this pipeline only discovers, classifies, matches, and stores opportunities.
- The tracker and source registry are separate: only admins manage source definitions; students can only manage their own application tracker rows.
