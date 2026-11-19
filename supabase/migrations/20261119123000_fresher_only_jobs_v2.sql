-- 19 Nov 2026 (same day): v2 of job_required_min_years: narrower 'company history' guard ("What we're looking for" had hidden a 3-5 year job), plus plus/range and 'minimum N years' phrases without the word experience. Recompute the stored fresher_ok.
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
  -- ("expert" is not a seniority word here: "Expert Talent Pool, Annotation Associate" are entry roles)
  select not (lower(regexp_replace(coalesce(p_title,''), '[_|/]+', ' ', 'g'))
               ~ '\m(senior|sr|lead|principal|staff|manager|director|head|architect|experienced|vp|avp)\M')
     and coalesce(public.job_required_min_years(p_title, p_desc), 0) < 1;
$f$;

update public.opportunities set title = title;
