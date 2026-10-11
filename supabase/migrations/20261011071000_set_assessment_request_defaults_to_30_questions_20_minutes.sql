-- Preserve historical request details; use the agreed model for future requests.
ALTER TABLE public.assessment_request_details
  ALTER COLUMN question_count SET DEFAULT 30,
  ALTER COLUMN duration_minutes SET DEFAULT 20;
