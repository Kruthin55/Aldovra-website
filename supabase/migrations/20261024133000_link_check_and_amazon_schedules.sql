-- Link checks every 20 minutes (90 jobs per run, each job re-verified at least
-- every 12 hours) and the Amazon India sync every 30 minutes.
select cron.alter_job(jobid, schedule := '*/20 * * * *')
from cron.job where jobname = 'aldovra-application-link-check';

select cron.unschedule(jobid) from cron.job where jobname = 'aldovra-amazon-sync';
select cron.schedule('aldovra-amazon-sync', '7,37 * * * *', $$
  select net.http_post(
    url := 'https://lgefwfrjzweayfxahogs.supabase.co/functions/v1/sync-amazon-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aldovra_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
