-- Payments go live for every student (18 Nov 2026, founder's go-ahead).
-- First assessment free; later attempts and new skills ₹49 via Razorpay (see create-payu-payment).
update public.platform_settings set value = 'true'::jsonb where key = 'reattempt_payments_live';
