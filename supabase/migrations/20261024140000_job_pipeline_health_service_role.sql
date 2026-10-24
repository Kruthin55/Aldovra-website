-- The public job-pipeline-health edge function calls this RPC with the service role.
grant execute on function public.job_pipeline_health() to service_role;
