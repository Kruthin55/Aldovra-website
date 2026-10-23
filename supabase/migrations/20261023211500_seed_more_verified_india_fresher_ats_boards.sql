-- Expand first-party India fresher discovery with boards verified from current public job listings.
insert into public.job_sources (provider, board_token, company_name, enabled, last_sync_status, last_sync_count, created_at, updated_at)
values
  ('greenhouse', 'instawork', 'Instawork', true, 'pending initial sync', 0, now(), now()),
  ('greenhouse', 'konovo', 'Konovo', true, 'pending initial sync', 0, now(), now()),
  ('greenhouse', 'project44', 'project44', true, 'pending initial sync', 0, now(), now()),
  ('greenhouse', '66degrees', '66degrees', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'certa', 'Certa', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'Abound', 'Abound', true, 'pending initial sync', 0, now(), now())
on conflict (provider, board_token) do update set
  company_name = excluded.company_name,
  enabled = true,
  updated_at = now();
