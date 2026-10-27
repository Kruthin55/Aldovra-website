-- PayU rows have no Razorpay order id; require the right reference per provider instead.
alter table public.assessment_payments alter column razorpay_order_id drop not null;
alter table public.assessment_payments drop constraint if exists assessment_payments_provider_ref_check;
alter table public.assessment_payments add constraint assessment_payments_provider_ref_check
  check ((provider = 'razorpay' and razorpay_order_id is not null) or (provider = 'payu' and provider_txn_id is not null));
