-- Add Groww's public Greenhouse job board to India-first discovery.
INSERT INTO public.job_sources (provider, board_token, company_name, enabled)
VALUES ('greenhouse', 'groww', 'Groww', true)
ON CONFLICT DO NOTHING;
