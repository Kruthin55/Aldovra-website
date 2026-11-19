-- Jooble quality guard (19 Nov 2026). The first Jooble runs brought 24 ads from one small Indore firm
-- ("Summer internship offer !!!!", "HR Student Internship training program", "Junior PHP Developer - 0 - 0 years").
-- Aggregator rows: at most 3 active jobs per company, and no ads that look like paid training / fee-based internships.
create or replace function public.jooble_quality_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source_provider = 'jooble' and new.active then
    if coalesce(new.title, '') ~* '(training program|training programme|paid intern|course|certification program|workshop)'
       or coalesce(new.description, '') ~* '(registration fee|training fee|course fee|refundable deposit|security deposit|pay (a|the) fee|fees? (is|are) applicable)' then
      new.active := false;
    elsif (select count(*) from public.opportunities o
            where o.source_provider = 'jooble' and o.active and o.id <> new.id
              and lower(o.company_name) = lower(new.company_name)) >= 3 then
      new.active := false;
    end if;
  end if;
  return new;
end $$;

create or replace trigger opportunities_jooble_quality_guard
  before insert or update of active, title, description on public.opportunities
  for each row execute function public.jooble_quality_guard();

-- One-off clean-up of rows already imported: fee/training ads off, then keep the 3 newest per company.
update public.opportunities set active = false
 where source_provider = 'jooble' and active
   and (coalesce(title, '') ~* '(training program|training programme|paid intern|course|certification program|workshop)'
        or coalesce(description, '') ~* '(registration fee|training fee|course fee|refundable deposit|security deposit|pay (a|the) fee|fees? (is|are) applicable)');
update public.opportunities o set active = false
  from (select id, row_number() over (partition by lower(company_name) order by coalesce(posting_date, created_at::date) desc, created_at desc) rn
          from public.opportunities where source_provider = 'jooble' and active) r
 where o.id = r.id and r.rn > 3;
