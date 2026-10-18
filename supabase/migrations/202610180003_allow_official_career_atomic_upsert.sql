-- The official_careers adapter only imports public jobs from the fixed allowlist
-- of official employer career pages; allow it through the atomic upsert guard.
do $migration$
declare
  definition text;
  old_guard text := 'if v_provider not in (''greenhouse'', ''lever'', ''ashby'', ''jobicy'', ''smartrecruiters'') then raise exception ''Unsupported job provider''; end if;';
  new_guard text := 'if v_provider not in (''greenhouse'', ''lever'', ''ashby'', ''jobicy'', ''smartrecruiters'', ''official_careers'') then raise exception ''Unsupported job provider''; end if;';
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'upsert_job_opportunity_atomic';

  if definition is null then
    raise exception 'upsert_job_opportunity_atomic not found';
  end if;

  if position(old_guard in definition) = 0 then
    if position('official_careers' in definition) > 0 then
      return;
    end if;
    raise exception 'Could not find current provider guard in atomic upsert function';
  end if;

  execute replace(definition, old_guard, new_guard);
end
$migration$;
