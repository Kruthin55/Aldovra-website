-- Expand approved public ATS providers without changing existing source records.
alter table public.job_sources
  drop constraint if exists job_sources_provider_check;
alter table public.job_sources
  add constraint job_sources_provider_check
  check (provider = any (array['greenhouse'::text, 'lever'::text, 'ashby'::text]));
