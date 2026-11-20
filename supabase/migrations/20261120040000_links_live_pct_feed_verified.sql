-- Daily check 20 Nov 2026: links_live_pct counted only 'available', so the 389
-- feed_verified rows (Jooble + SuccessFactors sitemap boards, check-job-links v14)
-- dragged it to 72.8% although ~94% of active jobs are live. Count feed_verified as live.
create or replace function public.job_pipeline_health()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'checked_at', now(),
    'student_visible_jobs', (select count(*) from public.student_active_opportunities),
    'active_jobs', (select count(*) from public.opportunities where active),
    'new_jobs_24h', (select count(*) from public.opportunities where first_seen_at > now() - interval '24 hours'),
    'last_source_sync_at', (select max(last_synced_at) from public.job_sources where enabled),
    'sources_enabled', (select count(*) from public.job_sources where enabled),
    'sources_synced_24h', (select count(*) from public.job_sources where enabled and last_synced_at > now() - interval '24 hours'),
    'sources_erroring', (select count(*) from public.job_sources where enabled and last_synced_at > now() - interval '24 hours' and last_sync_status like 'error%'),
    'links_checked_24h', (select count(*) from public.opportunities where active and application_checked_at > now() - interval '24 hours'),
    'links_live_pct', (select round(100.0 * count(*) filter (where application_check_status in ('available','feed_verified')) / nullif(count(*) filter (where application_check_status is not null), 0), 1) from public.opportunities where active)
  );
$function$;
