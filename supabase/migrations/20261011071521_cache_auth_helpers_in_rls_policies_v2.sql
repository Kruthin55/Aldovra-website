-- Normalize policy predicates to scalar-subquery auth helpers. This is idempotent and preserves policy semantics.
do $$
declare p record; v_qual text; v_check text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check
    from pg_policies where schemaname='public'
      and (coalesce(qual,'') like '%auth.uid()%' or coalesce(qual,'') like '%auth.role()%' or coalesce(qual,'') like '%auth.jwt()%'
        or coalesce(with_check,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.role()%' or coalesce(with_check,'') like '%auth.jwt()%')
  loop
    v_qual := p.qual; v_check := p.with_check;
    if v_qual is not null then
      v_qual := replace(replace(replace(v_qual,'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())'),'auth.jwt()','(select auth.jwt())');
      if v_qual is distinct from p.qual then execute format('alter policy %I on %I.%I using (%s)',p.policyname,p.schemaname,p.tablename,v_qual); end if;
    end if;
    if v_check is not null then
      v_check := replace(replace(replace(v_check,'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())'),'auth.jwt()','(select auth.jwt())');
      if v_check is distinct from p.with_check then execute format('alter policy %I on %I.%I with check (%s)',p.policyname,p.schemaname,p.tablename,v_check); end if;
    end if;
  end loop;
end;
$$;
