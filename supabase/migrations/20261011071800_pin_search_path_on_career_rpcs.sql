-- These SECURITY DEFINER RPCs intentionally remain callable by authenticated
-- clients because existing dashboards/Career Agent flows use them. Pinning an
-- empty search_path prevents caller-controlled schema object shadowing; their
-- table references are explicitly schema-qualified and auth.uid() is qualified.
ALTER FUNCTION public.get_explore_students() SET search_path = '';
ALTER FUNCTION public.get_my_career_context() SET search_path = '';
ALTER FUNCTION public.get_platform_statistics() SET search_path = '';
ALTER FUNCTION public.match_my_opportunities() SET search_path = '';
