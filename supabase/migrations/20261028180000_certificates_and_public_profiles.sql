-- Verified skill certificates + opt-in public profiles (28 Oct 2026)
--
-- A certificate exists for every skill a student has VERIFIED: score >= 75% and the admin approved the
-- environment video (assessment_reports.verification_status = 'eligible'). One certificate per student per
-- skill (best score wins), with a public code like ALD-7K3M-Q9XP that anyone can check at /cert/?<code>.
-- Public profiles are off by default; the student picks a slug and switches it on from the dashboard.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- certificates
create table if not exists public.skill_certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id bigint not null references public.skills(id),
  assessment_id bigint references public.assessments(id) on delete set null,
  report_id bigint references public.assessment_reports(id) on delete set null,
  score numeric(5,2) not null,
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, skill_id)
);
create index if not exists skill_certificates_report_idx on public.skill_certificates(report_id);
alter table public.skill_certificates enable row level security;
drop policy if exists "Students read own certificates" on public.skill_certificates;
create policy "Students read own certificates" on public.skill_certificates
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.new_certificate_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- no 0/O/1/I/L
  raw bytea;
  c text;
begin
  loop
    raw := extensions.gen_random_bytes(8);
    c := '';
    for i in 0..7 loop
      c := c || substr(alphabet, (get_byte(raw, i) % length(alphabet)) + 1, 1);
    end loop;
    c := 'ALD-' || substr(c, 1, 4) || '-' || substr(c, 5, 4);
    exit when not exists (select 1 from public.skill_certificates where code = c);
  end loop;
  return c;
end;
$$;
revoke all on function public.new_certificate_code() from public, anon, authenticated;

-- Issue, upgrade or revoke the certificate that a report affects.
create or replace function public.sync_certificate_for_report(p_report_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  best record;
begin
  select ar.id, ar.user_id, ar.percentage, ar.verification_status, s.assessment_id, a.skill_id
    into r
  from public.assessment_reports ar
  join public.assessment_sessions s on s.id = ar.session_id
  join public.assessments a on a.id = s.assessment_id
  where ar.id = p_report_id;
  if not found or r.skill_id is null then
    return;
  end if;

  -- best verified report for this student + skill (may be this one or an older one)
  select ar.id, ar.percentage, s.assessment_id
    into best
  from public.assessment_reports ar
  join public.assessment_sessions s on s.id = ar.session_id
  join public.assessments a on a.id = s.assessment_id
  where ar.user_id = r.user_id and a.skill_id = r.skill_id
    and ar.verification_status in ('eligible', 'verified') and ar.percentage >= 75
  order by ar.percentage desc, ar.created_at asc
  limit 1;

  if found then
    insert into public.skill_certificates (code, user_id, skill_id, assessment_id, report_id, score)
    values (public.new_certificate_code(), r.user_id, r.skill_id, best.assessment_id, best.id, round(best.percentage, 2))
    on conflict (user_id, skill_id) do update
      set score = excluded.score,
          report_id = excluded.report_id,
          assessment_id = excluded.assessment_id,
          revoked_at = null,
          updated_at = now()
      where public.skill_certificates.score is distinct from excluded.score
         or public.skill_certificates.report_id is distinct from excluded.report_id
         or public.skill_certificates.revoked_at is not null;
  else
    update public.skill_certificates
       set revoked_at = now(), updated_at = now()
     where user_id = r.user_id and skill_id = r.skill_id and revoked_at is null;
  end if;
end;
$$;
revoke all on function public.sync_certificate_for_report(bigint) from public, anon, authenticated;

create or replace function public.assessment_reports_certificate_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_certificate_for_report(new.id);
  return new;
end;
$$;
revoke all on function public.assessment_reports_certificate_trigger() from public, anon, authenticated;

drop trigger if exists assessment_reports_certificate on public.assessment_reports;
create trigger assessment_reports_certificate
  after insert or update of verification_status, percentage on public.assessment_reports
  for each row execute function public.assessment_reports_certificate_trigger();

-- backfill already-verified skills
do $$
declare x record;
begin
  for x in select id from public.assessment_reports where verification_status in ('eligible', 'verified') and percentage >= 75 loop
    perform public.sync_certificate_for_report(x.id);
  end loop;
end $$;

-- ---------------------------------------------------------------- public profiles
create table if not exists public.public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug !~ '--'),
  is_public boolean not null default false,
  show_college boolean not null default true,
  show_scores boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.public_profiles enable row level security;
drop policy if exists "Students read own public profile" on public.public_profiles;
create policy "Students read own public profile" on public.public_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.slugify_name(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(trim(both '-' from regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g')), '');
$$;

-- Current settings for the signed-in student (or a suggested slug) + their certificates.
create or replace function public.get_my_public_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  pp public.public_profiles;
  base text;
  cand text;
  n int := 1;
  certs jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  select * into pp from public.public_profiles where user_id = v_uid;
  if not found then
    base := left(coalesce(public.slugify_name((select full_name from public.profiles where id = v_uid)), 'student'), 34);
    if length(base) < 3 then base := base || '-aldovra'; end if;
    cand := base;
    while exists (select 1 from public.public_profiles where slug = cand) loop
      n := n + 1; cand := base || '-' || n;
    end loop;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', c.code, 'skill', s.name, 'score', c.score, 'issued_at', c.issued_at,
           'assessment', a.title) order by c.score desc), '[]'::jsonb)
    into certs
  from public.skill_certificates c
  join public.skills s on s.id = c.skill_id
  left join public.assessments a on a.id = c.assessment_id
  where c.user_id = v_uid and c.revoked_at is null;
  return jsonb_build_object(
    'exists', pp.user_id is not null,
    'slug', coalesce(pp.slug, cand),
    'is_public', coalesce(pp.is_public, false),
    'show_college', coalesce(pp.show_college, true),
    'show_scores', coalesce(pp.show_scores, true),
    'certificates', certs);
