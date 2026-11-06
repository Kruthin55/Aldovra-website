-- Self-service account deletion (6 Nov 2026, DPDP Act right to erasure).
-- Flow: dashboard / HR page -> edge function delete-account (checks the caller, removes their storage files)
--       -> purge_user_account(user) (service_role only) -> rows below + auth.users (everything else cascades).
-- Kept on purpose: assessment_payments rows (amount, PayU txn id; needed for tax/accounting records).
-- Their user_id becomes an orphan id that maps to nobody, and contact fields are stripped from the PayU payload.
-- The log below holds no personal data.

create table if not exists public.account_deletions (
  id bigint generated always as identity primary key,
  deleted_at timestamptz not null default now(),
  role text,
  reason text,
  had_certificates int not null default 0,
  had_attempts int not null default 0
);
alter table public.account_deletions enable row level security;
-- no policies: only service_role / admin RPCs read it

create or replace function public.purge_user_account(p_user uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_certs int;
  v_attempts int;
begin
  if p_user is null then raise exception 'USER_REQUIRED'; end if;
  if exists (select 1 from public.admin_users where user_id = p_user) then
    raise exception 'ADMIN_ACCOUNT' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;

  select role into v_role from public.profiles where id = p_user;
  select count(*) into v_certs from public.skill_certificates where user_id = p_user;
  select count(*) into v_attempts from public.assessment_attempts where user_id = p_user;

  -- tables that point at the user without a foreign key
  delete from public.question_exposures where user_id = p_user;
  delete from public.screening_calls where student_id = p_user;
  update public.assessment_payments
     set provider_payload = provider_payload - array['email','phone','firstname','lastname','address1','address2',
           'city','state','country','zipcode','name_on_card','cardnum','field9','udf1','udf2','udf3','udf4','udf5']
   where user_id = p_user and jsonb_typeof(provider_payload) = 'object';
  delete from public.profiles where id = p_user;

  -- everything else (requests, sessions, reports, certificates, resumes, notifications, public profile,
  -- applications, shortlists, recruiter access, ...) cascades from auth.users
  delete from auth.users where id = p_user;

  insert into public.account_deletions (role, reason, had_certificates, had_attempts)
  values (coalesce(v_role, 'unknown'), left(nullif(trim(p_reason), ''), 300), v_certs, v_attempts);

  return jsonb_build_object('deleted', true);
end;
$$;
revoke all on function public.purge_user_account(uuid, text) from public, anon, authenticated;
grant execute on function public.purge_user_account(uuid, text) to service_role;
