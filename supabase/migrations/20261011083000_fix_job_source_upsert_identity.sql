drop index if exists public.opportunities_source_identity_unique;
alter table public.opportunities add constraint opportunities_source_identity_unique unique (source_provider, source_external_id);
