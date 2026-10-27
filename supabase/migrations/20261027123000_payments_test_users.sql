-- Let selected accounts use paid flows before payments go live for everyone.
-- Add testers: update platform_settings set value = '["<user uuid>"]' where key = 'payments_test_users';
insert into public.platform_settings (key, value) values ('payments_test_users', '[]'::jsonb) on conflict (key) do nothing;

create or replace function public.payments_live_for(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value = 'true'::jsonb from public.platform_settings where key = 'reattempt_payments_live'), false)
      or coalesce((select value ? p_user::text from public.platform_settings where key = 'payments_test_users'), false);
$$;
revoke all on function public.payments_live_for(uuid) from public, anon, authenticated;
grant execute on function public.payments_live_for(uuid) to service_role;

-- Browser-facing check: global switch OR the signed-in user is a payments tester.
create or replace function public.reattempt_payments_live()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.payments_live_for(auth.uid());
$$;
revoke all on function public.reattempt_payments_live() from public;
grant execute on function public.reattempt_payments_live() to anon, authenticated, service_role;
