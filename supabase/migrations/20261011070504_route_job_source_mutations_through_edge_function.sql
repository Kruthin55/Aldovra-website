-- Keep the source registry read-only to browser clients.
-- All create/update/enable operations must pass through sync-job-sources, which checks admin membership and validates the fixed public ATS API before saving.
revoke all privileges on table public.job_sources from public, anon, authenticated;
grant select on table public.job_sources to authenticated;
