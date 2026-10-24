import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://aldovra.com",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const CLOSED_PATTERNS = [
  /this job (?:is|has been) no longer available/i,
  /this (?:job|position|role|vacancy) (?:has been |is )?(?:closed|filled|expired)/i,
  /no longer accepting applications/i,
  /applications for this (?:job|position|role) (?:are|is) closed/i,
  /the requisition (?:is|has been) closed/i,
  /job posting has expired/i,
  /this job posting is no longer active/i,
];
function safePublicUrl(value: string) {
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
        h === "metadata.google.internal" || h === "169.254.169.254" ||
        /^(127\.|10\.|192\.168\.|0\.)/.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
        h === "::1" || h.startsWith("fc") || h.startsWith("fd")) return false;
    return true;
  } catch { return false; }
}
async function readLimited(response: Response, maxBytes = 120000) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const part = value.subarray(0, Math.max(0, maxBytes - size));
      chunks.push(part);
      size += part.length;
      if (part.length < value.length) break;
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) { all.set(part, offset); offset += part.length; }
  return new TextDecoder().decode(all).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}
// Ask the employer's own job API whether a posting is still published. This is
// authoritative (no bot-blocking pages), so a 404 here closes the job at once.
function apiCheckUrl(job: any): string | null {
  const token = String(job.source_board_token || "");
  const rawId = String(job.source_external_id || "");
  try {
    if (job.source_provider === "greenhouse" && token && /^\d+$/.test(rawId)) {
      return "https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(token) + "/jobs/" + rawId;
    }
    if (job.source_provider === "lever" && token && rawId) {
      return "https://api.lever.co/v0/postings/" + encodeURIComponent(token) + "/" + encodeURIComponent(rawId);
    }
    if (job.source_provider === "smartrecruiters" && token && rawId) {
      return "https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(token) + "/postings/" + encodeURIComponent(rawId);
    }
    if (job.source_provider === "workday") {
      const m = token.match(/^([A-Za-z0-9-]+)__(wd\d{1,3})__([A-Za-z0-9_-]+)$/);
      const u = new URL(String(job.application_url || ""));
      const idx = u.pathname.indexOf("/job/");
      if (m && idx >= 0 && u.hostname.endsWith(".myworkdayjobs.com")) {
        return "https://" + m[1] + "." + m[2] + ".myworkdayjobs.com/wday/cxs/" + m[1] + "/" + m[3] + u.pathname.slice(idx);
      }
    }
  } catch { /* fall back to the page check */ }
  return null;
}
async function apiVerdict(apiUrl: string): Promise<"live" | "closed" | "unknown"> {
  try {
    const response = await fetch(apiUrl, {
      headers: { "Accept": "application/json", "Accept-Language": "en-US", "User-Agent": "AldovraJobLinkCheck/2.0 (+https://aldovra.com)" },
      signal: AbortSignal.timeout(9000),
    });
    if (response.status === 404 || response.status === 410) {
      try { await response.body?.cancel(); } catch {}
      // EU-hosted Greenhouse boards only answer on the regional cluster.
      if (apiUrl.startsWith("https://boards-api.greenhouse.io/")) {
        return await apiVerdict(apiUrl.replace("https://boards-api.greenhouse.io/", "https://boards-api.eu.greenhouse.io/"));
      }
      return "closed";
    }
    if (!response.ok) { try { await response.body?.cancel(); } catch {} return "unknown"; }
    const body = await response.json().catch(() => null);
    // SmartRecruiters keeps unpublished postings readable but flags them inactive.
    if (body && body.active === false) return "closed";
    return "live";
  } catch {
    return "unknown";
  }
}
async function checkOne(admin: ReturnType<typeof createClient>, job: any, closeAllowed: (provider: string) => boolean, apiResult?: "live" | "closed" | "unknown") {
  const now = new Date().toISOString();
  const apiUrl = apiCheckUrl(job);
  if (apiUrl) {
    let verdict = apiResult ?? await apiVerdict(apiUrl);
    if (verdict === "closed" && !closeAllowed(job.source_provider)) verdict = "unknown";
    if (verdict === "live") {
      await admin.from("opportunities").update({
        application_checked_at: now, application_check_status: "available", application_check_failures: 0,
      }).eq("id", job.id);
      return { id: job.id, result: "available_api" };
    }
    if (verdict === "closed") {
      await admin.from("opportunities").update({
        application_checked_at: now, application_check_status: "closed", active: false,
      }).eq("id", job.id).eq("active", true);
      return { id: job.id, result: "closed_api" };
    }
  }
  const url = String(job.application_url || job.source_url || "");
  if (!safePublicUrl(url)) {
    await admin.from("opportunities").update({
      application_checked_at: now, application_check_status: "invalid_url",
    }).eq("id", job.id);
    return { id: job.id, result: "invalid_url" };
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AldovraJobLinkCheck/1.0; +https://aldovra.com)",
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Range": "bytes=0-119999",
      },
      signal: AbortSignal.timeout(9000),
    });
  } catch (e) {
    await admin.from("opportunities").update({
      application_checked_at: now, application_check_status: "transient_network_error",
    }).eq("id", job.id);
    return { id: job.id, result: "transient_network_error" };
  }
  const status = response.status;
  let closed = status === 404 || status === 410;
  let marker = "";
  if (response.ok || status === 206) {
    const body = await readLimited(response);
    marker = CLOSED_PATTERNS.findIndex((pattern) => pattern.test(body)) >= 0 ? "closed_page_marker" : "";
    closed = Boolean(marker);
  } else {
    try { await response.body?.cancel(); } catch {}
  }
  if (closed) {
    const previousFailures = Number(job.application_check_failures || 0);
    const nextFailures = Math.min(previousFailures + 1, 10);
    const shouldDeactivate = previousFailures >= 1;
    const update: Record<string, unknown> = {
      application_checked_at: now,
      application_check_status: status === 404 || status === 410 ? "suspect_http_" + status : marker,
      application_check_failures: nextFailures,
    };
    if (shouldDeactivate) update.active = false;
    await admin.from("opportunities").update(update).eq("id", job.id).eq("active", true);
    return { id: job.id, result: shouldDeactivate ? "deactivated_after_repeat_failure" : "suspect_first_failure" };
  }
  if (response.ok || status === 206) {
    await admin.from("opportunities").update({
      application_checked_at: now, application_check_status: "available",
      application_check_failures: 0,
    }).eq("id", job.id);
    return { id: job.id, result: "available" };
  }
  const label = status === 403 || status === 401 ? "blocked_or_auth_required_" + status :
    status === 429 ? "rate_limited" : "transient_http_" + status;
  await admin.from("opportunities").update({
    application_checked_at: now, application_check_status: label,
  }).eq("id", job.id);
  return { id: job.id, result: label };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("ALDOVRA_CRON_SECRET");
  if (!url || !serviceKey || !cronSecret) return json({ error: "Server configuration missing" }, 500);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token !== cronSecret) return json({ error: "Cron authentication required" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Every active job is re-verified at least every 12 hours; never-checked jobs go first.
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const BATCH = 90;
  const { data: jobs, error } = await admin.from("opportunities")
    .select("id,title,application_url,source_url,application_check_failures,application_checked_at,source_provider,source_board_token,source_external_id")
    .eq("active", true)
    .or("application_checked_at.is.null,application_checked_at.lt." + cutoff)
    .order("application_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) return json({ error: "Could not load jobs for link checks" }, 500);
  const queue = jobs || [];
  // Phase 1: ask employer APIs first, without writing anything.
  const apiVerdicts = new Map<string, "live" | "closed" | "unknown">();
  const apiJobs = queue.filter((job: any) => apiCheckUrl(job));
  for (let i = 0; i < apiJobs.length; i += 10) {
    const batch = apiJobs.slice(i, i + 10);
    const verdicts = await Promise.all(batch.map((job: any) => apiVerdict(apiCheckUrl(job) as string)));
    batch.forEach((job: any, k: number) => apiVerdicts.set(job.id, verdicts[k]));
  }
  // Circuit breaker: if most of one provider's postings suddenly look closed,
  // assume the API changed and close nothing for that provider this run.
  const tally: Record<string, { closed: number; total: number }> = {};
  for (const job of apiJobs) {
    const t = tally[job.source_provider] ||= { closed: 0, total: 0 };
    t.total++;
    if (apiVerdicts.get(job.id) === "closed") t.closed++;
  }
  const tripped = Object.entries(tally).filter(([, t]) => t.total >= 10 && t.closed / t.total > 0.6).map(([p]) => p);
  const closeAllowed = (provider: string) => !tripped.includes(provider);
  // Phase 2: write results (page checks run here for providers without an API).
  const results: any[] = [];
  for (let i = 0; i < queue.length; i += 10) {
    const batch = queue.slice(i, i + 10);
    const settled = await Promise.all(batch.map((job: any) => checkOne(admin, job, closeAllowed, apiVerdicts.get(job.id))));
    results.push(...settled);
  }
  const counts: Record<string, number> = {};
  for (const result of results) counts[result.result] = (counts[result.result] || 0) + 1;
  return json({ success: true, checked: results.length, batch_limit: BATCH, counts, circuit_breaker_tripped: tripped });
});
