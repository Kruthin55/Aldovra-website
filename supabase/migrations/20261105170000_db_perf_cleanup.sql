-- DB performance cleanup (5 Nov 2026), from the Supabase performance advisor.
-- 1) Covering indexes for foreign keys.
create index if not exists question_exposures_question_id_idx on public.question_exposures (question_id);
create index if not exists recruiter_access_reviewed_by_idx on public.recruiter_access (reviewed_by);
create index if not exists recruiter_shortlist_student_id_idx on public.recruiter_shortlist (student_id);
create index if not exists skill_certificates_assessment_id_idx on public.skill_certificates (assessment_id);
create index if not exists skill_certificates_skill_id_idx on public.skill_certificates (skill_id);
create index if not exists student_job_applications_opportunity_id_idx on public.student_job_applications (opportunity_id);

-- 2) Evaluate auth.uid() once per query instead of once per row.
alter policy "Students can view their own job applications" on public.student_job_applications
  using ((select auth.uid()) = user_id);
alter policy "Students can create their own job applications" on public.student_job_applications
  with check ((select auth.uid()) = user_id);
alter policy "Students can update their own job applications" on public.student_job_applications
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Students can delete their own job applications" on public.student_job_applications
  using ((select auth.uid()) = user_id);

-- 3) Drop exact duplicate SELECT policies (an identical or broader policy stays in place).
drop policy if exists "Users can view own assessment attempts" on public.assessment_attempts;       -- = "Students view own assessment attempts"
drop policy if exists "Admins view evidence metadata" on public.assessment_evidence;                 -- = "Admins view evidence"
drop policy if exists "Students view own evidence" on public.assessment_evidence;                    -- = "Students view own assessment evidence"
drop policy if exists "Students can view their own assessment payments" on public.assessment_payments; -- = "Students view own assessment payments"
drop policy if exists "Admins view reports" on public.assessment_reports;                            -- = "Admins view assessment reports"
drop policy if exists "Students view own reports" on public.assessment_reports;                      -- = "Students view own assessment reports"
drop policy if exists "Users can view own assessment requests" on public.assessment_requests;        -- covered by "Admins can view all assessment requests" (own OR admin)
drop policy if exists "Students can view own assessment requests" on public.assessment_requests;     -- same
drop policy if exists "Admins can view job sources" on public.job_sources;                           -- covered by "Admins manage job sources" (ALL)
