-- Housekeeping + AI cost guard (28 Oct 2026)

-- 1) Resume uploads trigger Gemini analysis. Cap uploads per student per day so nobody can burn
--    the AI quota by uploading in a loop. (5/day is plenty for real edits.)
create or replace function public.limit_resume_uploads_per_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from student_resumes
       where user_id = new.user_id and uploaded_at > now() - interval '24 hours') >= 5 then
    raise exception 'You can upload up to 5 resumes per day. Please try again tomorrow.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists student_resumes_daily_limit on public.student_resumes;
create trigger student_resumes_daily_limit
  before insert on public.student_resumes
  for each row execute function public.limit_resume_uploads_per_day();

-- 2) pg_cron keeps a row per run (our jobs run every few minutes). Keep 7 days of history.
select cron.schedule('aldovra-cron-history-cleanup', '23 22 * * *', $c$
  delete from cron.job_run_details where end_time < now() - interval '7 days';
$c$);
