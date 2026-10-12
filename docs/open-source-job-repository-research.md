# Open-source job discovery repository research

Research date: 2026-10-12. Repository search results are candidates only; verify each project's current license, API terms, maintenance, and behavior before incorporating code.

| Repository | Potential value | Decision |
|---|---|---|
| https://github.com/speedyapply/JobSpy | Multi-board job discovery patterns | Research only. Scraping providers may restrict automation; don't deploy it as a serverless scraper without legal/terms review. |
| https://github.com/kalil0321/ats-scrapers | ATS-specific adapter ideas | Research only. Inspect license, supported providers, dependencies and maintenance before reuse. |
| https://github.com/binoydutt/Resume-Job-Description-Matching | Baseline resume/job similarity techniques | Use as a comparison reference; preserve verified Aldovra skills as primary evidence and never invent resume claims. |
| https://github.com/amiradridi/Job-Resume-Matching | Alternative matching model ideas | Research only; likely heavier than necessary for the current Supabase Edge Function. |
| https://github.com/strelov1/freehire | Aggregation architecture | Research only; don't deploy a separate stack into Aldovra before auditing its architecture and license. |
| https://github.com/Himalayas-App/remote-jobs-api | Supplemental remote-job dataset/API | Validate current availability, terms, geographic relevance, freshness and deduplication before enabling. |
| https://github.com/Jobicy/remote-jobs-api | Public remote-job API | Adapter staged in `student-job-discovery`; migration adds a bounded 100-job public feed source. Confirm live response and terms in deployment smoke test before enabling production use. |

## Integration rules

1. Prefer documented APIs and employer-owned ATS feeds over browser scraping.
2. Do not copy a repository into production just because it is public. Check the LICENSE file, transitive dependencies, secret handling and data provenance.
3. Keep provider adapters isolated so one source can be disabled without impacting other feeds.
4. Normalize to Aldovra's existing `opportunities` and `opportunity_skills` model rather than deploying a second database.
5. Deduplicate by provider + stable external job ID; use canonical apply URLs and preserve source attribution.
6. Match with existing verified skills, resume evidence and career preferences. Do not let untrusted job text influence system prompts or fabricate student experience.
7. Use bounded ingestion and per-user refresh limits. Do not run a full multi-board scrape on every page load.
8. Keep applications user-confirmed; generate drafts and open official application pages, but never silently submit.
9. Never import credentials, cookies, proxy lists or anti-bot bypass mechanisms from third-party repositories.
10. Do not enable payments or deploy untested changes to production.

## Current implementation gap

The student discovery function and rate-limit migration are staged on the feature branch. Dashboard wiring, feed validation, static checks, migration review and browser end-to-end tests remain release gates. A GitHub Actions Deno type-check workflow was added; its result must be checked after GitHub runs it.
