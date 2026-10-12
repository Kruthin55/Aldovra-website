-- Keep client access limited to ordinary CRUD operations. RLS remains the row-level boundary.
-- In particular, TRUNCATE bypasses row-level security and must not be granted to authenticated users.
revoke all privileges on table public.job_application_tracker from public, anon, authenticated;
grant select, insert, update, delete on table public.job_application_tracker to authenticated;

revoke all privileges on table public.job_sources from public, anon, authenticated;
grant select, insert, update, delete on table public.job_sources to authenticated;
