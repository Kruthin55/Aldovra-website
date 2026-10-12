import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://aldovra.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const cleanText = (value: unknown, max = 8000) =>
  String(value ?? "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim().slice(0, max);
const validHttpUrl = (value: unknown) => {
  try {
    const u = new URL(String(value ?? ""));
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch { return null; }
};
const workMode = (value: unknown, text: string) => {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("remote") || /\bremote\b/i.test(text)) return "Remote";
  if (v.includes("hybrid") || /\bhybrid\b/i.test(text)) return "Hybrid";
  if (v.includes("on.?site") || /\bon.?site\b/i.test(text)) return "On-site";
  return null;
};
const employment = (value: unknown, title: string, description: string) => {
  const t = (String(value ?? "") + " " + title + " " + description).toLowerCase();
  if (/intern/.test(t)) return "Internship";
  if (/contract|temporary/.test(t)) return "Contract";
  if (/part.?time/.test(t)) return "Part-time";
  if (/full.?time/.test(t)) return "Full-time";
  return null;
};
function normalize(source: any, row: any) {
  let externalId = "", title = "", location = "", description = "", company = "", url: string | null = null;
  let mode: string | null = null, type: string | null = null;
  if (source.provider === "jobicy") {
    description = cleanText(row.jobDescription || row.jobExcerpt);
    title = cleanText(row.jobTitle, 240);
    company = cleanText(row.companyName || row.company || source.company_name, 200);
    location = cleanText(row.jobGeo, 240);
    externalId = String(row.id ?? "");
    url = validHttpUrl(row.url);
    mode = "Remote";
    type = employment(Array.isArray(row.jobType) ? row.jobType.join(" ") : row.jobType, title, description);
  } else if (source.provider === "ashby") {
    description = cleanText(row.descriptionPlain || row.descriptionHtml || row.description);
    title = cleanText(row.title, 240);
    location = cleanText(row.location, 240) || (Array.isArray(row.secondaryLocations)
      ? row.secondaryLocations.map((x: any) => cleanText(x.location, 120)).filter(Boolean).join(", ") : "");
    externalId = String(row.id || row.jobUrl || row.applyUrl || "");
    url = validHttpUrl(row.applyUrl || row.jobUrl);
    mode = workMode(null, description + " " + String(row.location || ""));
    type = employment(row.employmentType, title, description);
  } else if (source.provider === "greenhouse") {
    description = cleanText(row.content);
    title = cleanText(row.title, 240);
    location = cleanText(row.location?.name, 240);
    externalId = String(row.id ?? "");
    url = validHttpUrl(row.absolute_url);
    mode = workMode(null, description);
    type = employment(null, title, description);
  } else {
    description = cleanText(row.descriptionPlain || row.description);
    title = cleanText(row.text, 240);
    location = cleanText(row.categories?.location, 240);
    externalId = String(row.id ?? "");
    url = validHttpUrl(row.hostedUrl);
    mode = workMode(row.workplaceType, description);
    type = employment(row.categories?.commitment, title, description);
  }
  return {
    externalId, title, company: company || cleanText(source.company_name, 200),
    location: location || null, description, url, mode, employment: type,
    experience: /intern|entry.?level|fresher|graduate/i.test(title + " " + description) ? "fresher" : null,
  };
}
function hasSkill(text: string, skill: string) {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try { return new RegExp("(^|[^a-z0-9+#.])" + escaped + "($|[^a-z0-9+#.])", "i").test(text); }
  catch { return text.includes(skill.toLowerCase()); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const origin = req.headers.get("Origin");
  if (origin && origin !== "https://aldovra.com") {
    return json({ error: "Origin not allowed" }, 403);
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 500);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token === serviceKey) return json({ error: "A student session is required" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
  const userId = authData.user.id;

  // Rate-limit is atomic in PostgreSQL; refresh requests are accepted at most once per user per 5 minutes.
  const { data: gate, error: gateError } = await admin.rpc("claim_job_discovery_refresh", { p_user_id: userId });
  if (gateError) return json({ error: "Job discovery is not configured yet. Please try again later." }, 503);
  const decision = Array.isArray(gate) ? gate[0] : gate;
  if (!decision?.allowed) {
    return json({ error: "Please wait before refreshing jobs again.", retry_after_seconds: Number(decision?.retry_after_seconds ?? 300) }, 429);
  }

  const { data: sources, error: sourceError } = await admin.from("job_sources")
    .select("id,provider,board_token,company_name,cursor_token,last_sync_status")
    .eq("enabled", true)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(30);
  if (sourceError) return json({ error: "Could not load approved sources" }, 500);
  if (!sources?.length) return json({ success: true, sources_checked: 0, imported: 0, skipped: 0, message: "No enabled sources yet." });
  // Prioritize verified Indian employers first; keep other official ATS boards as breadth sources.
  const indiaFirstCompanies = new Set(["phonepe", "razorpay", "swiggy", "zoho", "freshworks", "paytm", "meesho", "flipkart", "zerodha", "groww", "cred", "dream11", "infosys", "tcs", "wipro", "hcltech", "tech mahindra", "browserstack", "chargebee", "juspay", "darwinbox"]);
  const orderedCompanySources = sources.filter((s: any) => s.provider !== "jobicy").sort((a: any, b: any) => {
    const ai = indiaFirstCompanies.has(String(a.company_name ?? "").toLowerCase()) ? 1 : 0;
    const bi = indiaFirstCompanies.has(String(b.company_name ?? "").toLowerCase()) ? 1 : 0;
    const af = String(a.last_sync_status ?? "").startsWith("error: Provider HTTP 404") ? 1 : 0;
    const bf = String(b.last_sync_status ?? "").startsWith("error: Provider HTTP 404") ? 1 : 0;
    return bi - ai || af - bf || Number(!a.last_synced_at) - Number(!b.last_synced_at);
  });
  const selectedSources = [
    ...sources.filter((s: any) => s.provider === "jobicy").slice(0, 1),
    ...orderedCompanySources.slice(0, 7),
  ];

  const { data: skills, error: skillsError } = await admin.from("skills").select("id,name").limit(1000);
  if (skillsError) return json({ error: "Could not load skill catalogue" }, 500);
  const skillRows = (skills ?? []).filter((s: any) => String(s.name ?? "").trim().length >= 2);
  let imported = 0, skipped = 0, checked = 0;
  const errors: string[] = [];

  for (const source of selectedSources) {
    checked++;
    try {
      const endpoint = source.provider === "jobicy"
        ? "https://jobicy.com/api/v2/remote-jobs?count=15&geo=anywhere" + (source.cursor_token ? "&cursor=" + encodeURIComponent(source.cursor_token) : "")
        : source.provider === "greenhouse"
        ? "https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(source.board_token) + "/jobs?content=true"
        : source.provider === "lever"
          ? "https://api.lever.co/v0/postings/" + encodeURIComponent(source.board_token) + "?mode=json"
          : source.provider === "ashby"
            ? "https://api.ashbyhq.com/posting-api/job-board/" + encodeURIComponent(source.board_token)
            : null;
      if (!endpoint) { skipped++; continue; }
      const requestOptions = {
        headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
        signal: AbortSignal.timeout(7000),
      };
      let response = await fetch(endpoint, requestOptions);
      // Some Greenhouse boards are served from the EU job-board cluster. If the
      // default public endpoint reports 404, retry the regional API before marking
      // a verified public board as broken.
      if (!response.ok && source.provider === "greenhouse" && response.status === 404) {
        const regionalEndpoint = "https://boards-api.eu.greenhouse.io/v1/boards/" +
          encodeURIComponent(source.board_token) + "/jobs?content=true";
        const regionalResponse = await fetch(regionalEndpoint, requestOptions);
        if (regionalResponse.ok) response = regionalResponse;
      }
      // Jobicy cursors expire after 24 hours. If an old cursor is rejected, restart
      // from the newest page once so one dormant source cannot get stuck forever.
      // Only reset a cursor for a client-side cursor rejection. Do not retry rate limits,
      // server errors, or network failures without the cursor; that could amplify load.
      if (
        !response.ok && source.provider === "jobicy" && source.cursor_token &&
        [400, 422].includes(response.status)
      ) {
        response = await fetch("https://jobicy.com/api/v2/remote-jobs?count=15&geo=anywhere", requestOptions);
      }
      if (!response.ok) throw new Error("Provider HTTP " + response.status);
      const payload = await response.json();
      // Distinguish a valid empty board from an unexpected provider schema.
      // Never mark a malformed response as a successful zero-job sync.
      let rows: any[];
      if (source.provider === "jobicy") {
        if (payload?.success === false || !payload || typeof payload !== "object" || !Array.isArray(payload.jobs)) {
          throw new Error("Unexpected Jobicy payload shape");
        }
        rows = payload.jobs;
      } else if (source.provider === "lever") {
        if (!Array.isArray(payload)) throw new Error("Unexpected Lever payload shape");
        rows = payload;
      } else {
        if (!payload || typeof payload !== "object" || !Array.isArray(payload.jobs)) {
          throw new Error("Unexpected " + source.provider + " payload shape");
        }
        rows = payload.jobs;
      }
      let sourceCount = 0;
      for (const raw of rows.slice(0, 15)) {
        if (source.provider === "ashby" && raw?.isListed === false) { skipped++; continue; }
        const job = normalize(source, raw);
        if (!job.externalId || !job.title || !job.url || !job.description || !job.company) { skipped++; continue; }
        const searchable = (job.title + " " + job.description).toLowerCase();
        const matchedSkills = skillRows.filter((s: any) => hasSkill(searchable, String(s.name))).slice(0, 20);
        // Preserve valid listings in Explore All even when no catalogue skill matches.
        // Personalized ranking remains driven by actual skill/resume/assessment evidence.
        const { data: savedId, error: saveError } = await admin.rpc("upsert_job_opportunity_atomic", {
          p_job: {
            source_provider: source.provider,
            source_board_token: source.board_token,
            source_external_id: job.externalId,
            source_url: job.url,
            source_last_seen_at: new Date().toISOString(),
            title: job.title,
            company_name: job.company,
            location: job.location,
            work_mode: job.mode,
            employment_type: job.employment,
            description: job.description,
            experience_level: job.experience,
            application_url: job.url,
          },
          p_skill_ids: matchedSkills.map((s: any) => Number(s.id)),
        });
        if (saveError || !savedId) {
          skipped++;
          if (errors.length < 8) errors.push(source.company_name + ": job save failed");
          continue;
        }
        imported++; sourceCount++;
      }
      // Never expire jobs from a student-triggered partial refresh. Expiry remains a separate,
      // full-source maintenance operation after an authoritative complete sync.
      await admin.from("job_sources").update({
        last_synced_at: new Date().toISOString(), last_sync_status: "success",
        last_sync_count: sourceCount, updated_at: new Date().toISOString(),
        ...(source.provider === "jobicy" ? { cursor_token: typeof payload.nextCursor === "string" && payload.nextCursor ? payload.nextCursor : null } : {}),
      }).eq("id", source.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown provider error";
      if (errors.length < 8) errors.push(source.company_name + ": " + message.slice(0, 120));
      await admin.from("job_sources").update({
        last_synced_at: new Date().toISOString(), last_sync_status: "error: " + message.slice(0, 120),
        updated_at: new Date().toISOString(),
      }).eq("id", source.id);
    }
  }
  return json({ success: errors.length === 0, sources_checked: checked, imported, skipped, errors });
});
