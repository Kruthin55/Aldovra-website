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
- `index.html` is self-contained (preloader, split-word reveals, scroll highlight, marquees, counters).
- Shared assets in `assets/`:
  - `aldovra-mascot.js` — "Aldo", Aldovra's own original chibi student in a purple hoodie. API: `AldoMascot.create(el,{peek,bubble})` → `say/mood/cover/peekThrough/wave/jump/shake/lookAtElement`.
  - `aldovra-auth.css/js` — login & signup (`<body class="ald-auth" data-auth="login|signup">`). Aldo covers his eyes on password fields and reacts to errors and success.
  - `aldovra-pages.css/js` — content pages (`<body class="ald-page" data-guide="...">`), with Aldo as a guide in the corner.
  - `aldovra-dashboard.css/js` — dashboard reveals, the job-card UI (`.ajc`), and the Aldo dock (sidebar on desktop, corner on mobile).
- Job cards are rendered in dashboard.html `render()`. Keep the `data-ald-save/apply/report-job/mark-applied` attributes, `.ald-job-actions`, and the "Skill gaps:" text, because other scripts depend on them.

## Other decisions
- The student "Explore Students" page was replaced by a competitive leaderboard, "Aldovra Arena" (`get_explore_students` was retired).
- The company-names section was removed from the site.
- Commits end with `Co-Authored-By` / `Claude-Session` trailers when Claude makes them.

## Pending, waiting on the founder
- Activate Adzuna and decide on the paid plan. If it is used, add "Jobs by Adzuna" attribution on the cards.
- Get a Jooble key.
- Turn on Supabase leaked-password protection.
