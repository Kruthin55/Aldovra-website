-- Add a guarded adapter for public Indian employer career pages.
-- The provider only accepts a built-in source key (not an arbitrary URL).
alter table public.job_sources drop constraint if exists job_sources_provider_check;
alter table public.job_sources add constraint job_sources_provider_check
check (provider = any (array['greenhouse','lever','ashby','jobicy','smartrecruiters','official_careers']::text[]));

create index if not exists idx_job_sources_provider_enabled_sync
on public.job_sources(provider, enabled, last_synced_at);
