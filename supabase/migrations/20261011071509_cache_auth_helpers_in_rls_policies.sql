-- Cache auth helper calls in RLS predicates to avoid per-row re-evaluation.
-- Policy names, commands, roles, and access logic remain unchanged.
do $$
declare p record; v_qual text; v_check text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check
    from pg_policies where schemaname='public'
      and (coalesce(qual,'') ~* 'auth.(uid|role|jwt)[[:space:]]*\('
        or coalesce(with_check,'') ~* 'auth.(uid|role|jwt)[[:space:]]*\(')
  loop
    v_qual := p.qual; v_check := p.with_check;
    if v_qual is not null then
      v_qual := regexp_replace(v_qual, 'auth.(uid|role|jwt)[[:space:]]*\(\)', '(select auth.\1())', 'gi');
      if v_qual is distinct from p.qual then execute format('alter policy %I on %I.%I using (%s)',p.policyname,p.schemaname,p.tablename,v_qual); end if;
    end if;
    if v_check is not null then
      v_check := regexp_replace(v_check, 'auth.(uid|role|jwt)[[:space:]]*\(\)', '(select auth.\1())', 'gi');
      if v_check is distinct from p.with_check then execute format('alter policy %I on %I.%I with check (%s)',p.policyname,p.schemaname,p.tablename,v_check); end if;
    end if;
  end loop;
end;
$$;
