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
  try { const u = new URL(String(value ?? "")); return ["https:", "http:"].includes(u.protocol) ? u.href : null; }
  catch { return null; }
};
const workMode = (value: unknown, text: string) => {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("remote") || /\bremote\b/i.test(text)) return "Remote";
  if (v.includes("hybrid") || /\bhybrid\b/i.test(text)) return "Hybrid";
  if (v.includes("on.?site") || /\bon.?site\b/i.test(text)) return "On-site";
  return null;
};
const employment = (value: unknown, title: string, description: string) => {
  const v = String(value ?? "").toLowerCase();
  const t = (title + " " + description).toLowerCase();
  if (/intern/.test(v + " " + t)) return "Internship";
  if (/contract|temporary/.test(v + " " + t)) return "Contract";
  if (/part.?time/.test(v + " " + t)) return "Part-time";
  if (/full.?time/.test(v + " " + t)) return "Full-time";
  return null;
};
function normalize(source: any, row: any) {
  if (source.provider === "smartrecruiters") {
    const rawSections = row.jobAd?.sections;
    const sections = Array.isArray(rawSections)
      ? rawSections.map((section: any) => section?.text || section?.content || section?.body || "").join(" ")
      : rawSections && typeof rawSections === "object"
        ? Object.values(rawSections).map((section: any) => section?.text || section?.content || section?.body || "").join(" ")
        : "";
    const location = row.location || {};
    const countryRaw = String(location.country || "");
    const country = /^(in|india)$/i.test(countryRaw) || String(location.countryCode || "").toLowerCase() === "in" ? "India" : countryRaw;
    const locationText = [location.city, location.region, country].filter(Boolean).join(", ");
    const title = cleanText(row.name || row.title, 240);
    const desc = cleanText(row.jobAd?.jobDescription || row.jobDescription || sections || row.description);
    return {
      externalId: String(row.id || row.uuid || ""), title, company: source.company_name,
      location: cleanText(locationText, 240) || null, description: desc,
      url: validHttpUrl(row.applyUrl || row.postingUrl || row.jobAd?.applyUrl),
      mode: workMode(location.remote ? "remote" : null, desc + " " + locationText),
      employment: employment(row.typeOfEmployment?.label, title, desc),
      experience: /\b(intern|junior|entry[\s-]?level|graduate trainee|trainee|new grad|fresher)\b/i.test(title) ? "fresher" : null,
    };
  }
  if (source.provider === "ashby") {
    const desc = cleanText(row.descriptionPlain || row.descriptionHtml || row.description);
    const title = cleanText(row.title, 240);
    const location = cleanText(row.location, 240) || (Array.isArray(row.secondaryLocations) ? row.secondaryLocations.map((x: any) => cleanText(x.location, 120)).filter(Boolean).join(", ") : "");
    return {
      externalId: String(row.id || row.jobUrl || row.applyUrl || ""),
      title, company: source.company_name, location: location || null, description: desc,
      url: validHttpUrl(row.applyUrl || row.jobUrl), mode: workMode(null, desc + " " + String(row.location || "")),
      employment: employment(row.employmentType, title, desc),
      experience: /\b(intern|junior|entry[\s-]?level|graduate trainee|trainee|new grad|fresher)\b/i.test(title) || /\b(fresher|new grad(?:uate)?|entry[\s-]?level|no prior experience required|0\s*[-–to]+\s*2 years? experience)\b/i.test(desc) ? "fresher" : null,
    };
  }
  if (source.provider === "greenhouse") {
    const desc = cleanText(row.content);
    return {
      externalId: String(row.id ?? ""), title: cleanText(row.title, 240), company: source.company_name,
      location: cleanText(row.location?.name, 240) || null, description: desc,
      url: validHttpUrl(row.absolute_url), mode: workMode(null, desc),
      employment: employment(null, row.title, desc),
      experience: /\b(intern|junior|entry[\s-]?level|graduate trainee|trainee|new grad|fresher)\b/i.test(String(row.title ?? "")) || /\b(fresher|new grad(?:uate)?|entry[\s-]?level|no prior experience required|0\s*[-–to]+\s*2 years? experience)\b/i.test(desc) ? "fresher" : null,
    };
  }
  const desc = cleanText(row.descriptionPlain || row.description);
  const title = cleanText(row.text, 240);
  return {
    externalId: String(row.id ?? ""), title, company: source.company_name,
    location: cleanText(row.categories?.location, 240) || null, description: desc,
    url: validHttpUrl(row.hostedUrl), mode: workMode(row.workplaceType, desc),
    employment: employment(row.categories?.commitment, title, desc),
    experience: /\b(intern|junior|entry[\s-]?level|graduate trainee|trainee|new grad|fresher)\b/i.test(title) || /\b(fresher|new grad(?:uate)?|entry[\s-]?level|no prior experience required|0\s*[-–to]+\s*2 years? experience)\b/i.test(desc) ? "fresher" : null,
  };
}
function hasSkill(text: string, skill: string) {
  const escaped = skill.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z0-9+#.])" + escaped + "($|[^a-z0-9+#.])", "i").test(text);
}

