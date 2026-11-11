-- Daily check 11 Nov 2026: NXP Workday board returns HTTP 422 on every search since 7 Nov.
update public.job_sources
set enabled = false,
    last_sync_status = 'disabled by daily check: Workday search HTTP 422 since 7 Nov 2026',
    updated_at = now()
where provider = 'workday' and board_token = 'nxp__wd3__careers' and enabled;
