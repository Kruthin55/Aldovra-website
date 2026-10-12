# Advanced Open-Source Job Discovery Engine

## Goal
Extend Aldovra's existing student job dashboard without replacing its UI, authentication, assessment flow, or Supabase schema. Payments remain disabled. Job applications are never submitted without the student's explicit action.

## Candidate repository review queue

| Project | Potential use | Integration stance | Required checks |
|---|---|---|---|
| https://github.com/mherzog4/job-boards | ATS board discovery and bulk job ingestion | Study adapter/discovery logic; do not run an unbounded crawl in a request | Current license, archive provenance, provider terms, rate limits, runtime fit |
| https://github.com/strelov1/freehire | Job aggregation, normalized listings, deduplication and search | Evaluate as a reference architecture before adopting code | MIT license file, dependency audit, live source tests, commercial data terms |
| https://github.com/Himalayas-App/remote-jobs-api | Additional remote-job feed | Treat as an optional supplemental feed | API availability, freshness, terms, India/fresher relevance |
| https://github.com/Jobicy/remote-jobs-api | Additional remote-job feed | Treat as an optional supplemental feed | API availability, freshness, terms, rate limits |
| https://github.com/arianra/job-aggregator | Aggregation patterns, matching and tracking | Compare patterns against existing Supabase matching first | License, current maintenance, source correctness |
| https://github.com/ever-jobs/ever-jobs | Additional aggregation patterns | Research only until verified | License, maintenance, sources and terms |
| https://github.com/ScottCoffin/Job_Scraper | Workflow/scheduling patterns | Borrow ideas only unless license is compatible | AGPL obligations, dependencies, source terms |
| https://github.com/Het200522/NLP-Project_AI-Resume-Screening-Job-Recommendation-System | Resume/job similarity reference | Reuse concepts, not unreviewed model/code | License, model quality, bias, security, truthful resume constraints |
| https://github.com/opioidem/simply-apply-1 | Resume tailoring workflow reference | Do not directly integrate before license review | AGPL-3.0 implications, automation safety, data handling |

These are candidates, not confirmed production integrations. Public source code does not automatically grant rights to redistribute job data or use an external hosted API commercially.

## Target architecture

1. **Source adapters**: official ATS endpoints and approved public APIs only; no arbitrary user-supplied URLs.
2. **Incremental ingestion**: bounded concurrency, per-provider rate limits, timeouts, retries with backoff, and source health metrics.
3. **Normalization**: title, employer, location, description, job type, experience level, posted/updated time, source ID and canonical apply URL.
4. **Quality/deduplication**: stable source ID plus normalized company/title/location/link; reject malformed URLs, test jobs and expired postings.
5. **Skill mapping**: map against Aldovra's existing skills catalogue and opportunity_skills relationships.
6. **Matching**: retain the current student-side matching approach using verified skills, assessment outcomes, resume terms and preferences. Explain match reasons and missing skills.
7. **Student experience**: recommended jobs and the wider available-job list, save/open/apply tracking, and resume/application drafts requiring student review.
8. **Observability**: source last-success time, fetched/imported/skipped/duplicate counts, sanitized errors and dashboard empty-state diagnostics.

## Security and reliability gates

- Keep service-role credentials server-side; never expose them in dashboard JavaScript.
- Student-triggered refresh must validate the user session and enforce per-user and global rate limits.
- A student may request a refresh but may not add or enable arbitrary sources.
- Keep the existing admin-only source management separate from student refresh.
- Do not scrape sites that prohibit it, bypass anti-bot controls, or ignore API terms.
- Do not automatically submit applications, fabricate qualifications, or alter verified scores.
- Do not enable payment endpoints.
- Only expire old source jobs after a successful fetch from that specific source.
- Keep production deployment gated on schema review, automated tests and real browser end-to-end checks.

## Current implementation facts to re-check before coding
- Existing Supabase function: sync-job-sources; currently admin-only for browser/manual sync.
- Existing tables include job_sources, opportunities, opportunity_skills, opportunity_matches, student_resumes, student_skills, assessment_attempts, career_preferences and job_application_tracker.
- Existing function only imports rows when it can map at least one skill; this can discard valid postings. Consider storing valid jobs with zero mapped skills while marking match confidence separately.
- Candidate sources configured in job_sources must be validated against their official endpoint before being considered active.
- No cron should be assumed to exist; scheduled ingestion needs explicit supported scheduling and secrets configuration.

## Acceptance tests
1. Valid source imports jobs and relationships idempotently.
2. Invalid/unreachable source reports an error without expiring existing data.
3. Duplicate jobs do not multiply across refreshes.
4. One failing provider does not stop other providers.
5. Student JWT can request bounded discovery but cannot mutate sources.
6. Unauthenticated requests fail; repeated refreshes are rate-limited.
7. Student sees personalized recommendations and all available valid jobs.
8. Save/open/apply tracker continues to work.
9. External apply links are validated; application submission remains student-controlled.
10. Existing dashboard/auth/assessment UI and payment-disabled behavior remain unchanged.
