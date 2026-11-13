-- 13 Nov 2026: Razorpay account approved (business name ALDOVRA), so it becomes the payment provider.
-- Switch back to PayU any time with: update platform_settings set value='"payu"' where key='payment_provider';
insert into public.platform_settings (key, value)
values ('payment_provider', '"razorpay"'::jsonb)
on conflict (key) do update set value = excluded.value;

-- Which checkout the dashboard should prepare for (the server makes the final choice).
create or replace function public.payment_provider()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select value #>> '{}' from public.platform_settings where key = 'payment_provider'), 'payu');
$$;
revoke all on function public.payment_provider() from public;
grant execute on function public.payment_provider() to anon, authenticated;
