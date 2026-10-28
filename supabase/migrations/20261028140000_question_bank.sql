-- Question bank (28 Oct 2026)
-- Exams draw questions from a per-skill bank instead of calling Gemini at exam start.
--   * question_exposures remembers every question a student has been shown, so a reattempt
--     never repeats a question that student has already seen.
--   * Low-exposure questions are preferred; a question shown 400 times is retired automatically,
--     so leaked/shared questions age out.
--   * refill-question-bank (cron) keeps every skill topped up with Gemini-generated questions.
-- Only the service role (edge functions) touches these tables; admins can read them.

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  skill_id bigint not null references public.skills(id) on delete cascade,
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  category text not null default 'Technical',
  qhash text not null,
  status text not null default 'active' check (status in ('active', 'retired', 'flagged')),
  source text not null default 'gemini',
  times_served integer not null default 0,
  times_correct integer not null default 0,
  created_at timestamptz not null default now(),
  last_served_at timestamptz,
  unique (skill_id, qhash)
);
create index if not exists question_bank_pick_idx on public.question_bank (skill_id, status, difficulty, times_served);

create table if not exists public.question_exposures (
  user_id uuid not null,
  question_id uuid not null references public.question_bank(id) on delete cascade,
  skill_id bigint not null,
  session_id uuid,
  served_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index if not exists question_exposures_user_skill_idx on public.question_exposures (user_id, skill_id);

alter table public.question_bank enable row level security;
alter table public.question_exposures enable row level security;

drop policy if exists "Admins read question bank" on public.question_bank;
create policy "Admins read question bank" on public.question_bank for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
drop policy if exists "Admins update question bank" on public.question_bank;
create policy "Admins update question bank" on public.question_bank for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

-- Normalised fingerprint of a question's text (used for de-duplication).
create or replace function public.question_fingerprint(p_text text)
returns text language sql immutable as $$
  select md5(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '', 'g'));
$$;

-- Add questions (jsonb array of {question, options[4], correct_index, difficulty, category}).
-- Invalid or duplicate questions are skipped. Returns the ids of the rows for the given questions
-- (new or already existing), in input order, as {"inserted": n, "ids": [...]}.
create or replace function public.bank_add_questions(p_skill bigint, p_questions jsonb, p_source text default 'gemini')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q jsonb;
  v_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_inserted int := 0;
  v_hash text;
begin
  for q in select * from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) loop
    if coalesce(trim(q->>'question'), '') = ''
       or jsonb_typeof(q->'options') <> 'array' or jsonb_array_length(q->'options') <> 4
       or (q->>'correct_index') !~ '^[0-3]$'
       or lower(coalesce(q->>'difficulty', '')) not in ('easy', 'medium', 'hard') then
      v_ids := v_ids || 'null'::jsonb;
      continue;
    end if;
    v_hash := question_fingerprint(q->>'question');
    insert into question_bank (skill_id, question, options, correct_index, difficulty, category, qhash, source)
    values (p_skill, trim(q->>'question'), q->'options', (q->>'correct_index')::smallint,
            lower(q->>'difficulty'), coalesce(nullif(trim(q->>'category'), ''), 'Technical'), v_hash, coalesce(p_source, 'gemini'))
    on conflict (skill_id, qhash) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from question_bank where skill_id = p_skill and qhash = v_hash;
    else
      v_inserted := v_inserted + 1;
    end if;
    v_ids := v_ids || to_jsonb(v_id::text);
    v_id := null;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'ids', v_ids);
end;
$$;

