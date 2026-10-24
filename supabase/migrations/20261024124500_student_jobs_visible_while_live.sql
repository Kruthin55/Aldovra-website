-- Keep roles visible while they are still live on the employer's site.
-- A role is shown if it was posted in the last 29 days, or if a sync saw it
-- live within the last 3 days and it is at most 90 days old.
create or replace view public.student_active_opportunities
with (security_invoker = true) as
select id, title, company_name, location, work_mode, employment_type, description, experience_level, salary_text,
  application_url, active, created_at, source_provider, source_external_id, source_url, source_last_seen_at,
  source_board_token, application_checked_at, application_check_status, application_check_failures,
  posting_date, expires_at, first_seen_at
from public.opportunities o
where active = true
  and lower(coalesce(application_check_status, '')) <> all (array['suspect_http_404','dead','closed','expired','broken','failed','blocked_or_auth_required_403'])
  and (expires_at is null or expires_at > now())
  and (posting_date is null or posting_date <= (now() at time zone 'Asia/Kolkata')::date)
  and (
    coalesce(posting_date, (created_at at time zone 'Asia/Kolkata')::date) >= (now() at time zone 'Asia/Kolkata')::date - 29
    or (source_last_seen_at > now() - interval '3 days'
        and coalesce(posting_date, (created_at at time zone 'Asia/Kolkata')::date) >= (now() at time zone 'Asia/Kolkata')::date - 90)
  );

revoke select on public.student_active_opportunities from anon;
grant select on public.student_active_opportunities to authenticated;
