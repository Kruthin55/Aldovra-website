-- One resume upload per student per 24 hours (was 5), and PDF only (AI analysis reads PDFs).
create or replace function public.limit_resume_uploads_per_day()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (select 1 from student_resumes
             where user_id = new.user_id and uploaded_at > now() - interval '24 hours') then
    raise exception 'You can upload one resume every 24 hours. Please try again tomorrow.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

update storage.buckets set allowed_mime_types = array['application/pdf'] where id = 'student-resumes';
