-- Public, anon-callable list of companies with the most live fresher jobs right now.
-- Feeds the moving logo strip on login/signup ("Live fresher jobs from ...").
create or replace function public.hiring_now_companies(p_limit int default 24)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (select company_name from public.student_active_opportunities where coalesce(company_name,'') <> ''),
  c as (select company_name as name, count(*) as jobs from v group by 1 order by 2 desc, 1 limit least(greatest(coalesce(p_limit,24),1),60))
  select jsonb_build_object(
    'companies',  coalesce((select jsonb_agg(jsonb_build_object('name', name, 'jobs', jobs) order by jobs desc, name) from c), '[]'::jsonb),
    'total_companies', (select count(distinct lower(company_name)) from v),
    'live_jobs', (select count(*) from v)
  );
$$;
revoke all on function public.hiring_now_companies(int) from public;
grant execute on function public.hiring_now_companies(int) to anon, authenticated;
