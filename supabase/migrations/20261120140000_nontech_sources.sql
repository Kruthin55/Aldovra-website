-- Non-technical IT roles (20 Nov 2026, founder: content moderation, mapping, data annotation, process/support roles).
-- Sutherland (SmartRecruiters, ~50 India postings incl. customer support, trust & safety, campus associates).
-- Follow-up (not deployed yet): let sync-job-sources treat content moderator / annotator / mapping / GIS / process associate / data entry
-- titles as entry-level (NONTECH_EARLY_TITLE), also on the Wipro/HCLTech/Capgemini/EY/Firstsource sitemap boards.
insert into public.job_sources (provider, board_token, company_name, enabled)
select 'smartrecruiters', 'Sutherland', 'Sutherland', true
where not exists (select 1 from public.job_sources where provider = 'smartrecruiters' and board_token = 'Sutherland');
