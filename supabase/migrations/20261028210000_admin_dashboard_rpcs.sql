-- Admin dashboard v2 (28 Oct 2026): Overview KPIs, Certificates, Payments, System health.
-- Every function checks admin_users first; nothing here is callable by anon.

create or replace function public.assert_aldovra_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------- overview
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today_ist timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  res jsonb;
begin
  perform public.assert_aldovra_admin();
  select jsonb_build_object(
    'students_total', (select count(*) from public.profiles where coalesce(role, 'student') = 'student'),
    'students_7d', (select count(*) from public.profiles where coalesce(role, 'student') = 'student' and created_at > now() - interval '7 days'),
    'exams_today', (select count(*) from public.assessment_reports where created_at >= today_ist),
    'exams_7d', (select count(*) from public.assessment_reports where created_at > now() - interval '7 days'),
    'pass_rate_30d', (select round(100.0 * count(*) filter (where percentage >= 75) / nullif(count(*), 0), 1)
                        from public.assessment_reports where created_at > now() - interval '30 days'),
    'pending_video_reviews', (
      select count(distinct ev.session_id)
      from public.assessment_evidence ev
      join public.assessment_sessions s on s.id = ev.session_id
      join public.assessment_reports ar on ar.session_id = ev.session_id and ar.user_id = ev.user_id
      left join public.assessment_request_details d on d.request_id::text = s.request_id::text
      where nullif(btrim(ev.environment_video_url), '') is not null
        and coalesce(d.verification_status, 'pending_review') not in ('verified', 'rejected', 'not_verified', 'reattempt_required')),
    'certificates_active', (select count(*) from public.skill_certificates where revoked_at is null),
    'certificates_30d', (select count(*) from public.skill_certificates where revoked_at is null and issued_at > now() - interval '30 days'),
    'public_profiles', (select count(*) from public.public_profiles where is_public),
    'revenue_total', (select coalesce(sum(amount), 0) from public.assessment_payments where status = 'paid' and provider = 'payu'),
    'revenue_30d', (select coalesce(sum(amount), 0) from public.assessment_payments where status = 'paid' and provider = 'payu' and coalesce(paid_at, created_at) > now() - interval '30 days'),
    'payments_open', (select count(*) from public.assessment_payments where status in ('created', 'pending')),
    'payments_live', coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'reattempt_payments_live'), false),
    'jobs_visible', (public.job_pipeline_health() ->> 'student_visible_jobs')::int,
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', to_char(d, 'YYYY-MM-DD'),
        'signups', (select count(*) from public.profiles p where coalesce(p.role, 'student') = 'student'
                     and p.created_at >= d::timestamp at time zone 'Asia/Kolkata' and p.created_at < (d + 1)::timestamp at time zone 'Asia/Kolkata'),
        'exams', (select count(*) from public.assessment_reports r
                   where r.created_at >= d::timestamp at time zone 'Asia/Kolkata' and r.created_at < (d + 1)::timestamp at time zone 'Asia/Kolkata'),
        'certificates', (select count(*) from public.skill_certificates c
                   where c.issued_at >= d::timestamp at time zone 'Asia/Kolkata' and c.issued_at < (d + 1)::timestamp at time zone 'Asia/Kolkata'))
        order by d)
      from generate_series((now() at time zone 'Asia/Kolkata')::date - 13, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') g(d0),
           lateral (select g.d0::date as d) x)
  ) into res;
  return res;
end;
$$;

-- ---------------------------------------------------------------- certificates
create or replace function public.admin_list_certificates(p_search text default null, p_status text default 'active', p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_aldovra_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.issued_at desc)
    from (
      select c.code, coalesce(nullif(btrim(p.full_name), ''), 'Student') as holder, u.email, s.name as skill, c.score,
             c.issued_at, c.revoked_at, pp.slug as profile_slug, coalesce(pp.is_public, false) as is_public
      from public.skill_certificates c
      join public.skills s on s.id = c.skill_id
      left join public.profiles p on p.id = c.user_id
      left join auth.users u on u.id = c.user_id
      left join public.public_profiles pp on pp.user_id = c.user_id
      where (coalesce(p_status, 'active') = 'all'
             or (p_status = 'active' and c.revoked_at is null)
             or (p_status = 'revoked' and c.revoked_at is not null))
        and (nullif(btrim(p_search), '') is null
             or c.code ilike '%' || btrim(p_search) || '%'
             or p.full_name ilike '%' || btrim(p_search) || '%'
             or u.email ilike '%' || btrim(p_search) || '%'
             or s.name ilike '%' || btrim(p_search) || '%')
      order by c.issued_at desc
      limit least(greatest(coalesce(p_limit, 200), 1), 500)
    ) x), '[]'::jsonb);
end;
$$;

