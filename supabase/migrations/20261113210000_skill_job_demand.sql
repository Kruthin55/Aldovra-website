-- How many live jobs on Aldovra mention each skill (title or feed text, word-boundary match).
-- Feeds the "N live jobs ask for <skill>" chips on dashboard test cards and the next-step card.
-- Names shorter than 3 characters (C, R, Go) are skipped unless they contain + or # (C++, C#),
-- because a plain substring match on them would count unrelated jobs.
create or replace function public.skill_job_demand(p_names text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select distinct trim(x) as name
    from unnest(coalesce(p_names, '{}'::text[])) as x
    where trim(x) <> '' and (length(trim(x)) >= 3 or trim(x) ~ '[+#]')
    limit 40
  ),
  p as (
    select name,
      '(^|[^a-z0-9])' || regexp_replace(lower(name), '([.+*?^$()\[\]{}|\\#])', '\\\1', 'g') || '($|[^a-z0-9+#])' as re
    from n
  ),
  j as (
    select lower(coalesce(title,'') || ' ' || coalesce(description_feed, description, '')) as t
    from public.student_active_opportunities
  )
  select coalesce(jsonb_object_agg(p.name, (select count(*) from j where j.t ~ p.re)), '{}'::jsonb)
  from p;
$$;
revoke all on function public.skill_job_demand(text[]) from public;
grant execute on function public.skill_job_demand(text[]) to anon, authenticated;
