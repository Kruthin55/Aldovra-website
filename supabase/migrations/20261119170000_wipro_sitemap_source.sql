-- Wipro via its public SuccessFactors sitemap (19 Nov 2026). sync-job-sources v99 reads entry-band India titles
-- and reconciles Wipro jobs against the full sitemap, so reconcile_job_source_feed must accept official_careers.
create or replace function public.reconcile_job_source_feed(p_source_provider text, p_board_token text, p_live_external_ids text[], p_feed_complete boolean)
 returns integer language plpgsql security definer set search_path to 'pg_catalog', 'public' as $function$
declare v_deactivated integer := 0;
begin
  if coalesce(p_feed_complete, false) is not true then return 0; end if;
  if p_source_provider not in ('greenhouse','lever','ashby','smartrecruiters','jobicy','remoteok','himalayas','workday','official_careers') then raise exception 'Unsupported job source provider'; end if;
  if nullif(btrim(p_board_token), '') is null then raise exception 'Job source board token is required'; end if;
  update public.opportunities o set active=false
  where o.active=true and o.source_provider=p_source_provider and o.source_board_token=p_board_token
    and not (coalesce(o.source_external_id, '') = any(coalesce(p_live_external_ids, array[]::text[])));
  get diagnostics v_deactivated = row_count;
  return v_deactivated;
end;
$function$;

update public.job_sources set enabled = true, cursor_token = '0', last_sync_status = 're-enabled 19 Nov 2026: sitemap reader'
 where provider = 'official_careers' and board_token = 'wipro';