function isIndiaEligibleJob(job: { location?: string | null; description?: string | null; mode?: string | null }) {
  const location = String(job.location ?? "");
  const description = String(job.description ?? "").replace(/<[^>]*>/g, " ");
  const combined = location + " " + description + " " + String(job.mode ?? "");
  const indiaLocation = /\b(india|hyderabad|secunderabad|telangana|bengaluru|bangalore|karnataka|chennai|tamil nadu|pune|maharashtra|nellore|andhra pradesh|visakhapatnam|vizag|vijayawada|tirupati|guntur|kurnool|mumbai|gurugram|gurgaon|noida|new delhi|delhi ncr|kolkata|west bengal|ahmedabad|gujarat|kochi|kerala|coimbatore|jaipur|rajasthan|indore|bhopal|lucknow|chandigarh|mohali|bhubaneswar|odisha|mysuru|mysore|mangaluru|mangalore|thiruvananthapuram|madurai|trichy|nagpur|vadodara|surat|dehradun|ranchi|patna|guwahati)\b/i;
  if (indiaLocation.test(location)) return true;
  const remote = /\b(remote|distributed|work from anywhere|anywhere)\b/i.test(combined);
  return remote && /\b(remote(?:\s*[-:]?\s*(?:from|within|in)?\s*)?india|india remote|anywhere in india|indian residents|based in india|within india|india only|india timezone|india time zone|work from india|located in india|india[- ]based)\b/i.test(combined);
}

