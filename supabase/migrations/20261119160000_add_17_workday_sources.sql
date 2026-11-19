-- 17 more Workday boards (19 Nov 2026, founder: "big freshers pool"). Each answered the public CXS
-- /jobs endpoint with India matches when probed through pg_net. The sync still applies the India +
-- fresher/entry-level filters per job, and job_fresher_ok() gates what students see.
insert into public.job_sources (provider, board_token, company_name, enabled) values
 ('workday','hitachi__wd1__hitachi','Hitachi',true),
 ('workday','ag__wd3__airbus','Airbus',true),
 ('workday','dxctechnology__wd1__dxcjobs','DXC Technology',true),
 ('workday','cvshealth__wd1__cvs_health_careers','CVS Health',true),
 ('workday','danaher__wd1__danaherjobs','Danaher',true),
 ('workday','bristolmyerssquibb__wd5__bms','Bristol Myers Squibb',true),
 ('workday','globalhr__wd5__rec_rtx_ext_gateway','RTX',true),
 ('workday','iqvia__wd1__iqvia','IQVIA',true),
 ('workday','wk__wd3__external','Wolters Kluwer',true),
 ('workday','relx__wd3__relx','RELX',true),
 ('workday','labcorp__wd1__external','Labcorp',true),
 ('workday','transunion__wd5__transunion','TransUnion',true),
 ('workday','gevernova__wd5__vernova_externalsite','GE Vernova',true),
 ('workday','ghr__wd1__lateral-us','Bank of America',true),
 ('workday','msd__wd5__searchjobs','MSD',true),
 ('workday','geaerospace__wd5__ge_externalsite','GE Aerospace',true),
 ('workday','warnerbros__wd5__global','Warner Bros. Discovery',true)
on conflict (provider, board_token) do nothing;
