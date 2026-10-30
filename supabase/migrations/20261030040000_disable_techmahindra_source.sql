-- Daily job pipeline check (30 Oct 2026): Tech Mahindra official careers page
-- has returned "No official job details parsed" on every sync since it was added
-- on 18 Oct 2026 (0 jobs ever). Disable it so it stops using sync slots.
update public.job_sources
set enabled = false,
    last_sync_status = 'disabled by daily check: no job details parsed on any sync since 18 Oct 2026'
where provider = 'official_careers' and board_token = 'techmahindra' and enabled;
