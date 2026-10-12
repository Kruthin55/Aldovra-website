-- Job discovery refresh throttling. This migration is intentionally staged in GitHub;
-- do not apply to production until the accompanying Edge Function passes review/tests.
create table if not exists public.job_discovery_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_requested_at timestamptz not null default '-infinity'::timestamptz
);

alter table public.job_discovery_rate_limits enable row level security;
revoke all on public.job_discovery_rate_limits from anon, authenticated;
grant all on public.job_discovery_rate_limits to service_role;

create or replace function public.claim_job_discovery_refresh(p_user_id uuid)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_last timestamptz;
  v_now timestamptz := clock_timestamp();
  v_wait integer;
begin
  if p_user_id is null then
    return query select false, 300;
    return;
  end if;

  insert into public.job_discovery_rate_limits(user_id, last_requested_at)
  values (p_user_id, '-infinity'::timestamptz)
  on conflict (user_id) do nothing;

  select last_requested_at into v_last
  from public.job_discovery_rate_limits
  where user_id = p_user_id
  for update;

  if v_last < v_now - interval '5 minutes' then
    update public.job_discovery_rate_limits
      set last_requested_at = v_now
      where user_id = p_user_id;
    return query select true, 0;
    return;
  end if;

  v_wait := greatest(1, ceil(extract(epoch from (v_last + interval '5 minutes' - v_now)))::integer);
  return query select false, v_wait;
end;
$$;

revoke all on function public.claim_job_discovery_refresh(uuid) from public, anon, authenticated;
grant execute on function public.claim_job_discovery_refresh(uuid) to service_role;
