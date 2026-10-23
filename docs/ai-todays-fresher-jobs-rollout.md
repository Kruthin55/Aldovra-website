# AI-powered same-day fresher job discovery

## Purpose
The `ai-todays-fresher-jobs` Edge Function is a staged, authenticated discovery path for the Jobs & Opportunities area. It queries OpenAI web search and Gemini Google Search grounding when the corresponding Supabase secrets are configured, merges duplicate direct application links, filters to fresher/entry-level roles, and only saves listings whose source-reported posting date equals the current India date.

## Safety and cost controls
- Requires a valid signed-in student session and only accepts requests from `https://aldovra.com`.
- Reuses the database's per-user refresh gate; requests are limited by the existing atomic cooldown RPC.
- Calls at most one OpenAI search and one Gemini search per refresh, with 45-second timeouts and a maximum of 12 results per provider.
- API keys are read server-side from Supabase secrets and are never returned to the browser.
- Existing jobs, scheduled sync, and student job discovery remain untouched. This is an additive rollout.

## Before deployment
- Confirm API keys are valid and API billing/quotas are available; secret names alone do not prove this.
- Run Deno type-check/static analysis.
- Test with an authenticated student JWT and confirm unauthenticated calls return 401.
- Smoke-test OpenAI-only, Gemini-only, both-provider, provider-error, malformed-JSON, zero-result, duplicate URL, and wrong-date cases.
- Confirm `ai_search` inserts and the job dashboard queries include this provider.
- Confirm the posting date is visible to students and clearly distinguished from import/last-seen time.
- Check usage costs before enabling broad student access.

## Rollout / rollback
Do not deploy or disable the existing scheduled sync until the staged function passes these checks and the dashboard is wired to call it. Rollback is to remove the new dashboard call and leave the existing source-sync paths intact. Never delete existing opportunities or application-tracker records as part of this rollout.
