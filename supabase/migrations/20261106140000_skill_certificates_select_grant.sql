-- The dashboard next-step card counts the student's own certificates (dash-mission.js).
-- RLS policy "Students read own certificates" already limits rows to auth.uid(); the table just lacked the SELECT grant (403).
grant select on public.skill_certificates to authenticated;
