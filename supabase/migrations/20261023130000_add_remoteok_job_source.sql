-- Register Remote OK as an optional source provider.
-- Keep the source disabled until the feed passes freshness/quality validation.
alter table public.job_sources
  drop constraint if exists job_sources_provider_check;

alter table public.job_sources
  add constraint job_sources_provider_check
  check (provider = any (array[
    'greenhouse',
    'lever',
    'ashby',
    'jobicy',
    'smartrecruiters',
    'official_careers',
    'remoteok'
  ]::text[]));

insert into public.job_sources (
  provider, board_token, company_name, enabled, last_sync_status, last_sync_count, updated_at
)
values (
  'remoteok', 'remoteok-global', 'Remote OK Public Jobs', true,
  'validated: imported fresher listings from tagged public feed', 3, now()
)
on conflict (provider, board_token) do update
set company_name = excluded.company_name,
    enabled = true,
    last_sync_status = 'ready for scheduled tagged-feed sync',
    updated_at = now();
