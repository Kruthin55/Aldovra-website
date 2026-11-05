-- Warm-up practice (5 Nov 2026): 3 easy questions from the bank for a skill the student has an assessment for.
-- Served questions are recorded in question_exposures (session_id null), so they never appear in that student's real test.
-- Limit: 3 practice questions per skill per 24 hours.
create or replace function public.get_practice_questions(p_skill_id bigint)
returns table (id uuid, question text, options jsonb, correct_index smallint)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_recent int;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.assessment_requests r
    join public.assessments a on a.id = r.assessment_id
    where r.user_id = v_uid and a.skill_id = p_skill_id
      and r.status in ('approved', 'pending', 'payment_pending', 'completed')
  ) then
    raise exception 'No assessment for this skill' using errcode = 'P0001';
  end if;
  select count(*) into v_recent from public.question_exposures e
   where e.user_id = v_uid and e.skill_id = p_skill_id and e.session_id is null
     and e.served_at > now() - interval '24 hours';
  if v_recent >= 3 then
    raise exception 'PRACTICE_LIMIT' using errcode = 'P0001';
  end if;

  return query
  with pick as (
    select q.id, q.question, q.options, q.correct_index
    from public.question_bank q
    where q.skill_id = p_skill_id and q.status = 'active'
      and coalesce(q.difficulty, 'easy') = 'easy'
      and not exists (select 1 from public.question_exposures e where e.user_id = v_uid and e.question_id = q.id)
    order by random()
    limit 3
  ), ins as (
    insert into public.question_exposures (user_id, question_id, skill_id, session_id, served_at)
    select v_uid, p.id, p_skill_id, null, now() from pick p
    on conflict do nothing
    returning question_id
  )
  select p.id, p.question, p.options, p.correct_index from pick p;
end;
$$;
revoke all on function public.get_practice_questions(bigint) from public, anon;
grant execute on function public.get_practice_questions(bigint) to authenticated;
