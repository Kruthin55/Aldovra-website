-- 17 Nov 2026 security audit: exam evidence integrity.
-- Students could overwrite their own snapshots/audio/timeline.json at any time, even after
-- submitting, which would let someone replace proof of cheating. Now an existing evidence file
-- can only be overwritten while that exam session is open (or within 15 min of submit, for
-- upload retries). New files can still be added (the proctor uploads with upsert).
drop policy if exists "Students update own assessment evidence" on storage.objects;
create policy "Students update own assessment evidence"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'assessment-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.assessment_sessions s
      where s.id::text = (storage.foldername(name))[2]
        and s.user_id = (select auth.uid())
        and (s.submitted_at is null or s.submitted_at > now() - interval '15 minutes')
        and coalesce(s.status, '') <> 'expired'
    )
  )
  with check (
    bucket_id = 'assessment-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Only the file types the proctor and the old camera recorder produce.
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mp4',
                                  'audio/mpeg','video/webm','video/mp4','application/json']
 where id = 'assessment-evidence';
