-- Public, aggregate-only stats for the dashboard "How your jobs reach you" strip.
create or replace function public.jobs_trust_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (select company_name, posting_date, created_at from public.student_active_opportunities),
  d as (select (now() at time zone 'Asia/Kolkata')::date as today)
  select jsonb_build_object(
    'live_jobs',        (select count(*) from v),
    'companies',        (select count(distinct lower(company_name)) from v),
    'this_week',        (select count(*) from v, d where coalesce(v.posting_date, (v.created_at at time zone 'Asia/Kolkata')::date) >= d.today - 6),
    'sources',          (select count(*) from public.job_sources where enabled),
    'closed_hidden',    (select count(*) from public.opportunities o
                          where o.active and lower(coalesce(o.application_check_status,'')) = any (array['suspect_http_404','dead','closed','expired','broken','failed','blocked_or_auth_required_403'])),
    'old_hidden',       (select count(*) from public.opportunities o, d
                          where o.active and coalesce(o.posting_date, (o.created_at at time zone 'Asia/Kolkata')::date) < d.today - 29),
    'links_checked_24h',(select count(*) from public.opportunities o where o.application_checked_at > now() - interval '24 hours'),
    'last_link_check',  (select max(application_checked_at) from public.opportunities),
    'checked_at',       now()
  );
$$;
revoke all on function public.jobs_trust_stats() from public;
grant execute on function public.jobs_trust_stats() to anon, authenticated;
