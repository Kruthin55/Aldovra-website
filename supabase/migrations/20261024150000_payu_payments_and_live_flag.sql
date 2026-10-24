-- PayU support for assessment reattempt payments + a single switch for "payments are live".
alter table public.assessment_payments
  add column if not exists provider text not null default 'razorpay',
  add column if not exists provider_txn_id text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_status text,
  add column if not exists failure_reason text,
  add column if not exists provider_payload jsonb;

alter table public.assessment_payments drop constraint if exists assessment_payments_provider_check;
alter table public.assessment_payments add constraint assessment_payments_provider_check check (provider in ('razorpay','payu'));
create unique index if not exists assessment_payments_provider_txn_uidx
  on public.assessment_payments (provider, provider_txn_id) where provider_txn_id is not null;

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
-- No direct client access; read through the RPC below. Admins change it via SQL:
--   update public.platform_settings set value = 'true', updated_at = now() where key = 'reattempt_payments_live';

insert into public.platform_settings (key, value)
values ('reattempt_payments_live', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.reattempt_payments_live()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value = 'true'::jsonb from public.platform_settings where key = 'reattempt_payments_live'), false);
$$;
revoke all on function public.reattempt_payments_live() from public;
grant execute on function public.reattempt_payments_live() to anon, authenticated, service_role;
