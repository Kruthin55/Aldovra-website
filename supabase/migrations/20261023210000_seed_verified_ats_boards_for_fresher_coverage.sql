-- Add verified public ATS boards to broaden first-party fresher job discovery.
-- Only publish jobs that pass the sync function's India and fresher eligibility filters.
insert into public.job_sources (provider, board_token, company_name, enabled, last_sync_status, last_sync_count, created_at, updated_at)
values
  ('greenhouse', 'nirmata', 'Nirmata', true, 'pending initial sync', 0, now(), now()),
  ('greenhouse', 'cloudsek', 'CloudSEK', true, 'pending initial sync', 0, now(), now()),
  ('greenhouse', 'enterpret', 'Enterpret', true, 'pending initial sync', 0, now(), now()),
  ('greenhouse', 'hackerrank', 'HackerRank', true, 'pending initial sync', 0, now(), now()),
  ('greenhouse', 'blackduck', 'Black Duck', true, 'pending initial sync', 0, now(), now()),
  ('greenhouse', 'zinnov', 'Zinnov', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'firstwork', 'FirstWork', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'handshake', 'Handshake', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'ande', 'Ande', true, 'pending initial sync', 0, now(), now())
on conflict (provider, board_token) do update set
  company_name = excluded.company_name,
  enabled = true,
  updated_at = now();
