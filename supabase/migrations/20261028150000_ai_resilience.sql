-- AI resilience (28 Oct 2026): keep exams and resume analysis working when Gemini is down or rate-limited.

-- 1) Question bank: a reused question moves to the back of the "seen" queue.
create or replace function public.bank_record_exposures(p_user uuid, p_skill bigint, p_ids uuid[], p_session uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into question_exposures (user_id, question_id, skill_id, session_id)
  select p_user, x, p_skill, p_session from unnest(p_ids) x
  where x is not null
  on conflict (user_id, question_id) do update set served_at = now(), session_id = excluded.session_id;
  update question_bank set times_served = times_served + 1, last_served_at = now()
   where id = any(p_ids);
$$;

-- 2) Picking with an optional last-resort reuse: unseen questions first, then the questions this
--    student saw longest ago (options are reshuffled per exam). Used only if Gemini cannot help.
drop function if exists public.pick_assessment_questions(uuid, bigint, int, int, int, uuid);
create or replace function public.pick_assessment_questions(
  p_user uuid, p_skill bigint, p_easy int, p_medium int, p_hard int,
  p_session uuid default null, p_allow_reuse boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need int := greatest(0, p_easy) + greatest(0, p_medium) + greatest(0, p_hard);
  v_ids uuid[];
  v_unseen int;
  v_total int;
  v_result jsonb;
begin
  select count(*) filter (where e.question_id is null), count(*)
    into v_unseen, v_total
  from question_bank q
  left join question_exposures e on e.user_id = p_user and e.question_id = q.id
  where q.skill_id = p_skill and q.status = 'active';

  if v_unseen < v_need and (not p_allow_reuse or v_total < v_need) then
    return jsonb_build_object('ok', false, 'available', v_unseen, 'total', v_total, 'needed', v_need);
  end if;

  with pool as (
    select q.id, q.difficulty, q.times_served, e.served_at as seen_at,
           row_number() over (
             partition by q.difficulty
             order by (e.question_id is not null), e.served_at nulls first, q.times_served + random() * 8
           ) as rn
    from question_bank q
    left join question_exposures e on e.user_id = p_user and e.question_id = q.id
    where q.skill_id = p_skill and q.status = 'active'
      and (p_allow_reuse or e.question_id is null)
  ),
  primary_pick as (
    select id from pool
    where (difficulty = 'easy' and rn <= p_easy)
       or (difficulty = 'medium' and rn <= p_medium)
       or (difficulty = 'hard' and rn <= p_hard)
  ),
  topup as (
    select id from pool
    where id not in (select id from primary_pick)
    order by (seen_at is not null), seen_at nulls first, times_served + random() * 8
    limit greatest(0, v_need - (select count(*) from primary_pick))
  )
  select array_agg(id) into v_ids from (select id from primary_pick union all select id from topup) s;

  perform bank_record_exposures(p_user, p_skill, v_ids, p_session);
  update question_bank set status = 'retired' where id = any(v_ids) and times_served >= 400;

  select jsonb_agg(jsonb_build_object(
           'id', q.id, 'question', q.question, 'options', q.options, 'correct_index', q.correct_index,
           'difficulty', q.difficulty, 'category', q.category))
    into v_result
  from question_bank q where q.id = any(v_ids);

  return jsonb_build_object('ok', true, 'reused', v_unseen < v_need, 'questions', coalesce(v_result, '[]'::jsonb));
end;
$$;
revoke all on function public.pick_assessment_questions(uuid, bigint, int, int, int, uuid, boolean) from public, anon, authenticated;
grant execute on function public.pick_assessment_questions(uuid, bigint, int, int, int, uuid, boolean) to service_role;

-- 3) Resume analysis retries: keyword-fallback or failed analyses get the full AI pass later.
alter table public.student_resumes add column if not exists ai_retry_count integer not null default 0;

create or replace function public.queue_resume_ai_retries(p_limit integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; n int := 0;
begin
  for r in
    select s.id from (
      select distinct on (user_id) id, user_id, status, parsed_data, ai_retry_count, uploaded_at, file_name
      from student_resumes
      where coalesce(status, '') <> 'deleted'
      order by user_id, uploaded_at desc nulls last
    ) s
    where s.ai_retry_count < 6
      and lower(coalesce(s.file_name, '')) like '%.pdf'
      and s.uploaded_at > now() - interval '7 days'
      and (
        (s.status = 'analyzed' and coalesce(s.parsed_data->>'needs_ai_retry', 'false') = 'true')
        or s.status = 'analysis_failed'
        or (s.status = 'analyzing' and s.uploaded_at < now() - interval '15 minutes')
      )
    order by s.uploaded_at desc
    limit greatest(1, least(p_limit, 10))
  loop
    update student_resumes set ai_retry_count = ai_retry_count + 1 where id = r.id;
    perform net.http_post(
      url := 'https://lgefwfrjzweayfxahogs.supabase.co/functions/v1/analyze-resume',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aldovra_cron_secret')),
      body := jsonb_build_object('resume_id', r.id, 'retry', true),
      timeout_milliseconds := 120000);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.queue_resume_ai_retries(integer) from public, anon, authenticated;

select cron.schedule('aldovra-resume-ai-retry', '17,47 * * * *', $c$ select public.queue_resume_ai_retries(3); $c$);