-- Revoking = withdrawing the admin approval; the certificate trigger then revokes it.
create or replace function public.admin_revoke_certificate(p_code text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.skill_certificates;
  v_request text;
  v_reason text := left(nullif(btrim(p_reason), ''), 300);
begin
  perform public.assert_aldovra_admin();
  if v_reason is null then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;
  select * into c from public.skill_certificates where code = upper(btrim(p_code));
  if not found then
    raise exception 'Certificate not found' using errcode = 'P0001';
  end if;
  select s.request_id into v_request
  from public.assessment_reports ar join public.assessment_sessions s on s.id = ar.session_id
  where ar.id = c.report_id;
  update public.assessment_reports
     set verification_status = 'reattempt_required',
         result_message = 'Your verification was withdrawn by Aldovra: ' || v_reason
   where id = c.report_id;
  update public.assessment_request_details
     set verification_status = 'rejected',
         admin_notes = trim(both from coalesce(admin_notes, '') || ' [Certificate ' || c.code || ' revoked ' || to_char(now(), 'YYYY-MM-DD') || ': ' || v_reason || ']'),
         updated_at = now()
   where request_id::text = v_request;
  perform public.sync_certificate_for_report(c.report_id);
  return public.verify_certificate(c.code);
end;
$$;

-- ---------------------------------------------------------------- payments
create or replace function public.admin_list_payments(p_status text default 'all', p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_aldovra_admin();
  return jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'paid_count', count(*) filter (where status = 'paid'),
        'paid_amount', coalesce(sum(amount) filter (where status = 'paid'), 0),
        'paid_30d', coalesce(sum(amount) filter (where status = 'paid' and coalesce(paid_at, created_at) > now() - interval '30 days'), 0),
        'open_count', count(*) filter (where status in ('created', 'pending')),
        'failed_count', count(*) filter (where status in ('failed', 'cancelled')),
        'unused_paid', count(*) filter (where status = 'paid' and not coalesce(entitlement_used, false)))
      from public.assessment_payments where provider = 'payu'),
    'rows', coalesce((
      select jsonb_agg(row_to_json(x) order by x.created_at desc)
      from (
        select pay.id, pay.created_at, pay.paid_at, pay.amount, pay.currency, pay.status, pay.purpose, pay.provider,
               pay.provider_txn_id, pay.provider_payment_id, pay.failure_reason, pay.entitlement_used,
               coalesce(nullif(btrim(p.full_name), ''), 'Student') as student, u.email, a.title as assessment
        from public.assessment_payments pay
        left join public.profiles p on p.id = pay.user_id
        left join auth.users u on u.id = pay.user_id
        left join public.assessments a on a.id = pay.assessment_id
        where coalesce(p_status, 'all') = 'all'
           or (p_status = 'paid' and pay.status = 'paid')
           or (p_status = 'open' and pay.status in ('created', 'pending'))
           or (p_status = 'failed' and pay.status in ('failed', 'cancelled'))
        order by pay.created_at desc
        limit least(greatest(coalesce(p_limit, 200), 1), 500)
      ) x), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------- system health
create or replace function public.admin_system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jobs jsonb := public.job_pipeline_health();
begin
  perform public.assert_aldovra_admin();
  return jsonb_build_object(
    'checked_at', now(),
    'jobs', jobs,
    'question_bank', (
      select jsonb_build_object(
        'active_total', coalesce(sum(active), 0),
        'skills_total', count(*),
        'skills_below_target', count(*) filter (where active < 300),
        'lowest', (select jsonb_agg(row_to_json(q)) from (
                     select skill_name, active, recent_requests from public.question_bank_stats() order by active asc limit 5) q),
        'refill_paused_until', (select value #>> '{}' from public.platform_settings where key = 'question_bank_refill_pause_until'))
      from public.question_bank_stats()),
    'cron', (
      select jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_status', lr.status, 'last_start', lr.start_time, 'last_message', left(lr.return_message, 160),
        'failures_24h', (select count(*) from cron.job_run_details f
                          where f.jobid = j.jobid and f.status = 'failed' and f.start_time > now() - interval '24 hours'),
        'runs_24h', (select count(*) from cron.job_run_details f where f.jobid = j.jobid and f.start_time > now() - interval '24 hours'))
        order by j.jobname)
      from cron.job j
      left join lateral (select r.status, r.start_time, r.return_message from cron.job_run_details r
                         where r.jobid = j.jobid order by r.start_time desc limit 1) lr on true),
    'ai', jsonb_build_object(
      'resumes_waiting_ai_retry', (select count(*) from public.student_resumes
                                    where status = 'analysis_failed'
                                       or (status = 'analyzed' and coalesce(parsed_data ->> 'needs_ai_retry', 'false') = 'true')),
      'resumes_stuck_analyzing', (select count(*) from public.student_resumes
                                   where status = 'analyzing' and uploaded_at < now() - interval '15 minutes'),
      'keyword_fallback_7d', (select count(*) from public.student_resumes
                               where parsed_data ->> 'analysis_mode' = 'keyword_fallback' and uploaded_at > now() - interval '7 days')),
    'storage', jsonb_build_object(
      'buckets', (select jsonb_agg(jsonb_build_object('bucket', bucket_id, 'files', n, 'bytes', b) order by b desc)
                  from (select bucket_id, count(*) n, coalesce(sum((metadata ->> 'size')::bigint), 0) b
                        from storage.objects group by bucket_id) s),
      'storage_bytes', (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects),
      'storage_limit_bytes', 1073741824,
      'db_bytes', pg_database_size(current_database()),
      'db_limit_bytes', 524288000),
    'payments_live', coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'reattempt_payments_live'), false));
end;
$$;

revoke all on function public.assert_aldovra_admin() from public, anon, authenticated;
revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_list_certificates(text, text, integer) from public, anon;
revoke all on function public.admin_revoke_certificate(text, text) from public, anon;
revoke all on function public.admin_list_payments(text, integer) from public, anon;
revoke all on function public.admin_system_health() from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_certificates(text, text, integer) to authenticated;
grant execute on function public.admin_revoke_certificate(text, text) to authenticated;
grant execute on function public.admin_list_payments(text, integer) to authenticated;
grant execute on function public.admin_system_health() to authenticated;
