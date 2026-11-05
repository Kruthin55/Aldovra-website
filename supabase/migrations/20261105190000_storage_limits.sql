-- Server-side upload limits (5 Nov 2026). Before this the buckets had no size or type limits;
-- only the browser checked, so a direct API upload could store files of any size.
update storage.buckets set file_size_limit = 2097152,  -- 2 MB
  allowed_mime_types = array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
where id = 'student-resumes';
update storage.buckets set file_size_limit = 5242880,  -- 5 MB (profile photo note says max 5 MB)
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'profile-avatars';
-- Exam evidence: 320px photos, 960px screenshots, 16 kbps audio, timeline.json. 15 MB per file is a generous ceiling.
update storage.buckets set file_size_limit = 15728640
where id = 'assessment-evidence';
