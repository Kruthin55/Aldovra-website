-- Keep the unavailable Evaratus board disabled across future migration/recovery runs.
update public.job_sources
set enabled = false,
    last_sync_status = 'disabled: provider HTTP 404; board unavailable during validation',
    updated_at = now()
where provider = 'ashby'
  and board_token = 'evaratus';
