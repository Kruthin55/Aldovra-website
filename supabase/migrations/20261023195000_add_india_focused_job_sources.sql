-- Add verified public ATS boards with India / Bengaluru / remote relevance.
-- Idempotent: safe to run even if these sources were seeded directly in the live project.
insert into public.job_sources(provider, board_token, company_name, enabled, last_sync_status, last_sync_count, updated_at)
select x.provider, x.board_token, x.company_name, true, 'pending: newly added public job board; awaiting first sync', 0, now()
from (values
  ('lever','hevodata','Hevo Data'),
  ('lever','weekdayworks','Weekday'),
  ('lever','fampay','FamApp'),
  ('lever','paytm','Paytm'),
  ('lever','Sprinto','Sprinto'),
  ('lever','drivetrain','Drivetrain'),
  ('lever','thinkahead','AHEAD'),
  ('ashby','Commure','Commure'),
  ('ashby','certifyos','CertifyOS'),
  ('ashby','almabase','Almabase'),
  ('ashby','aiprise','AiPrise'),
  ('ashby','cartesia','Cartesia')
) as x(provider, board_token, company_name)
where not exists (
  select 1 from public.job_sources s
  where s.provider = x.provider and lower(s.board_token) = lower(x.board_token)
);
