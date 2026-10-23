-- Increase the rotating public job-board sync cadence while keeping the per-run batch small.
-- With four sources per invocation, a five-minute cadence refreshes a 76-source enabled set
-- in roughly 95 minutes under normal run times.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'aldovra-job-source-sync'
  limit 1;

  if v_job_id is not null then
    perform cron.alter_job(v_job_id, '*/5 * * * *');
  end if;
end
$$;
