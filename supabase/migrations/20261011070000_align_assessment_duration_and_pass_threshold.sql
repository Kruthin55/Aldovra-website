-- Align active assessment metadata with Aldovra's agreed assessment model.
-- Generated sessions use the request-specific settings when supplied; the Edge Function defaults to 30 questions / 20 minutes.
UPDATE public.assessments
SET duration_minutes = 20,
    passing_score = 75
WHERE is_active = true;