end;
$$;

create or replace function public.save_public_profile(
  p_slug text, p_is_public boolean, p_show_college boolean default true, p_show_scores boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and coalesce(role, 'student') = 'student') then
    raise exception 'Only student accounts can have a public profile' using errcode = 'P0001';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' or v_slug ~ '--' then
    raise exception 'SLUG_INVALID' using errcode = 'P0001',
      hint = 'Use 3–40 letters, numbers or single hyphens.';
  end if;
  if v_slug in ('admin', 'aldovra', 'api', 'cert', 'certificate', 'dashboard', 'help', 'hr', 'jobs', 'login',
                'me', 'profile', 'recruiter', 'root', 'settings', 'signup', 'support', 'team', 'u', 'verify', 'www') then
    raise exception 'SLUG_TAKEN' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.public_profiles where slug = v_slug and user_id <> v_uid) then
    raise exception 'SLUG_TAKEN' using errcode = 'P0001';
  end if;
  insert into public.public_profiles (user_id, slug, is_public, show_college, show_scores)
  values (v_uid, v_slug, coalesce(p_is_public, false), coalesce(p_show_college, true), coalesce(p_show_scores, true))
  on conflict (user_id) do update
    set slug = excluded.slug, is_public = excluded.is_public, show_college = excluded.show_college,
        show_scores = excluded.show_scores, updated_at = now();
  return public.get_my_public_profile();
end;
$$;

-- Public read: only when the student switched the profile on. No email, phone or exam evidence.
create or replace function public.get_public_profile(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pp public.public_profiles;
  p public.profiles;
  certs jsonb;
  pts int;
  cnt int;
begin
  select * into pp from public.public_profiles where slug = lower(btrim(coalesce(p_slug, ''))) and is_public;
  if not found then
    return null;
  end if;
  select * into p from public.profiles where id = pp.user_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', c.code, 'skill', s.name, 'category', s.category,
           'score', case when pp.show_scores then c.score end, 'issued_at', c.issued_at)
           order by c.score desc), '[]'::jsonb),
         coalesce(sum(round(c.score * 10)), 0)::int, count(*)::int
    into certs, pts, cnt
  from public.skill_certificates c
  join public.skills s on s.id = c.skill_id
  where c.user_id = pp.user_id and c.revoked_at is null;
  return jsonb_build_object(
    'slug', pp.slug,
    'name', coalesce(nullif(btrim(p.full_name), ''), 'Aldovra Student'),
    'college', case when pp.show_college then nullif(btrim(p.college), '') end,
    'degree', case when pp.show_college then nullif(btrim(p.degree), '') end,
    'graduation_year', case when pp.show_college then p.graduation_year end,
    'career_track', nullif(btrim(p.career_track), ''),
    'city', nullif(btrim(p.city), ''),
    'bio', nullif(btrim(p.bio), ''),
    'linkedin_url', case when p.linkedin_url ~* '^https?://' then p.linkedin_url end,
    'github_url', case when p.github_url ~* '^https?://' then p.github_url end,
    'member_since', p.created_at,
    'verified_count', cnt,
    'points', pts,
    'tier', case when pts >= 4500 then 'Diamond' when pts >= 3000 then 'Platinum' when pts >= 1800 then 'Gold'
                 when pts >= 850 then 'Silver' else 'Bronze' end,
    'show_scores', pp.show_scores,
    'certificates', certs);
end;
$$;

-- Public certificate check (works even if the profile is private: that is what the credential link is for).
create or replace function public.verify_certificate(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.skill_certificates;
  pp public.public_profiles;
  holder text;
  skill text;
  title text;
begin
  select * into c from public.skill_certificates where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('found', false);
  end if;
  select * into pp from public.public_profiles where user_id = c.user_id;
  select coalesce(nullif(btrim(full_name), ''), 'Aldovra Student') into holder from public.profiles where id = c.user_id;
  select name into skill from public.skills where id = c.skill_id;
  select a.title into title from public.assessments a where a.id = c.assessment_id;
  return jsonb_build_object(
    'found', true,
    'valid', c.revoked_at is null,
    'code', c.code,
    'holder', holder,
    'skill', skill,
    'assessment', title,
    'score', case when coalesce(pp.show_scores, true) then c.score end,
    'issued_at', c.issued_at,
    'revoked_at', c.revoked_at,
    'profile_slug', case when pp.is_public then pp.slug end);
end;
$$;

revoke all on function public.get_my_public_profile() from public, anon;
revoke all on function public.save_public_profile(text, boolean, boolean, boolean) from public, anon;
grant execute on function public.get_my_public_profile() to authenticated;
grant execute on function public.save_public_profile(text, boolean, boolean, boolean) to authenticated;
revoke all on function public.get_public_profile(text) from public;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated;
grant execute on function public.verify_certificate(text) to anon, authenticated;
