-- Clearer notifications (5 Nov 2026): resume analysis tells the student their tests are ready,
-- and every new student gets a welcome notification pointing at the next step.
create or replace function public.notify_resume_analysis()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'analyzed' and coalesce(old.status, '') <> 'analyzed' and new.user_id is not null then
    insert into public.notifications (user_id, title, message, type)
    values (new.user_id, 'Your skill tests are ready',
            'We read your resume and set up free tests for the skills we found. Open your dashboard to start your first one.',
            'resume');
  end if;
  return new;
end;
$function$;

create or replace function public.notify_welcome_student()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.role, 'student') = 'student' then
    insert into public.notifications (user_id, title, message, type)
    values (new.id, 'Welcome to Aldovra',
            'Upload your resume (PDF) to unlock free skill tests and see fresher jobs matched to you.',
            'welcome');
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_welcome_notification on public.profiles;
create trigger profiles_welcome_notification
  after insert on public.profiles
  for each row execute function public.notify_welcome_student();
