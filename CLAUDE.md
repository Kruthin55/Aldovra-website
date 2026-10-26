# Aldovra — project notes for Claude

Aldovra (aldovra.com) is a career platform for Indian students and freshers: fresher jobs, assessments, resume analysis, a career agent, a student leaderboard, and an HR side for recruiters. The founder talks in Telugu written in English letters; reply the same way, short and friendly.

## Stack
- Static HTML pages at the repo root, hosted on GitHub Pages (`CNAME` = aldovra.com). A push to `main` deploys the site.
- Supabase project `lgefwfrjzweayfxahogs`: Postgres with RLS, edge functions in Deno (`supabase/functions/`), pg_cron, pg_net, and the vault secret `aldovra_cron_secret` for cron auth.
- Every database change goes in `supabase/migrations/` (timestamped .sql) and is also applied to the live project.
- Payments go through Razorpay edge functions.

## Contacts shown on the site
- Support: support@aldovra.com (a Dynadot email-forward DNS record)
- General & partnerships: helloaldovra.com@gmail.com
- Instagram: instagram.com/aldovra.in

## Job pipeline (the most important part)
Goal: show students only live fresher or entry-level jobs in India, with new jobs arriving daily and closed ones disappearing automatically, at no cost.

| Piece | What it does | Schedule |
|---|---|---|
| `sync-job-sources` | About 150 company boards (Greenhouse, Lever, SmartRecruiters, Ashby, Workday CXS), 5 sources per call | every 3 min |
| `sync-amazon-jobs` | amazon.jobs India public JSON; cursor kept in the job_sources row (provider amazon, enabled=false on purpose) | :07 and :37 |
| `check-job-links` | Asks the employer's own API whether a posting is still live; a 404 means closed right away. Circuit breaker: if more than 60% of one provider looks closed, nothing is closed that run | every 20 min |
| `refresh_job_freshness()` | Retires stale or expired jobs, archives safely (never touches jobs that students saved or applied to), writes daily stats | 03:05 IST |
| `job-pipeline-health` + `.github/workflows/job-pipeline-health.yml` | Public health JSON; the hourly GitHub Action fails (and emails the owner) when `ok` is false | hourly |

- Experience classifier: keeps "fresher" and "Entry level" (0–1 and 0–2 year ranges are fine). It rejects roles that need years of experience and senior ("Sr") titles. The same logic lives in the backend and in the `dashboard.html` function `noExperienceEligible`.
- Workday board token format is `tenant__wdN__site`.
- Not used:
  - Adzuna costs £8/month after its trial; it is deferred, and its code is gated on keys.
  - Jooble (free) is waiting on an API key. Keys go only into Supabase Edge Function secrets (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_API_KEY`), never into chat or the code.
- The Microsoft careers API returns 403, so it is skipped.
- Free GitHub job repos had no license and little data, so we use the public employer APIs directly instead.

## Design system & Aldo mascot
- Look: editorial motion style (inspired by neiden.framer.media). Off-white `#f3f2ee`, ink `#0d0d12`, indigo→violet accents, Inter Tight + Instrument Serif italics + JetBrains Mono labels. Dark mode via `data-theme="dark"` (localStorage key `aldovra-theme`).
- Brand palette everywhere: bg `#F3F2EE`, ink `#0D0D12`, primary indigo `#4F46E5` → violet `#7C3AED`, marigold `#F2B631` used sparingly for highlights. The old royal blue (`#2563eb`) was replaced site-wide. The dashboard brand overrides live in `assets/aldovra-dashboard.css`, and its sidebar uses line icons.
- `index.html` is self-contained (preloader, split-word reveals, scroll highlight, marquees, counters).
- Shared assets in `assets/`:
  - `aldovra-mascot.js` — "Aldo" (`AldoMascot.roam()` makes her walk along the bottom after the mouse on desktop), Aldovra's own original chibi Indian girl: purple kurta with gold embroidery, bindi, braid with jasmine, jhumkas, bangles. Greets with "Namaste". API: `AldoMascot.create(el,{peek,bubble})` → `say/mood/cover/peekThrough/wave/jump/shake/lookAtElement`.
  - `aldovra-auth.css/js` — login & signup (`<body class="ald-auth" data-auth="login|signup">`). Aldo covers his eyes on password fields and reacts to errors and success.
  - `aldovra-pages.css/js` — content pages (`<body class="ald-page" data-guide="...">`), with Aldo as a guide in the corner.
  - `aldovra-dashboard.css/js` — dashboard reveals, the job-card UI (`.ajc`), and the Aldo dock (sidebar on desktop, corner on mobile).
- Job cards are rendered in dashboard.html `render()`. Keep the `data-ald-save/apply/report-job/mark-applied` attributes, `.ald-job-actions`, and the "Skill gaps:" text, because other scripts depend on them.

## Payments (PayU)
- Reattempt fee is decided on the server from the latest score: 65–74% → ₹50, 0–64% → ₹100, 75%+ → passed, so no reattempt. The 1-week cooldown and the cap of 4 attempts per 30 days are enforced before payment.
- `create-payu-payment` validates the request, inserts an `assessment_payments` row (`provider='payu'`, `status='created'`), and returns signed hosted-checkout fields. The browser POSTs a form to PayU.
- `payu-callback` (surl/furl, verify_jwt off) checks the reverse hash, key, amount and owner, then confirms with PayU's `verify_payment` API before setting `status='paid'`. It redirects to `dashboard.html?payment=success|pending|failed`.
- `generate-assessment` consumes the paid entitlement through `consume_assessment_reattempt`.
- Go-live switch: `platform_settings.reattempt_payments_live`, read through the RPC `reattempt_payments_live()`. While it is false, reattempts stay free and the pay buttons are hidden. Flip it with SQL once live keys are tested.
- Secrets: `PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT`, `PAYU_MODE` (`test` | `live`). The old Razorpay functions are disabled stubs.

## Other decisions
- The student "Explore Students" page was replaced by a competitive leaderboard, "Aldovra Arena" (`get_explore_students` was retired).
- The company-names section was removed from the site.
- Commits end with `Co-Authored-By` / `Claude-Session` trailers when Claude makes them.

## Next up (agreed 26 Oct 2026, start with 1 + 2)
1. Daily job-alert emails matched to each student's skills (check a free email tier such as Resend first).
2. Verified skill certificate and a public profile link (`aldovra.com/u/<name>`, with a QR code) that students can share on LinkedIn.
3. "Resume vs this job" match button on job cards (reuse analyze-resume).
4. AI mock interview practice (Gemini).
5. Daily practice quiz with streaks that add points to Arena.
6. Later: onboarding checklist, application tracker board, skill-gap roadmaps, referral credits, PWA install, a Telugu/Hindi toggle.

## Pending, waiting on the founder
- Activate Adzuna and decide on the paid plan. If it is used, add "Jobs by Adzuna" attribution on the cards.
- Get a Jooble key.
- Turn on Supabase leaked-password protection.
- PayU: add the test keys (`PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT`, `PAYU_MODE=test`) in Supabase secrets, then Claude tests the flow, then switch to live.
