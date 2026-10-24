-- Make opportunity views respect the caller's RLS instead of the view owner's.
alter view public.opportunities_ranked set (security_invoker = true);
alter view public.student_active_opportunities set (security_invoker = true);

-- Only signed-in users (dashboard) read these views.
revoke select on public.opportunities_ranked from anon;
revoke select on public.student_active_opportunities from anon;
