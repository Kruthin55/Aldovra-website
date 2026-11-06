-- Short job description for the student dashboard feed (6 Nov 2026).
-- The dashboard used to download every live job's full description (~4 MB for ~935 jobs).
-- description_feed keeps the first 600 plain-text characters (card snippet) plus ~55-character windows around
-- the words the dashboard's filters read (years/experience, fresher/graduate, qualification headings, India/remote
-- wording, skill names). Built by the edge function build-description-feed (cron every 10 min); checked against the
-- dashboard filters on all live jobs: fresher check, India check and location ranking identical, ~63% smaller.
alter table public.opportunities add column if not exists description_feed text;

-- a changed description invalidates its feed copy; the cron rebuilds it
create or replace function public.opportunities_reset_description_feed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.description is distinct from old.description then new.description_feed := null; end if;
  return new;
end; $$;
drop trigger if exists opportunities_reset_description_feed on public.opportunities;
create trigger opportunities_reset_description_feed before update of description on public.opportunities
  for each row execute function public.opportunities_reset_description_feed();

-- bulk writer for the builder (service_role only)
create or replace function public.set_description_feed(p_rows jsonb)
returns int language sql security definer set search_path = '' as $$
  with r as (select (x->>'id')::uuid id, x->>'feed' feed from jsonb_array_elements(p_rows) x),
  u as (update public.opportunities o set description_feed = r.feed from r where o.id = r.id returning 1)
  select count(*)::int from u;
$$;
revoke all on function public.set_description_feed(jsonb) from public, anon, authenticated;
grant execute on function public.set_description_feed(jsonb) to service_role;

-- the view gains description_feed (falls back to the full text until the feed copy exists)
create or replace view public.student_active_opportunities as
 SELECT id, title, company_name, location, work_mode, employment_type, description, experience_level, salary_text,
    application_url, active, created_at, source_provider, source_external_id, source_url, source_last_seen_at,
    source_board_token, application_checked_at, application_check_status, application_check_failures, posting_date,
    expires_at, first_seen_at,
    coalesce(description_feed, description) AS description_feed
   FROM public.opportunities o
  WHERE active = true
    AND (lower(COALESCE(application_check_status, ''::text)) <> ALL (ARRAY['suspect_http_404'::text, 'dead'::text, 'closed'::text, 'expired'::text, 'broken'::text, 'failed'::text, 'blocked_or_auth_required_403'::text]))
    AND (expires_at IS NULL OR expires_at > now())
    AND (posting_date IS NULL OR posting_date <= (now() AT TIME ZONE 'Asia/Kolkata'::text)::date)
    AND COALESCE(posting_date, (created_at AT TIME ZONE 'Asia/Kolkata'::text)::date) >= ((now() AT TIME ZONE 'Asia/Kolkata'::text)::date - 29);
alter view public.student_active_opportunities set (security_invoker = true);
grant select on public.student_active_opportunities to service_role;

select cron.schedule('aldovra-description-feed', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://lgefwfrjzweayfxahogs.supabase.co/functions/v1/build-description-feed',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aldovra_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);
