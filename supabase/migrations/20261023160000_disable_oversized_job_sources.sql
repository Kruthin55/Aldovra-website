-- Keep oversized/problematic sources out of the scheduled batch until their
-- providers have a lightweight, reliable parser. This prevents one source from
-- exhausting the Edge Function worker and blocking all other source refreshes.
update public.job_sources
set enabled = false,
    last_sync_status = 'disabled pending lightweight parser',
    updated_at = now()
where provider = 'greenhouse'
  and board_token = 'databricks';

update public.job_sources
set enabled = false,
    last_sync_status = 'disabled pending lightweight parser',
    updated_at = now()
where provider = 'official_careers'
  and board_token = 'infosys';