async function validatePublicBoard(provider: string, boardToken: string): Promise<{ error?: string; rows?: any[]; sample_titles?: string[] }> {
  const endpoint = provider === "greenhouse"
    ? "https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(boardToken) + "/jobs"
    : provider === "lever"
      ? "https://api.lever.co/v0/postings/" + encodeURIComponent(boardToken) + "?mode=json"
      : provider === "smartrecruiters"
        ? "https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(boardToken) + "/postings?limit=100&offset=0&country=in"
        : "https://api.ashbyhq.com/posting-api/job-board/" + encodeURIComponent(boardToken);
  let response = await fetch(endpoint, {
    headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  // Greenhouse has regional public board clusters. Retry EU only after a default
  // endpoint 404; do not retry rate limits, server errors, or network failures.
  if (provider === "greenhouse" && response.status === 404) {
    const regional = await fetch("https://boards-api.eu.greenhouse.io/v1/boards/" + encodeURIComponent(boardToken) + "/jobs", {
      headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (regional.ok) response = regional;
  }
  if (!response.ok) return { error: "Board validation failed (HTTP " + response.status + "). Check the official board token." };
  const payload = await response.json();
  const rows = provider === "greenhouse" || provider === "ashby"
    ? (Array.isArray(payload?.jobs) ? payload.jobs : null)
    : provider === "smartrecruiters"
      ? (Array.isArray(payload?.content) ? payload.content : null)
      : (Array.isArray(payload) ? payload : null);
  if (!rows) return { error: "Provider response was not a valid public jobs feed" };
  return {
    rows,
    sample_titles: rows.slice(0, 3).map((row: any) => cleanText(provider === "greenhouse" || provider === "ashby" ? row.title : provider === "smartrecruiters" ? row.name : row.text, 160)).filter(Boolean),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 500);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Authentication required" }, 401);
  const cronSecret = Deno.env.get("ALDOVRA_CRON_SECRET");
  if (!cronSecret) return json({ error: "Cron authentication is not configured" }, 500);
  const isCron = token === cronSecret;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Scheduled invocations use a dedicated random cron secret stored in Edge Function Secrets.
  // Browser/manual invocations must be a valid signed-in admin user session.
  if (!isCron) {
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
    const { data: adminRow, error: adminError } = await admin.from("admin_users").select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (adminError || !adminRow) return json({ error: "Admin access required" }, 403);
  }

  let requestBody: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) requestBody = parsed;
  } catch {
    return json({ error: "A JSON request body is required" }, 400);
  }

  const action = String(requestBody.action ?? "");
  // Fast, non-mutating probe used to verify cron-secret authentication without running a full sync.
  if (action === "health_check") {
    if (!isCron) return json({ error: "Cron authentication required" }, 401);
    return json({ success: true, auth: "cron", function_version: 30 });
  }
  // The cron secret is reserved for scheduled sync only; source mutations require a real admin session.
  if (isCron && ["validate_source", "save_source", "set_enabled"].includes(action)) {
    return json({ error: "A signed-in admin session is required for source management." }, 403);
  }

  // Validate against fixed official ATS API hosts; never accept arbitrary URLs.
  if (action === "validate_source" || action === "save_source") {
    const provider = requestBody.provider;
    const boardToken = String(requestBody.board_token ?? "").trim();
    const companyName = String(requestBody.company_name ?? "").trim();
    if (!["greenhouse", "lever", "ashby", "smartrecruiters"].includes(String(provider))) return json({ error: "Unsupported provider" }, 400);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(boardToken)) return json({ error: "Invalid board token format" }, 400);
    if (action === "save_source" && (!companyName || companyName.length > 200)) {
      return json({ error: "Company name is required and must be 200 characters or fewer." }, 400);
    }
    try {
      const validation = await validatePublicBoard(provider, boardToken);
      if (validation.error) return json({ success: false, validation_error: true, error: validation.error });
      const rows = validation.rows as any[];
      if (action === "save_source" && rows.length === 0) {
        return json({ success: false, validation_error: true, error: "Board has no current public listings; source was not saved." });
      }
      if (action === "save_source") {
        const { data: saved, error: saveError } = await admin.from("job_sources").upsert({
          provider, board_token: boardToken, company_name: companyName, enabled: true, updated_at: new Date().toISOString(),
        }, { onConflict: "provider,board_token" }).select("id").single();
        if (saveError || !saved) return json({ error: "Board validated but could not be saved." }, 500);
      }
      return json({
        success: true, provider, board_token: boardToken, current_listings: rows.length,
        sample_titles: validation.sample_titles,
        message: action === "save_source" ? "Public board validated and saved." : "Public board API validated. Review the employer's official careers page before saving.",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "network or timeout error";
      return json({
        success: false,
        validation_error: true,
        error: "Could not reach the public board API (" + reason.slice(0, 120) + "). No source was saved.",
      });
    }
  }

  if (action === "set_enabled") {
    const sourceId = String(requestBody.source_id ?? "");
    const enabled = requestBody.enabled;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId) || typeof enabled !== "boolean") {
      return json({ error: "A valid source ID and boolean enabled value are required." }, 400);
    }
    const { error: updateError } = await admin.from("job_sources").update({ enabled, updated_at: new Date().toISOString() }).eq("id", sourceId);
    if (updateError) return json({ error: "Could not update source." }, 500);
    return json({ success: true, source_id: sourceId, enabled });
  }

  // Process a very small rotating batch per invocation to stay within gateway time limits.
  // Oldest/never-synced sources go first; last_synced_at is refreshed after each provider attempt.
  const { data: sources, error: sourceError } = await admin.from("job_sources")
    .select("id,provider,board_token,company_name,last_synced_at").eq("enabled", true).neq("provider", "jobicy")
    .order("last_synced_at", { ascending: true, nullsFirst: true }).limit(100);
  if (sourceError) return json({ error: "Could not load approved sources" }, 500);
  if (!sources?.length) return json({ success: true, message: "No approved job sources are enabled yet.", sources_checked: 0, imported: 0, skipped: 0 });
  const indiaFirstCompanies = new Set(["phonepe", "freshworks", "servicenow", "bosch group", "jitterbit", "razorpay", "swiggy", "zoho", "paytm", "meesho", "flipkart", "zerodha", "groww", "cred", "dream11", "infosys", "tcs", "wipro", "hcltech", "tech mahindra", "browserstack", "chargebee", "juspay", "darwinbox", "storable india", "redwood software", "accordion india", "zenoti", "doordash india", "tide", "sarvam", "100ms"]);
  const selectedSources = [...sources].sort((a: any, b: any) => {
    const at = a.last_synced_at ? Date.parse(a.last_synced_at) : 0;
    const bt = b.last_synced_at ? Date.parse(b.last_synced_at) : 0;
    if (at !== bt) return at - bt;
    const ai = indiaFirstCompanies.has(String(a.company_name ?? "").toLowerCase()) ? 1 : 0;
    const bi = indiaFirstCompanies.has(String(b.company_name ?? "").toLowerCase()) ? 1 : 0;
    return bi - ai || String(a.company_name ?? "").localeCompare(String(b.company_name ?? ""));
  }).slice(0, 2);
  const { data: skills, error: skillsError } = await admin.from("skills").select("id,name").limit(1000);
  if (skillsError) return json({ error: "Could not load skill catalogue" }, 500);
  const skillRows = (skills ?? []).filter((s: any) => String(s.name ?? "").trim().length >= 2);
  let imported = 0, skipped = 0, checked = 0, deactivated = 0;
  const errors: string[] = [];

  for (const source of selectedSources) {
    checked++;
    try {
      const endpoint = source.provider === "greenhouse"
        ? "https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(source.board_token) + "/jobs?content=true"
        : source.provider === "lever"
          ? "https://api.lever.co/v0/postings/" + encodeURIComponent(source.board_token) + "?mode=json&skip=0&limit=100"
          : source.provider === "smartrecruiters"
            ? "https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(source.board_token) + "/postings?limit=100&country=in"
            : "https://api.ashbyhq.com/posting-api/job-board/" + encodeURIComponent(source.board_token) + "?includeCompensation=true";
      let response = await fetch(endpoint, {
        headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      // Mirror validation fallback during scheduled/manual sync so EU-hosted
      // Greenhouse boards do not remain permanently marked as HTTP 404.
      if (source.provider === "greenhouse" && response.status === 404) {
        const regional = await fetch("https://boards-api.eu.greenhouse.io/v1/boards/" + encodeURIComponent(source.board_token) + "/jobs?content=true", {
          headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (regional.ok) response = regional;
      }
      if (!response.ok) throw new Error("Provider returned HTTP " + response.status);
      let payload = await response.json();
      let rows: any[] = source.provider === "greenhouse" || source.provider === "ashby"
        ? (Array.isArray(payload?.jobs) ? payload.jobs : [])
        : source.provider === "smartrecruiters"
          ? (Array.isArray(payload?.content) ? payload.content : [])
          : (Array.isArray(payload) ? payload : []);
      let feedComplete = false;

      // Lever's public postings endpoint is paginated; fetch all pages before
      // using its result to mark previously imported jobs as closed.
      if (source.provider === "lever") {
        let offset = rows.length;
        let pageCount = 1;
        feedComplete = Array.isArray(payload) && rows.length < 100;
        while (!feedComplete && pageCount < 25) {
          const pageUrl = "https://api.lever.co/v0/postings/" + encodeURIComponent(source.board_token) +
            "?mode=json&skip=" + offset + "&limit=100";
          const pageResponse = await fetch(pageUrl, {
            headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (!pageResponse.ok) break;
          const pageRows = await pageResponse.json();
          if (!Array.isArray(pageRows)) break;
          rows.push(...pageRows);
          pageCount++;
          offset += pageRows.length;
          if (pageRows.length < 100) feedComplete = true;
          if (pageRows.length === 0) feedComplete = true;
        }
      } else if (source.provider === "greenhouse") {
        // Greenhouse returns meta.total; only trust a snapshot that covers it.
        feedComplete = Array.isArray(payload?.jobs) &&
          (typeof payload?.meta?.total !== "number" || rows.length >= payload.meta.total);
      } else if (source.provider === "ashby") {
        // Ashby's public posting API is the current published job-board feed.
        feedComplete = Array.isArray(payload?.jobs) && Boolean(payload?.apiVersion);
      } else if (source.provider === "smartrecruiters") {
        const expectedTotal = typeof payload?.totalFound === "number" ? payload.totalFound : null;
        feedComplete = Array.isArray(payload?.content) && expectedTotal !== null;
        let offset = rows.length;
        let pageCount = 1;
        while (feedComplete && rows.length < (expectedTotal as number) && pageCount < 25) {
          const pageUrl = "https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(source.board_token) +
            "/postings?limit=100&offset=" + offset + "&country=in";
          const pageResponse = await fetch(pageUrl, {
            headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (!pageResponse.ok) { feedComplete = false; break; }
          const pagePayload = await pageResponse.json();
          if (!Array.isArray(pagePayload?.content) || pagePayload.totalFound !== expectedTotal) {
            feedComplete = false;
            break;
          }
          const pageRows = pagePayload.content as any[];
          if (!pageRows.length && rows.length < (expectedTotal as number)) { feedComplete = false; break; }
          rows.push(...pageRows);
          offset += pageRows.length;
          pageCount++;
        }
        feedComplete = feedComplete && rows.length >= (expectedTotal as number);
      }

      let sourceCount = 0;
      let sourceFailureCount = 0;
      const indiaPriority = (raw: any) => {
        const job = normalize(source, raw);
        const loc = String(job.location || "").toLowerCase();
        if (/hyderabad|secunderabad|telangana/.test(loc)) return 120;
        if (/bengaluru|bangalore/.test(loc)) return 110;
        if (/\bnellore\b/.test(loc)) return 105;
        if (/\bpune\b|chennai/.test(loc)) return 100;
        if (/india|mumbai|gurugram|gurgaon|noida|visakhapatnam|vijayawada|tirupati|kochi|coimbatore|jaipur|indore/.test(loc)) return 75;
        return 10;
      };
      const candidateRows = rows
        .filter((raw: any) => source.provider !== "ashby" || raw?.isListed !== false)
        .filter((raw: any) => source.provider === "smartrecruiters" || isIndiaEligibleJob(normalize(source, raw)))
        .sort((a: any, b: any) => indiaPriority(b) - indiaPriority(a));
      for (const raw of candidateRows.slice(0, source.provider === "smartrecruiters" ? 15 : 150)) {
        if (source.provider === "ashby" && raw?.isListed === false) { skipped++; continue; }
        let row = raw;
        if (source.provider === "smartrecruiters") {
          const detailResponse = await fetch("https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(source.board_token) + "/postings/" + encodeURIComponent(String(raw.id || raw.uuid || "")), {
            headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (!detailResponse.ok) {
            skipped++;
            sourceFailureCount++;
            errors.push(source.company_name + ": SmartRecruiters detail returned HTTP " + detailResponse.status);
            continue;
          }
          row = await detailResponse.json();
        }
        const job = normalize(source, row);
        if (!isIndiaEligibleJob(job)) { skipped++; continue; }
        if (!job.externalId || !job.title || !job.url || !job.description) {
          skipped++;
          sourceFailureCount++;
          errors.push(source.company_name + ": job detail missing external ID, title, description, or application URL");
          continue;
        }
        const searchable = (job.title + " " + job.description).toLowerCase();
        const matchedSkills = skillRows.filter((s: any) => hasSkill(searchable, String(s.name))).slice(0, 20);
        // Keep valid employer listings even when the local skill catalogue has no direct match.
        // The dashboard labels inferred matches as estimates and leaves unclassified jobs browseable.
        // Empty skill arrays are supported by the atomic upsert; they must not imply a skill match.
        const { data: savedId, error: atomicSaveError } = await admin.rpc("upsert_job_opportunity_atomic", {
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
        if (atomicSaveError || !savedId) {
          skipped++;
          sourceFailureCount++;
          const saveReason = atomicSaveError?.message ? " (" + String(atomicSaveError.message).slice(0, 120) + ")" : "";
          errors.push(source.company_name + ": atomic job/skill save failed" + saveReason);
          continue;
        }
        imported++; sourceCount++;
      }
      // Reconcile active records against the full provider feed; never use age alone.
      // Importing the top 150 is a throughput cap, not the set of jobs still live.
      if (feedComplete) {
        const liveExternalIds = (source.provider === "smartrecruiters"
          ? rows.map((raw: any) => String(raw?.id || raw?.uuid || ""))
          : candidateRows.map((raw: any) => String(normalize(source, raw).externalId || "")))
          .filter((id: string) => Boolean(id));
        const { data: reconciledCount, error: reconcileError } = await admin.rpc("reconcile_job_source_feed", {
          p_source_provider: source.provider,
          p_board_token: source.board_token,
          p_live_external_ids: liveExternalIds,
          p_feed_complete: true,
        });
        if (reconcileError) {
          sourceFailureCount++;
          errors.push(source.company_name + ": active job reconciliation failed");
        } else {
          deactivated += Number(reconciledCount || 0);
        }
      } else {
        sourceFailureCount++;
        errors.push(source.company_name + ": provider feed was incomplete; skipped closed-job reconciliation");
      }
      await admin.from("job_sources").update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: sourceFailureCount > 0 ? "partial: " + sourceFailureCount + " import/reconciliation issue(s)" : "success",
        last_sync_count: sourceCount, updated_at: new Date().toISOString(),
      }).eq("id", source.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown provider error";
      errors.push(source.company_name + ": " + message.slice(0, 180));
      await admin.from("job_sources").update({
        last_synced_at: new Date().toISOString(), last_sync_status: "error: " + message.slice(0, 180),
        updated_at: new Date().toISOString(),
      }).eq("id", source.id);
    }
  }
  return json({ success: errors.length === 0, sources_checked: checked, imported, skipped, deactivated, errors });
});
