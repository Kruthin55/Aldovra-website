-- Fix (28 Oct 2026): a certificate needs the admin's approval, not just an 'eligible' report.
-- Old exam logic marked any 75%+ report 'eligible' at submit time, before any environment video existed,
-- so 'eligible' alone is not proof. Admin approval is stored by review-environment-video-link in
-- assessment_request_details.verification_status = 'verified' (it updates the report first, then details).

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
  select ar.id, ar.user_id, a.skill_id
    into r
  from public.assessment_reports ar
  join public.assessment_sessions s on s.id = ar.session_id
  join public.assessments a on a.id = s.assessment_id
  where ar.id = p_report_id;
  if not found or r.skill_id is null then
    return;
  end if;

  -- best report for this student + skill that passed AND whose environment video the admin approved
  select ar.id, ar.percentage, s.assessment_id
    into best
  from public.assessment_reports ar
  join public.assessment_sessions s on s.id = ar.session_id
  join public.assessments a on a.id = s.assessment_id
  join public.assessment_evidence ev
    on ev.session_id = ar.session_id and ev.user_id = ar.user_id
   and nullif(btrim(ev.environment_video_url), '') is not null
  join public.assessment_request_details d
    on d.request_id::text = s.request_id::text and d.verification_status = 'verified'
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

-- admin approval (or withdrawal) on the request -> re-check every report of that request
create or replace function public.request_details_certificate_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare x record;
begin
  for x in
    select ar.id from public.assessment_reports ar
    join public.assessment_sessions s on s.id = ar.session_id
    where s.request_id::text = new.request_id::text
  loop
    perform public.sync_certificate_for_report(x.id);
  end loop;
  return new;
end;
$$;
revoke all on function public.request_details_certificate_trigger() from public, anon, authenticated;

drop trigger if exists request_details_certificate on public.assessment_request_details;
create trigger request_details_certificate
  after insert or update of verification_status on public.assessment_request_details
  for each row execute function public.request_details_certificate_trigger();

-- remove certificates created by the first version that never had an admin approval
delete from public.skill_certificates c
where not exists (
  select 1
  from public.assessment_reports ar
  join public.assessment_sessions s on s.id = ar.session_id
  join public.assessments a on a.id = s.assessment_id
  join public.assessment_evidence ev
    on ev.session_id = ar.session_id and ev.user_id = ar.user_id
   and nullif(btrim(ev.environment_video_url), '') is not null
  join public.assessment_request_details d
    on d.request_id::text = s.request_id::text and d.verification_status = 'verified'
  where ar.user_id = c.user_id and a.skill_id = c.skill_id
    and ar.verification_status in ('eligible', 'verified') and ar.percentage >= 75
);
