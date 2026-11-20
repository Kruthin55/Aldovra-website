-- GitHub's own schedule is unreliable (19 Nov 2026 the 06:47 run never started; 20 Nov none of the three morning runs did),
-- so Supabase pg_cron dispatches the seo-job-pages workflow itself with daily=true. The workflow still posts to Telegram
-- at most once per IST day, so the extra dispatches only rebuild pages.
-- Needs a fine-grained GitHub token (repo Kruthin55/Aldovra-website, permission "Actions: Read and write" only) stored in the
-- vault as 'github_dispatch_token'. Until it exists the function does nothing.
create or replace function public.dispatch_seo_job_pages()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'github_dispatch_token' limit 1;
  if v_token is null or v_token = '' then return null; end if;
  select net.http_post(
    url := 'https://api.github.com/repos/Kruthin55/Aldovra-website/actions/workflows/seo-job-pages.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'aldovra-pg-cron',
      'Content-Type', 'application/json'),
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('daily', 'true')),
    timeout_milliseconds := 10000) into v_id;
  return v_id;
end $$;
revoke all on function public.dispatch_seo_job_pages() from public, anon, authenticated;

-- 07:02 IST (01:32 UTC) main run, 08:32 IST (03:02 UTC) backup.
select cron.schedule('aldovra-seo-dispatch-am', '32 1 * * *', 'select public.dispatch_seo_job_pages()');
select cron.schedule('aldovra-seo-dispatch-backup', '2 3 * * *', 'select public.dispatch_seo_job_pages()');
