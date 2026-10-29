-- Pin search_path on question_fingerprint (Supabase security advisor 0011).
alter function public.question_fingerprint(text) set search_path = pg_catalog, public;
