-- First assessment is free. After that, every new skill verification is unlocked with a PayU payment
-- priced from the student's latest exam score (65%+ -> ₹50, below 65% -> ₹100).
-- Requests waiting for that payment use status 'payment_pending'.
alter table public.assessment_payments add column if not exists purpose text not null default 'reattempt';
alter table public.assessment_payments drop constraint if exists assessment_payments_purpose_check;
alter table public.assessment_payments add constraint assessment_payments_purpose_check check (purpose in ('reattempt','new_skill'));
alter table public.assessment_requests add column if not exists unlock_fee integer;
alter table public.assessment_requests add column if not exists unlock_fee_basis numeric;
comment on column public.assessment_requests.unlock_fee is 'Fee (INR) shown to unlock a payment_pending skill verification; the server recomputes it at payment time.';
