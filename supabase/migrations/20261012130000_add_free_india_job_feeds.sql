-- Additional verified public ATS feeds with India openings.
-- Public read-only job listings; applications still go through the employer's official page.
INSERT INTO public.job_sources (provider, board_token, company_name, enabled)
VALUES
  ('greenhouse', 'accordionindia', 'Accordion India', true),
  ('greenhouse', 'zenoti', 'Zenoti', true),
  ('greenhouse', 'doordashindia', 'DoorDash India', true),
  ('greenhouse', 'tide', 'Tide', true),
  ('lever', 'cred', 'CRED', true),
  ('ashby', 'sarvam', 'Sarvam AI', true),
  ('lever', '100ms', '100ms', true)
ON CONFLICT DO NOTHING;
