-- Students see only jobs the employer posted in the last 30 days (posting_date, else the day we first added it).
-- The old 90-day exception for jobs still seen on the board is removed: fresher roles older than a month
-- are rarely still hiring and made the feed look stale.
create or replace view public.student_active_opportunities as
 select id, title, company_name, location, work_mode, employment_type, description, experience_level,
        salary_text, application_url, active, created_at, source_provider, source_external_id, source_url,
        source_last_seen_at, source_board_token, application_checked_at, application_check_status,
        application_check_failures, posting_date, expires_at, first_seen_at
   from public.opportunities o
  where active = true
    and lower(coalesce(application_check_status, '')) <> all (array['suspect_http_404','dead','closed','expired','broken','failed','blocked_or_auth_required_403'])
    and (expires_at is null or expires_at > now())
    and (posting_date is null or posting_date <= (now() at time zone 'Asia/Kolkata')::date)
    and coalesce(posting_date, (created_at at time zone 'Asia/Kolkata')::date) >= (now() at time zone 'Asia/Kolkata')::date - 29;

-- create or replace drops view options; keep RLS applied to the querying student.
alter view public.student_active_opportunities set (security_invoker = true);
