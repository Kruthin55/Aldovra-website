-- Public Greenhouse job boards verified from the employers' current public openings pages.
-- These are read-only job discovery sources; Aldovra does not submit applications automatically.
INSERT INTO public.job_sources (provider, board_token, company_name, enabled)
VALUES
  ('greenhouse', 'phonepe', 'PhonePe', true),
  ('greenhouse', 'razorpaysoftwareprivatelimited', 'Razorpay', true)
ON CONFLICT DO NOTHING;