-- Record that a student has seen these questions (used when Gemini fallback questions are served).
create or replace function public.bank_record_exposures(p_user uuid, p_skill bigint, p_ids uuid[], p_session uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into question_exposures (user_id, question_id, skill_id, session_id)
  select p_user, x, p_skill, p_session from unnest(p_ids) x
  where x is not null
  on conflict do nothing;
  update question_bank set times_served = times_served + 1, last_served_at = now()
   where id = any(p_ids);
$$;

-- Pick a fresh set for one student: never a question this student has seen, preferring
-- rarely-served questions, honouring the easy/medium/hard mix (topped up from other levels
-- if one level runs short). Returns {"ok": false, "available": n} when the bank cannot cover it.
create or replace function public.pick_assessment_questions(
  p_user uuid, p_skill bigint, p_easy int, p_medium int, p_hard int, p_session uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need int := greatest(0, p_easy) + greatest(0, p_medium) + greatest(0, p_hard);
  v_ids uuid[];
  v_available int;
  v_result jsonb;
begin
  select count(*) into v_available
  from question_bank q
  where q.skill_id = p_skill and q.status = 'active'
    and not exists (select 1 from question_exposures e where e.user_id = p_user and e.question_id = q.id);

  if v_available < v_need then
    return jsonb_build_object('ok', false, 'available', v_available, 'needed', v_need);
  end if;

  with pool as (
    select q.id, q.difficulty, q.times_served,
           row_number() over (partition by q.difficulty order by q.times_served + random() * 8) as rn
    from question_bank q
    where q.skill_id = p_skill and q.status = 'active'
      and not exists (select 1 from question_exposures e where e.user_id = p_user and e.question_id = q.id)
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
    order by times_served + random() * 8
    limit greatest(0, v_need - (select count(*) from primary_pick))
  )
  select array_agg(id) into v_ids from (select id from primary_pick union all select id from topup) s;

  perform bank_record_exposures(p_user, p_skill, v_ids, p_session);

  -- Questions seen by many students age out; refill-question-bank replaces them.
  update question_bank set status = 'retired' where id = any(v_ids) and times_served >= 400;

  select jsonb_agg(jsonb_build_object(
           'id', q.id, 'question', q.question, 'options', q.options, 'correct_index', q.correct_index,
           'difficulty', q.difficulty, 'category', q.category))
    into v_result
  from question_bank q where q.id = any(v_ids);

  return jsonb_build_object('ok', true, 'questions', coalesce(v_result, '[]'::jsonb));
end;
$$;

-- Per-skill inventory for the refill job and the admin page.
create or replace function public.question_bank_stats()
returns table(skill_id bigint, skill_name text, active int, easy int, medium int, hard int, retired int, recent_requests int)
language sql
security definer
set search_path = public
as $$
  select s.id, s.name,
         count(q.*) filter (where q.status = 'active')::int,
         count(q.*) filter (where q.status = 'active' and q.difficulty = 'easy')::int,
         count(q.*) filter (where q.status = 'active' and q.difficulty = 'medium')::int,
         count(q.*) filter (where q.status = 'active' and q.difficulty = 'hard')::int,
         count(q.*) filter (where q.status = 'retired')::int,
         (select count(*) from assessment_requests r join assessments a on a.id = r.assessment_id
           where a.skill_id = s.id and r.created_at > now() - interval '30 days')::int
  from skills s
  join assessments a2 on a2.skill_id = s.id and a2.is_active
  left join question_bank q on q.skill_id = s.id
  group by s.id, s.name;
$$;

revoke all on function public.bank_add_questions(bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public.bank_record_exposures(uuid, bigint, uuid[], uuid) from public, anon, authenticated;
revoke all on function public.pick_assessment_questions(uuid, bigint, int, int, int, uuid) from public, anon, authenticated;
revoke all on function public.question_bank_stats() from public, anon, authenticated;
grant execute on function public.bank_add_questions(bigint, jsonb, text) to service_role;
grant execute on function public.bank_record_exposures(uuid, bigint, uuid[], uuid) to service_role;
grant execute on function public.pick_assessment_questions(uuid, bigint, int, int, int, uuid) to service_role;
grant execute on function public.question_bank_stats() to service_role;

-- Seed: questions already shown in past exams go into the bank and count as seen by those students.
do $$
declare r record; v jsonb;
begin
  for r in
    select s.id as session_id, s.user_id, a.skill_id, s.question_payload
    from assessment_sessions s join assessments a on a.id = s.assessment_id
    where jsonb_typeof(s.question_payload) = 'array'
  loop
    v := bank_add_questions(r.skill_id, r.question_payload, 'past_exam');
    insert into question_exposures (user_id, question_id, skill_id, session_id)
    select r.user_id, (x #>> '{}')::uuid, r.skill_id, r.session_id
    from jsonb_array_elements(v->'ids') x
    where x <> 'null'::jsonb
    on conflict do nothing;
  end loop;
end $$;

-- Refill every 5 minutes (one skill, ~40 questions per run; idle once every skill has 300 active).
select cron.schedule('aldovra-question-bank-refill', '2-59/5 * * * *', $c$
  select net.http_post(
    url := 'https://lgefwfrjzweayfxahogs.supabase.co/functions/v1/refill-question-bank',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aldovra_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$c$);
