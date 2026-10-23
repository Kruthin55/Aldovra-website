-- Anthropic's public job board uses Greenhouse, not Ashby.
-- Keep this migration idempotent so environments with the corrected row are unchanged.
update public.job_sources
set provider = 'greenhouse',
    board_token = 'anthropic',
    enabled = true,
    last_synced_at = null,
    last_sync_status = 'pending: corrected to verified official Greenhouse board; awaiting first sync',
    last_sync_count = 0,
    updated_at = now()
where lower(company_name) = 'anthropic'
  and provider = 'ashby'
  and lower(board_token) = 'anthropic';
