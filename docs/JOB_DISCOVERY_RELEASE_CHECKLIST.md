# Aldovra job discovery release checklist

Use this checklist for every release that changes job discovery, matching, or application tracking. Do not mark an item complete without evidence from the live environment.

## Automated checks
- [ ] GitHub Actions "Aldovra Static Checks" passes for the release commit.
- [ ] Inline JavaScript syntax checks pass for `dashboard.html`.

## Job source ingestion
- [ ] Validate each enabled ATS board against its official public API.
- [ ] Disable a source only after confirming it is invalid; never mark a failed source as successfully synced.
- [ ] Run a complete sync with an authorized admin session or the approved scheduler credential.
- [ ] Confirm sync results, imported counts, and per-source status in `public.job_sources`.
- [ ] Confirm active jobs have valid HTTP(S) application URLs and source attribution.

## Scheduled sync
- [ ] Store the service-role credential in Supabase Vault using the Supabase dashboard; never commit or paste it into chat.
- [ ] Enable the required scheduler/network extensions only after credential storage is confirmed.
- [ ] Schedule the approved sync endpoint with a secret-backed authorization header.
- [ ] Run the scheduled job once and verify its execution record and resulting source timestamps.
- [ ] Confirm failures are visible and retry behavior is bounded.

## Student end-to-end validation
- [ ] Sign in with a test student account.
- [ ] Upload a test resume and confirm parsed skills are shown correctly.
- [ ] Confirm recommendations use resume evidence, selected/verified skills, assessment results, and preferences.
- [ ] Confirm Explore All jobs remain accessible independently of recommendation ranking.
- [ ] Save a job and verify only the signed-in student's tracker row changes.
- [ ] Open the official application URL; verify popup-block handling.
- [ ] Mark the job as applied and confirm status persists after refresh.

## Release and security
- [ ] Verify the exact release commit is deployed to the production domain.
- [ ] Test desktop and mobile dashboard layouts, login, assessment, and job flows.
- [ ] Review Supabase Security Advisor findings; resolve or document each finding with a reason.
- [ ] Enable leaked-password protection in Supabase Auth settings.
- [ ] Confirm payment flows remain disabled until separately approved.
- [ ] Keep rollback commit and database migration notes available.

## Current known blockers (last audit)
- Seven enabled job sources had never synced: Accordion India, 100ms, Sarvam AI, CRED, Tide, DoorDash India, Zenoti.
- Supabase Vault had zero secrets; scheduled sync must not be enabled until the secret is stored securely.
- Student browser E2E and production deployment verification require a real test session and production access.
