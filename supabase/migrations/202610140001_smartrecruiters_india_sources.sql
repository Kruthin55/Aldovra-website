-- SmartRecruiters exposes public postings for these employers through its official Posting API.
-- Keep source ingestion read-only and retain the employer's original application URL.
ALTER TABLE public.job_sources DROP CONSTRAINT IF EXISTS job_sources_provider_check;
ALTER TABLE public.job_sources
  ADD CONSTRAINT job_sources_provider_check
  CHECK (provider = ANY (ARRAY['greenhouse'::text, 'lever'::text, 'ashby'::text, 'jobicy'::text, 'smartrecruiters'::text]));

INSERT INTO public.job_sources (provider, board_token, company_name, enabled)
VALUES
  ('smartrecruiters', 'Freshworks', 'Freshworks', true),
  ('smartrecruiters', 'PHONEPELIMITED', 'PhonePe', true),
  ('smartrecruiters', 'servicenow', 'ServiceNow', true),
  ('smartrecruiters', 'BoschGroup', 'Bosch Group', true),
  ('smartrecruiters', 'jitterbit', 'Jitterbit', true)
ON CONFLICT (provider, board_token) DO UPDATE
SET company_name = EXCLUDED.company_name,
    enabled = true,
    updated_at = now();

-- Do not ingest Jobicy's public feed into Aldovra: its published usage guidance restricts redistribution to third-party job platforms.
UPDATE public.job_sources SET enabled = false, updated_at = now() WHERE provider = 'jobicy' AND enabled = true;
