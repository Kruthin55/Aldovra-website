-- Recruiter access requests (28 Oct 2026).
-- Recruiters request access from hr-login.html (sign up with account_type = 'recruiter'); the account starts
-- PENDING and sees nothing until an admin approves it in admin.html → Recruiters.
-- `approved` stays the single switch every HR check reads; `status` adds pending/rejected for the UI.

alter table public.recruiter_access
  add column if not exists full_name text,
  add column if not exists work_email text,
  add column if not exists designation text,
  add column if not exists phone text,
  add column if not exists company_website text,
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists admin_note text;

update public.recruiter_access set status = 'approved' where approved and status = 'pending';

do $$ begin
  alter table public.recruiter_access add constraint recruiter_access_status_check
    check (status in ('pending', 'approved', 'rejected'));
exception when duplicate_object then null; end $$;

-- New sign-ups: students by default; recruiter sign-ups get role 'recruiter' + a pending access request.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  is_recruiter boolean := meta ->> 'account_type' = 'recruiter';
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, nullif(left(coalesce(meta ->> 'full_name', ''), 160), ''), case when is_recruiter then 'recruiter' else 'student' end)
  on conflict (id) do update
    set full_name = coalesce(public.profiles.full_name, excluded.full_name);

  if is_recruiter then
    insert into public.recruiter_access (user_id, company_name, approved, status, full_name, work_email, designation, phone, company_website)
    values (new.id,
            nullif(left(btrim(coalesce(meta ->> 'company_name', '')), 160), ''),
            false, 'pending',
            nullif(left(btrim(coalesce(meta ->> 'full_name', '')), 160), ''),
            lower(new.email),
            nullif(left(btrim(coalesce(meta ->> 'designation', '')), 120), ''),
            nullif(left(btrim(coalesce(meta ->> 'phone', '')), 30), ''),
            nullif(left(btrim(coalesce(meta ->> 'company_website', '')), 200), ''))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$function$;

-- Status for the signed-in user on hr-login (clear messages: pending / rejected / not a recruiter)
create or replace function public.my_recruiter_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_admin', exists (select 1 from public.admin_users where user_id = auth.uid()),
    'status', (select case when r.approved then 'approved' else r.status end from public.recruiter_access r where r.user_id = auth.uid()),
    'company', (select company_name from public.recruiter_access where user_id = auth.uid()),
    'note', (select admin_note from public.recruiter_access where user_id = auth.uid() and status = 'rejected'));
$$;
revoke all on function public.my_recruiter_status() from public, anon;
grant execute on function public.my_recruiter_status() to authenticated;

-- Admin: list + approve/reject
create or replace function public.admin_list_recruiters(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_aldovra_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select r.user_id, coalesce(r.full_name, p.full_name) as full_name, coalesce(r.work_email, u.email) as email,
             r.company_name, r.designation, r.phone, r.company_website, r.status, r.approved, r.created_at,
             r.reviewed_at, r.admin_note, u.email_confirmed_at is not null as email_confirmed, u.last_sign_in_at,
             split_part(lower(coalesce(r.work_email, u.email)), '@', 2) in
               ('gmail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'rediffmail.com', 'proton.me', 'protonmail.com') as personal_email
      from public.recruiter_access r
      left join auth.users u on u.id = r.user_id
      left join public.profiles p on p.id = r.user_id
      where coalesce(p_status, 'all') = 'all' or r.status = p_status
      order by r.created_at desc
      limit 300
    ) x), '[]'::jsonb);
end;
$$;

create or replace function public.admin_review_recruiter(p_user uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_aldovra_admin();
  update public.recruiter_access
     set approved = coalesce(p_approve, false),
         status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
         reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
   where user_id = p_user;
  if not found then
    raise exception 'Recruiter request not found' using errcode = 'P0001';
  end if;
  return (select row_to_json(r)::jsonb from public.recruiter_access r where r.user_id = p_user);
end;
$$;

revoke all on function public.admin_list_recruiters(text) from public, anon;
revoke all on function public.admin_review_recruiter(uuid, boolean, text) from public, anon;
grant execute on function public.admin_list_recruiters(text) to authenticated;
grant execute on function public.admin_review_recruiter(uuid, boolean, text) to authenticated;

-- Overview: pending recruiter requests
create or replace function public.admin_pending_recruiters()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select case when exists (select 1 from public.admin_users where user_id = auth.uid())
               then (select count(*)::int from public.recruiter_access where status = 'pending') end; $$;
revoke all on function public.admin_pending_recruiters() from public, anon;
grant execute on function public.admin_pending_recruiters() to authenticated;
