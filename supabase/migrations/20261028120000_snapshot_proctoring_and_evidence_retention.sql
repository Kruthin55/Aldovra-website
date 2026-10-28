-- Snapshot proctoring + evidence retention (28 Oct 2026)
-- Exams no longer upload full camera/screen videos. The browser uploads a JPEG camera photo and a
-- screen screenshot every 20 s (plus one on every suspicious event), a low-bitrate audio track and a
-- timeline.json manifest. A nightly job deletes evidence files:
--   * attempts below 75%      -> 7 days after submission
--   * attempts 75% and above  -> 90 days after submission
--   * sessions never submitted (abandoned) -> 7 days after they started
-- Resumes: only the two newest files per student are kept.

alter table public.assessment_evidence
  add column if not exists audio_path text,
  add column if not exists timeline_path text,
  add column if not exists snapshot_count integer,
  add column if not exists media_deleted_at timestamptz;

-- Storage objects that the retention policy says can go. Service role only.
create or replace function public.evidence_cleanup_candidates(p_limit integer default 1000)
returns table(bucket_id text, name text, reason text)
language sql
security definer
set search_path = public, storage
as $$
  with session_age as (
    select s.id as session_id,
           s.user_id,
           coalesce(a.submitted_at, s.submitted_at, s.started_at, s.created_at) as at,
           a.percentage
    from public.assessment_sessions s
    left join public.assessment_attempts a on a.session_id = s.id
  ),
  expired_sessions as (
    select session_id, user_id,
           case when percentage is null then 'abandoned_7d'
                when percentage >= 75 then 'passed_90d'
                else 'failed_7d' end as reason
    from session_age
    where (percentage is null and at < now() - interval '7 days')
       or (percentage < 75 and at < now() - interval '7 days')
       or (percentage >= 75 and at < now() - interval '90 days')
  ),
  evidence_files as (
    select o.bucket_id, o.name, e.reason
    from storage.objects o
    join expired_sessions e
      on o.bucket_id = 'assessment-evidence'
     and (storage.foldername(o.name))[1] = e.user_id::text
     and (storage.foldername(o.name))[2] = e.session_id::text
  ),
  orphan_files as (
    -- evidence folders whose session row no longer exists
    select o.bucket_id, o.name, 'orphan_7d'::text as reason
    from storage.objects o
    where o.bucket_id = 'assessment-evidence'
      and o.created_at < now() - interval '7 days'
      and not exists (
        select 1 from public.assessment_sessions s
        where s.id::text = (storage.foldername(o.name))[2]
      )
  ),
  old_resumes as (
    select r.file_path
    from (
      select file_path, user_id,
             row_number() over (partition by user_id order by uploaded_at desc nulls last) as rn
      from public.student_resumes
      where file_path is not null and coalesce(status, '') <> 'deleted'
    ) r
    where r.rn > 2
  ),
  resume_files as (
    select o.bucket_id, o.name, 'resume_keep_latest_2'::text as reason
    from storage.objects o
    join old_resumes r on o.bucket_id = 'student-resumes' and o.name = r.file_path
  )
  select * from (
    select * from evidence_files
    union all select * from orphan_files
    union all select * from resume_files
  ) x
  limit greatest(1, least(p_limit, 5000));
$$;

revoke all on function public.evidence_cleanup_candidates(integer) from public, anon, authenticated;
grant execute on function public.evidence_cleanup_candidates(integer) to service_role;

-- Mark rows after their files are removed (called by the cleanup function with the deleted names).
create or replace function public.evidence_mark_deleted(p_names text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assessment_evidence e
     set camera_path = null,
         screen_path = null,
         audio_path = null,
         timeline_path = null,
         media_deleted_at = now()
   where exists (
     select 1 from unnest(p_names) n
     where split_part(n, '/', 1) = e.user_id::text
       and split_part(n, '/', 2) = e.session_id::text
   );

  update public.student_resumes r
     set status = 'deleted'
   where r.file_path = any(p_names);
end;
$$;

revoke all on function public.evidence_mark_deleted(text[]) from public, anon, authenticated;
grant execute on function public.evidence_mark_deleted(text[]) to service_role;

-- Nightly at 02:41 IST (21:11 UTC). The function deletes the files and calls evidence_mark_deleted().
select cron.schedule('aldovra-evidence-cleanup', '11 21 * * *', $c$
  select net.http_post(
    url := 'https://lgefwfrjzweayfxahogs.supabase.co/functions/v1/cleanup-exam-evidence',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aldovra_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$c$);
