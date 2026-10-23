-- Add additional public ATS boards with recently indexed early-career postings in India.
insert into public.job_sources (provider, board_token, company_name, enabled, last_sync_status, last_sync_count, created_at, updated_at)
values
  ('ashby', 'gainsight', 'Gainsight', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'atlan', 'Atlan', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'atlys', 'Atlys', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'evaratus', 'Evaratus', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'ema', 'Ema', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'bolna', 'Bolna AI', true, 'pending initial sync', 0, now(), now()),
  ('ashby', 'josys', 'Josys', true, 'pending initial sync', 0, now(), now()),
  ('greenhouse', 'inmobi', 'InMobi', true, 'pending initial sync', 0, now(), now()),
  ('greenhouse', 'sigmoid', 'Sigmoid', true, 'pending initial sync', 0, now(), now())
on conflict (provider, board_token) do update set
  company_name = excluded.company_name,
  enabled = true,
  updated_at = now();
