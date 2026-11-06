-- Founder's main account gets admin rights (6 Nov 2026). Looked up by email; no-op if it already exists.
insert into public.admin_users (user_id)
select u.id from auth.users u
where lower(u.email) = 'maalekruthin@gmail.com'
  and not exists (select 1 from public.admin_users a where a.user_id = u.id);
