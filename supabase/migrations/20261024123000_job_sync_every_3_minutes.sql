-- ~150 job sources are processed five at a time; run every 3 minutes so the
-- full rotation completes in roughly 90 minutes.
select cron.alter_job(jobid, schedule := '*/3 * * * *')
from cron.job
where jobname = 'aldovra-job-source-sync';
