-- Add Zeta's public Lever board after confirming the API returns live postings.
insert into public.job_sources(provider, board_token, company_name, enabled, last_sync_status, last_sync_count, updated_at)
select 'lever', 'zeta', 'Zeta', true, 'pending: verified public Lever board; awaiting first sync', 0, now()
where not exists (
  select 1 from public.job_sources
  where provider = 'lever' and lower(board_token) = 'zeta'
);
