-- OAuth sign-ups (Google, LinkedIn OIDC, GitHub) send the name under different keys.
-- Use full_name, then name, then given+family name, then the GitHub username.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  is_recruiter boolean := meta ->> 'account_type' = 'recruiter';
  display_name text := nullif(left(btrim(coalesce(
    nullif(btrim(meta ->> 'full_name'), ''),
    nullif(btrim(meta ->> 'name'), ''),
    nullif(btrim(concat_ws(' ', meta ->> 'given_name', meta ->> 'family_name')), ''),
    nullif(btrim(meta ->> 'user_name'), ''),
    '')), 160), '');
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, display_name, case when is_recruiter then 'recruiter' else 'student' end)
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
