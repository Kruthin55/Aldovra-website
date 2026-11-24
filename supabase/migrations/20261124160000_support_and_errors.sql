-- Help & feedback + automatic error reports + 30-minute site checks (24 Nov 2026).
-- Founder: students have started coming; give them a way to report payment/test/other problems besides email,
-- and make sure we hear about breakages before students have to tell us.

-- ---------- Support requests ----------
create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('payment','test','resume','jobs','account','suggestion','other')),
  message text not null check (length(btrim(message)) between 10 and 3000),
  payment_ref text check (payment_ref is null or length(payment_ref) <= 120),
  page text check (page is null or length(page) <= 300),
  user_agent text check (user_agent is null or length(user_agent) <= 400),
  status text not null default 'open' check (status in ('open','resolved')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon, authenticated;
grant select, insert on public.support_tickets to authenticated;
grant usage on sequence public.support_tickets_id_seq to authenticated;
create policy "Students read own tickets" on public.support_tickets for select to authenticated using (user_id = (select auth.uid()));
create policy "Students create own tickets" on public.support_tickets for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and admin_note is null and resolved_at is null);

-- At most 5 requests per student per 24 h (stops accidental floods).
create or replace function public.support_tickets_rate_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.support_tickets where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'SUPPORT_DAILY_LIMIT';
  end if;
  return new;
end $$;
create or replace trigger support_tickets_rate_limit before insert on public.support_tickets
  for each row execute function public.support_tickets_rate_limit();
revoke all on function public.support_tickets_rate_limit() from public, anon, authenticated;

create or replace function public.admin_list_support(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_aldovra_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'category', t.category, 'message', t.message,
      'payment_ref', t.payment_ref, 'page', t.page, 'user_agent', t.user_agent, 'status', t.status, 'admin_note', t.admin_note,
      'created_at', t.created_at, 'resolved_at', t.resolved_at,
      'name', coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)), 'email', u.email, 'city', p.city) order by t.created_at desc)
    from public.support_tickets t join auth.users u on u.id = t.user_id left join public.profiles p on p.id = t.user_id
    where p_status is null or p_status = 'all' or t.status = p_status), '[]'::jsonb);
end $$;

create or replace function public.admin_update_support(p_id bigint, p_status text, p_note text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_aldovra_admin();
  if p_status not in ('open','resolved') then raise exception 'BAD_STATUS'; end if;
  update public.support_tickets set status = p_status, admin_note = nullif(btrim(coalesce(p_note, '')), ''),
    resolved_at = case when p_status = 'resolved' then now() else null end
   where id = p_id;
  return found;
end $$;
revoke all on function public.admin_list_support(text), public.admin_update_support(bigint, text, text) from public, anon;
grant execute on function public.admin_list_support(text), public.admin_update_support(bigint, text, text) to authenticated;

-- ---------- Browser error reports (dashboard + exam page) ----------
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  page text check (page is null or length(page) <= 300),
  message text not null check (length(message) <= 600),
  source text check (source is null or length(source) <= 300),
  line integer,
  user_agent text check (user_agent is null or length(user_agent) <= 400),
  created_at timestamptz not null default now()
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
grant insert on public.client_errors to authenticated;
grant usage on sequence public.client_errors_id_seq to authenticated;
create policy "Signed-in pages report own errors" on public.client_errors for insert to authenticated
  with check (user_id = (select auth.uid()));

-- At most 30 reports per user per hour (a broken loop must not fill the table).
create or replace function public.client_errors_rate_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.client_errors where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    return null;
  end if;
  return new;
end $$;
create or replace trigger client_errors_rate_limit before insert on public.client_errors
  for each row execute function public.client_errors_rate_limit();
revoke all on function public.client_errors_rate_limit() from public, anon, authenticated;

create or replace function public.admin_client_errors(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_aldovra_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('message', message, 'page', page, 'source', source, 'line', line,
      'count', n, 'users', users, 'last_at', last_at) order by last_at desc)
    from (select message, page, source, line, count(*) n, count(distinct user_id) users, max(created_at) last_at
            from public.client_errors where created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
           group by message, page, source, line order by max(created_at) desc limit 100) g), '[]'::jsonb);
end $$;
revoke all on function public.admin_client_errors(integer) from public, anon;
grant execute on function public.admin_client_errors(integer) to authenticated;

-- No automatic clean-up yet: the 30-per-hour cap keeps the table small. Purge old rows by hand if it ever grows.

-- ---------- 30-minute site check ----------
-- GitHub runs the hourly "Aldovra Live Smoke Check" only a few times a day, so pg_cron dispatches it every 30 min
-- with the same fine-grained token used for the daily job pages (vault secret github_dispatch_token).
create or replace function public.dispatch_github_workflow(p_workflow text, p_inputs jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id bigint;
begin
  if p_workflow !~ '^[a-z0-9-]+\.yml$' then raise exception 'BAD_WORKFLOW'; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'github_dispatch_token' limit 1;
  if v_token is null or v_token = '' then return null; end if;
  select net.http_post(
    url := 'https://api.github.com/repos/Kruthin55/Aldovra-website/actions/workflows/' || p_workflow || '/dispatches',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'aldovra-pg-cron', 'Content-Type', 'application/json'),
    body := jsonb_build_object('ref', 'main', 'inputs', coalesce(p_inputs, '{}'::jsonb)),
    timeout_milliseconds := 10000) into v_id;
  return v_id;
end $$;
revoke all on function public.dispatch_github_workflow(text, jsonb) from public, anon, authenticated;
select cron.schedule('aldovra-live-smoke-dispatch', '11,41 * * * *', $$select public.dispatch_github_workflow('aldovra-live-smoke-check.yml')$$);
