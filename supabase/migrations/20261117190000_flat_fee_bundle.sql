-- 17 Nov 2026: one flat price (₹49 for every new-skill unlock and every reattempt), 10 attempts per
-- skill per 30 days, and the "resume bundle": one Razorpay payment unlocks every payment_pending skill.
alter table public.assessment_payments add column if not exists bundle_request_ids bigint[];
alter table public.assessment_payments drop constraint if exists assessment_payments_purpose_check;
alter table public.assessment_payments add constraint assessment_payments_purpose_check
  check (purpose in ('reattempt', 'new_skill', 'bundle'));
comment on column public.assessment_payments.bundle_request_ids is
  'For purpose = bundle: the payment_pending assessment_requests this payment unlocks (verify-razorpay-payment approves them).';
-- Locked skills already waiting show the new price.
update public.assessment_requests set unlock_fee = 49 where status = 'payment_pending';

-- Every stored unlock fee is the flat ₹49, whichever function writes it (create-assessment-request and
-- analyze-resume compute 49 in the repo too; this keeps old deployed copies from showing ₹50/₹100).
create or replace function public.assessment_requests_flat_fee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.unlock_fee is not null then new.unlock_fee := 49; end if;
  return new;
end;
$$;
revoke all on function public.assessment_requests_flat_fee() from public, anon, authenticated;
drop trigger if exists assessment_requests_flat_fee on public.assessment_requests;
create trigger assessment_requests_flat_fee before insert or update of unlock_fee on public.assessment_requests
  for each row execute function public.assessment_requests_flat_fee();
