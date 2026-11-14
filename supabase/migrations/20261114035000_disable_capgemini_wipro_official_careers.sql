-- Daily job pipeline check (14 Nov 2026): Capgemini and Wipro official careers pages
-- return HTTP 404 on every sync (Capgemini never produced a job since 18 Oct; Wipro's
-- last job was 24 Oct). Disable them so they stop using sync slots.
update public.job_sources
set enabled = false,
    last_sync_status = 'disabled by daily check: official careers page returns HTTP 404 (no jobs for 3+ weeks)',
    updated_at = now()
where provider = 'official_careers'
  and board_token in ('capgemini', 'wipro')
  and enabled;
