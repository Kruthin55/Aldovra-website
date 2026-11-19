-- SuccessFactors sitemap boards (19 Nov 2026): sync-job-sources v101 reads Wipro, HCLTech, Capgemini, EY and Firstsource
-- from their public sitemaps (entry titles only, India only, closed jobs reconciled). Capgemini was disabled after its old
-- search-page parser stopped working; EY and Firstsource are new.
insert into public.job_sources (provider, board_token, company_name, enabled) values
 ('official_careers','ey','EY',true),
 ('official_careers','firstsource','Firstsource',true)
on conflict (provider, board_token) do nothing;
update public.job_sources set enabled = true, cursor_token = '0', last_synced_at = null, last_sync_status = 'sitemap reader 19 Nov 2026'
 where provider = 'official_careers' and board_token in ('hcltech','capgemini','ey','firstsource');
