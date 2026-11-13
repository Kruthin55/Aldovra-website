-- 13 Nov 2026: record that the student ticked "I agree" before paying.
-- consent_version = which payment terms text they saw; consent_at = server time of the click-through.
alter table public.assessment_payments
  add column if not exists consent_version text,
  add column if not exists consent_at timestamptz;
comment on column public.assessment_payments.consent_version is 'Version of the "Before you pay" terms the student accepted (dash-main.js aldovraPayNotice).';
comment on column public.assessment_payments.consent_at is 'When the student accepted those terms (set by create-payu-payment).';
