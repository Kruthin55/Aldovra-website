-- Replaced by get_competitive_leaderboard. The old function exposed every
-- student's full name and college to any signed-in user.
revoke execute on function public.get_explore_students() from public, anon, authenticated;
