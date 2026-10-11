-- Add missing single-column FK indexes identified by the Supabase performance advisor.
-- These indexes support joins and avoid table scans when parent rows are updated/deleted.
create index if not exists idx_assessment_answers_question_id on public.assessment_answers (question_id);
create index if not exists idx_assessment_attempts_assessment_id on public.assessment_attempts (assessment_id);
create index if not exists idx_assessment_evidence_user_id on public.assessment_evidence (user_id);
create index if not exists idx_assessment_questions_assessment_id on public.assessment_questions (assessment_id);
create index if not exists idx_assessment_reports_attempt_id on public.assessment_reports (attempt_id);
create index if not exists idx_assessment_requests_assessment_id on public.assessment_requests (assessment_id);
create index if not exists idx_assessment_requests_reviewed_by on public.assessment_requests (reviewed_by);
create index if not exists idx_assessment_requests_user_id on public.assessment_requests (user_id);
create index if not exists idx_assessment_sessions_assessment_id on public.assessment_sessions (assessment_id);
create index if not exists idx_assessments_skill_id on public.assessments (skill_id);
create index if not exists idx_career_track_skills_skill_id on public.career_track_skills (skill_id);
create index if not exists idx_job_application_tracker_opportunity_id on public.job_application_tracker (opportunity_id);
create index if not exists idx_opportunity_matches_opportunity_id on public.opportunity_matches (opportunity_id);
create index if not exists idx_opportunity_skills_skill_id on public.opportunity_skills (skill_id);
create index if not exists idx_student_resumes_user_id on public.student_resumes (user_id);
create index if not exists idx_student_skills_skill_id on public.student_skills (skill_id);
