-- Fresher-only gate v3 (19 Nov 2026, founder saw a job asking "at least 4+2 years").
-- New phrasings read by job_required_min_years():
--   "minimum 8-year experience"  (hyphen between number and year)
--   "4+2 years" / "4 + 2 yrs"    (read as the first number, 4+)
--   "> 6yrs", "&gt;= 3 years"    (greater-than sign before the number)
-- Also: one-off closure of Workday postings whose CXS API answers 403 errorCode S22
-- ("permission denied" = posting taken down). check-job-links treated that as unknown,
-- so 167 dead Workday jobs stayed live. The checker now maps S22 to closed.

create or replace function public.job_required_min_years(p_title text, p_desc text)
returns integer language plpgsql immutable parallel safe set search_path = '' as $function$
-- Smallest "years of experience" a job asks for (null = none found). 19 Nov 2026 (v3).
declare
  d text; m text[]; before text; best int := null; n int; pos int;
begin
  d := lower(coalesce(p_title,'') || ' . ' || coalesce(p_desc,''));
  d := regexp_replace(d, '<[^>]*>', ' ', 'g');
  d := regexp_replace(d, '&#xa0;|&nbsp;|&#160;|' || chr(160), ' ', 'g');
  d := regexp_replace(d, '&gt;|&#62;', '>', 'g');
  d := regexp_replace(d, '&[a-z]+;|&#[0-9a-fx]+;', ' ', 'g');
  d := regexp_replace(d, 'years?\s*\(\s*s\s*\)', 'years', 'g');
  d := regexp_replace(d, '[’‘`]', '''', 'g');
  d := regexp_replace(d, '\s+', ' ', 'g');
  d := regexp_replace(d, '(\d)\s*-\s*(years?|yrs?)\M', '\1 \2', 'g');                  -- "8-year experience"
  d := regexp_replace(d, '\m(\d{1,2})\s*\+\s*\d{1,2}\s*(years?|yrs?)\M', '\1+ \2', 'g');  -- "4+2 years"
  for m in select regexp_matches(d, '(\m(\d{1,2})\s*\+?\s*(?:(?:-|–|—|to)\s*(\d{1,2})\s*)?\+?\s*(?:years?|yrs?)\M)([^.;\n]{0,70})', 'g') loop
    if m[4] !~ '\m(experience|exp|experienced)\M' then continue; end if;
    if m[4] ~ '^\W{0,3}(degree|bachelor|undergrad|full[- ]time degree|course|program|diploma|of (study|college|university|education|schooling))' then continue; end if;
    n := m[2]::int;
    if n < 1 or n > 30 then continue; end if;
    pos := strpos(d, m[1] || m[4]);
    before := case when pos > 1 then substr(d, greatest(1, pos - 45), least(pos - 1, 45)) else '' end;
    if before ~ '(\mwe have|\mwe''ve|\mwe bring|our (company|firm|organi[sz]ation|history)|company (has|with|of)|legacy of|history of|over the (last|past)|for over|founded)[^.]{0,30}$' then continue; end if;
    if before ~ '\d\s*(-|–|—|to)\s*$' then continue; end if;
    if n = 1 and m[3] is null and before ~ 'fresher' then continue; end if;
    best := greatest(coalesce(best, 0), n);
  end loop;
  for m in select regexp_matches(d, '\m(?:experience|exp)\M[^.;\n0-9]{0,30}(\d{1,2})\s*\+?\s*(?:(?:-|–|—|to)\s*(\d{1,2})\s*)?\+?\s*(?:years?|yrs?)\M', 'g') loop
    n := m[1]::int;
    if n >= 1 and n <= 30 then best := greatest(coalesce(best, 0), n); end if;
  end loop;
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
  for m in select regexp_matches(d, '(?:\m(?:minimum|min\.?|at least|atleast)|>\s*=?)\s*(?:of\s*)?(\d{1,2})\s*\+?\s*(?:years?|yrs?)\M', 'g') loop
    n := m[1]::int;
    if n >= 1 and n <= 30 then best := greatest(coalesce(best, 0), n); end if;
  end loop;
  return best;
end $function$;

-- Stored generated column fresher_ok only recomputes on update.
update public.opportunities set title = title;

-- One-off (already run live on 19 Nov 2026 from a pg_net probe of all live Workday jobs):
-- 166 postings answered 403 S22 and 1 answered 404; they were set active=false,
-- application_check_status='closed'. The 3 curated_ai jobs from 24 Oct (never re-seen) were closed too.
update public.opportunities set active = false, application_check_status = 'closed', application_checked_at = now()
 where source_provider = 'curated_ai' and active and coalesce(source_last_seen_at, created_at) < now() - interval '20 days';
