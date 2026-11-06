-- Public, anon-callable feed for the static SEO job pages (/jobs/...), generated daily by
-- .github/workflows/seo-job-pages.yml. Same live/fresh rules as the student feed (it reads
-- student_active_opportunities). No apply links: students sign up to see match % and apply.
create or replace function public.public_jobs_feed(p_limit int default 2000)
returns table (id uuid, title text, company_name text, location text, work_mode text, employment_type text,
               experience_level text, posting_date date, created_at timestamptz, description text)
language sql stable security definer set search_path = public as $$
  select v.id, v.title, v.company_name, v.location, v.work_mode, v.employment_type, v.experience_level,
         v.posting_date, v.created_at, v.description_feed
  from public.student_active_opportunities v
  order by coalesce(v.posting_date, v.created_at::date) desc, v.created_at desc
  limit least(greatest(coalesce(p_limit, 2000), 1), 3000);
$$;
revoke all on function public.public_jobs_feed(int) from public;
grant execute on function public.public_jobs_feed(int) to anon, authenticated;
