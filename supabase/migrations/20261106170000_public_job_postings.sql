-- Full public job postings for the per-job SEO pages (/job/<slug>/) with schema.org JobPosting
-- (Google Jobs box). Same live/30-day rows as the student feed. Includes the full description
-- (Google requires it on the posting page) and the employer's apply link.
create or replace function public.public_job_postings(p_limit int default 3000)
returns table (id uuid, title text, company_name text, location text, work_mode text, employment_type text,
               experience_level text, posting_date date, created_at timestamptz, expires_at timestamptz,
               description text, description_feed text, apply_url text, salary_text text)
language sql stable security definer set search_path = public as $$
  select v.id, v.title, v.company_name, v.location, v.work_mode, v.employment_type, v.experience_level,
         v.posting_date, v.created_at, v.expires_at, v.description, v.description_feed,
         coalesce(nullif(v.application_url, ''), v.source_url), v.salary_text
  from public.student_active_opportunities v
  order by coalesce(v.posting_date, v.created_at::date) desc, v.created_at desc
  limit least(greatest(coalesce(p_limit, 3000), 1), 3000);
$$;
revoke all on function public.public_job_postings(int) from public;
grant execute on function public.public_job_postings(int) to anon, authenticated;
