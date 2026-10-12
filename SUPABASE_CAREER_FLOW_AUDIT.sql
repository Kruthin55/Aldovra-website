-- Aldovra read-only Supabase audit
-- Run in Supabase SQL Editor against the project database.
-- These statements inspect schema/function/security metadata only; they do not modify data.

-- 1) Confirm the columns used by resume -> assessment -> verification -> career matching.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'student_resumes',
    'assessment_requests',
    'assessment_attempts',
    'assessment_reports',
    'student_skills',
    'skills',
    'assessments',
    'career_agent_profiles',
    'career_preferences',
    'opportunities',
    'opportunity_matches'
  )
order by table_name, ordinal_position;

-- 2) Inspect relevant public-schema functions, including SECURITY DEFINER status and source.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  pg_get_userbyid(p.proowner) as owner,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%career_context%'
    or p.proname ilike '%match_my_opportunities%'
    or p.proname ilike '%resume%'
    or p.proname ilike '%assessment%'
    or p.proname ilike '%verified%'
    or p.proname ilike '%skill%'
  )
order by p.proname;

-- 3) Inspect RLS enablement for relevant tables.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in (
    'student_resumes',
    'assessment_requests',
    'assessment_attempts',
    'assessment_reports',
    'student_skills',
    'career_agent_profiles',
    'career_preferences',
    'opportunities',
    'opportunity_matches'
  )
order by c.relname;

-- 4) Inspect table policies (check both USING and WITH CHECK expressions).
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
    'student_resumes',
    'assessment_requests',
    'assessment_attempts',
    'assessment_reports',
    'student_skills',
    'career_agent_profiles',
    'career_preferences',
    'opportunities',
    'opportunity_matches'
  )
order by tablename, policyname;

-- 5) Inspect explicit table grants to API roles.
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
  and table_name in (
    'student_resumes',
    'assessment_requests',
    'assessment_attempts',
    'assessment_reports',
    'student_skills',
    'career_agent_profiles',
    'career_preferences',
    'opportunities',
    'opportunity_matches'
  )
order by table_name, grantee, privilege_type;

-- Review checklist after running:
-- A. Resume parsed_data must only be trusted when status = 'analyzed' and belongs to auth.uid().
-- B. Assessment requests/attempts/reports must be scoped to the authenticated student and exact request/attempt/session.
-- C. Verification status/score and retake fees/cooldowns must be calculated server-side, never trusted from browser input.
-- D. Career context and opportunity matching must only expose the caller's own profile, resume, preferences, and verified skills.
-- E. SECURITY DEFINER functions must use a fixed safe search_path and explicit auth.uid() ownership checks.
-- F. Do not paste secrets, resume contents, or student personal data into review notes.
