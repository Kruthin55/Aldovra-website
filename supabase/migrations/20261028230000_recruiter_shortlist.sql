-- Recruiter shortlist (28 Oct 2026): replaces the old sample "Shortlisted" page with a real one.
-- A recruiter only ever sees and changes their own saved candidates. Saved students who later leave the
-- recruiter pool (opt out / certificate revoked) simply stop showing, because the page lists the pool first.

create table if not exists public.recruiter_shortlist (
  recruiter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (recruiter_id, student_id)
);
alter table public.recruiter_shortlist enable row level security;

create or replace function public.is_approved_recruiter()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.recruiter_access where user_id = auth.uid() and approved)
      or exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_approved_recruiter() from public, anon;
grant execute on function public.is_approved_recruiter() to authenticated;

drop policy if exists "Recruiters read own shortlist" on public.recruiter_shortlist;
drop policy if exists "Recruiters add to own shortlist" on public.recruiter_shortlist;
drop policy if exists "Recruiters update own shortlist" on public.recruiter_shortlist;
drop policy if exists "Recruiters remove from own shortlist" on public.recruiter_shortlist;
create policy "Recruiters read own shortlist" on public.recruiter_shortlist
  for select to authenticated using (recruiter_id = (select auth.uid()));
create policy "Recruiters add to own shortlist" on public.recruiter_shortlist
  for insert to authenticated with check (recruiter_id = (select auth.uid()) and (select public.is_approved_recruiter()));
create policy "Recruiters update own shortlist" on public.recruiter_shortlist
  for update to authenticated using (recruiter_id = (select auth.uid())) with check (recruiter_id = (select auth.uid()));
create policy "Recruiters remove from own shortlist" on public.recruiter_shortlist
  for delete to authenticated using (recruiter_id = (select auth.uid()));
revoke all on public.recruiter_shortlist from anon;
