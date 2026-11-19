-- 19 Nov 2026: founder found a "Fresher / entry level" PhonePe iOS job asking "4-7 years of relevant full time experience".
-- The dashboard regex only allowed one word between "years of" and "experience", and public pages filtered on the
-- shortened description_feed. Now Postgres decides on the FULL description, once, for every surface.
create or replace function public.job_required_min_years(p_title text, p_desc text)
returns integer language plpgsql immutable parallel safe set search_path = '' as $f$
-- Smallest "years of experience" a job asks for (null = none found). 19 Nov 2026.
-- "4-7 years of relevant full time experience" -> 4; "0-1 year experience" -> null; "experience of 8 years" -> 8.
declare
  d text; m text[]; before text; best int := null; n int; pos int;
begin
  d := lower(coalesce(p_title,'') || ' . ' || coalesce(p_desc,''));
  d := regexp_replace(d, '<[^>]*>', ' ', 'g');
  d := regexp_replace(d, '&#xa0;|&nbsp;|&#160;|' || chr(160), ' ', 'g');
  d := regexp_replace(d, '&[a-z]+;|&#[0-9a-fx]+;', ' ', 'g');
  d := regexp_replace(d, 'years?\s*\(\s*s\s*\)', 'years', 'g');
  d := regexp_replace(d, '[’‘`]', '''', 'g');
  d := regexp_replace(d, '\s+', ' ', 'g');
  for m in select regexp_matches(d, '(\m(\d{1,2})\s*\+?\s*(?:(?:-|–|—|to)\s*(\d{1,2})\s*)?\+?\s*(?:years?|yrs?)\M)([^.;\n]{0,70})', 'g') loop
    if m[4] !~ '\m(experience|exp|experienced)\M' then continue; end if;
    if m[4] ~ '^\W{0,3}(degree|bachelor|undergrad|full[- ]time degree|course|program|diploma|of (study|college|university|education|schooling))' then continue; end if;
    n := m[2]::int;
    if n < 1 or n > 30 then continue; end if;
    pos := strpos(d, m[1] || m[4]);
    before := case when pos > 1 then substr(d, greatest(1, pos - 45), least(pos - 1, 45)) else '' end;
    if before ~ '(\mwe have|\mwe''ve|\mwe bring|our (company|firm|organi[sz]ation|history)|company (has|with|of)|legacy of|history of|over the (last|past)|for over|founded)[^.]{0,30}$' then continue; end if;
    if before ~ '\d\s*(-|–|—|to)\s*$' then continue; end if;            -- tail of "0-1 year" read from the 1
    if n = 1 and m[3] is null and before ~ 'fresher' then continue; end if;   -- "fresher or 1 year experience"
    best := greatest(coalesce(best, 0), n);
  end loop;
  for m in select regexp_matches(d, '\m(?:experience|exp)\M[^.;\n0-9]{0,30}(\d{1,2})\s*\+?\s*(?:(?:-|–|—|to)\s*(\d{1,2})\s*)?\+?\s*(?:years?|yrs?)\M', 'g') loop
    n := m[1]::int;
    if n >= 1 and n <= 30 then best := greatest(coalesce(best, 0), n); end if;
  end loop;
  -- "5-8 years development", "2-5 years in an Apps Development role", "Minimum 4 to 8 years of background", "B.Tech 6-9 Years"
  for m in select regexp_matches(d, '(\m(\d{1,2})\s*(\+|(?:-|–|—|to)\s*\d{1,2})\s*\+?\s*(?:years?|yrs?)\M)([^.;\n]{0,40})', 'g') loop
    n := m[2]::int;
    if n < 1 or n > 30 then continue; end if;
    if m[4] ~ '^\W{0,3}(old|of age|age\M|and above|warranty|guarantee|degree|bachelor|course|program|diploma|of (study|college|university|education|schooling))' then continue; end if;
    pos := strpos(d, m[1] || m[4]);
    before := case when pos > 1 then substr(d, greatest(1, pos - 45), least(pos - 1, 45)) else '' end;
    if before ~ '\d\s*(-|–|—|to)\s*$' then continue; end if;
    if before ~ '(\mwe have|\mwe''ve|\mwe bring|our (company|firm|organi[sz]ation|history)|company (has|with|of)|legacy of|history of|over the (last|past)|for over|founded|aged?|age group|children|kids)[^.]{0,30}$' then continue; end if;
    best := greatest(coalesce(best, 0), n);
  end loop;
  for m in select regexp_matches(d, '\m(?:minimum|min\.?|at least|atleast)\s*(?:of\s*)?(\d{1,2})\s*\+?\s*(?:years?|yrs?)\M', 'g') loop
    n := m[1]::int;
    if n >= 1 and n <= 30 then best := greatest(coalesce(best, 0), n); end if;
  end loop;
  return best;
end $f$;

create or replace function public.job_fresher_ok(p_title text, p_desc text)
returns boolean language sql immutable parallel safe set search_path = '' as $f$
  -- false for senior titles or any job asking for 1+ years (except "fresher or 1 year"). 19 Nov 2026.
  select not (lower(regexp_replace(coalesce(p_title,''), '[_|/]+', ' ', 'g'))
               ~ '\m(senior|sr|lead|principal|staff|manager|director|head|architect|experienced|vp|avp|expert)\M')
     and coalesce(public.job_required_min_years(p_title, p_desc), 0) < 1;
$f$;

-- Stored per job, recomputed by Postgres whenever title/description change.
alter table public.opportunities
  add column if not exists fresher_ok boolean generated always as (public.job_fresher_ok(title, description)) stored;

-- Students (dashboard, public /jobs pages, Google Jobs) only ever see jobs that pass fresher_ok.
create or replace view public.student_active_opportunities as
 SELECT id, title, company_name, location, work_mode, employment_type, description, experience_level, salary_text,
    application_url, active, created_at, source_provider, source_external_id, source_url, source_last_seen_at,
    source_board_token, application_checked_at, application_check_status, application_check_failures, posting_date,
    expires_at, first_seen_at, COALESCE(description_feed, description) AS description_feed
   FROM public.opportunities o
  WHERE active = true
    AND o.fresher_ok
    AND (lower(COALESCE(application_check_status, ''::text)) <> ALL (ARRAY['suspect_http_404'::text, 'dead'::text, 'closed'::text, 'expired'::text, 'broken'::text, 'failed'::text, 'blocked_or_auth_required_403'::text]))
    AND (expires_at IS NULL OR expires_at > now())
    AND (posting_date IS NULL OR posting_date <= (now() AT TIME ZONE 'Asia/Kolkata'::text)::date)
    AND COALESCE(posting_date, (created_at AT TIME ZONE 'Asia/Kolkata'::text)::date) >= ((now() AT TIME ZONE 'Asia/Kolkata'::text)::date - 29);
alter view public.student_active_opportunities set (security_invoker = true);
