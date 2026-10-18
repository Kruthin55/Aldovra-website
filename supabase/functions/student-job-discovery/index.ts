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
function isIndiaEligibleJob(job: { location?: string | null; description?: string | null; mode?: string | null }) {
  const location = String(job.location ?? "");
  const description = String(job.description ?? "").replace(/<[^>]*>/g, " ");
  const combined = location + " " + description + " " + String(job.mode ?? "");
  const indiaLocation = /\b(india|hyderabad|secunderabad|telangana|bengaluru|bangalore|karnataka|chennai|tamil nadu|pune|maharashtra|nellore|andhra pradesh|visakhapatnam|vizag|vijayawada|tirupati|guntur|kurnool|mumbai|gurugram|gurgaon|noida|new delhi|delhi ncr|kolkata|west bengal|ahmedabad|gujarat|kochi|kerala|coimbatore|jaipur|rajasthan|indore|bhopal|lucknow|chandigarh|mohali|bhubaneswar|odisha|mysuru|mysore|mangaluru|mangalore|thiruvananthapuram|madurai|trichy|nagpur|vadodara|surat|dehradun|ranchi|patna|guwahati)\b/i;
  if (indiaLocation.test(location)) return true;
  const remote = /\b(remote|distributed|work from anywhere|anywhere)\b/i.test(combined);
  return remote && /\b(remote(?:\s*[-:]?\s*(?:from|within|in)?\s*)?india|india remote|anywhere in india|indian residents|based in india|within india|india only|india timezone|india time zone|work from india|located in india|india[- ]based)\b/i.test(combined);
}

function isFresherEligibleJob(job: { title?: string | null; description?: string | null }) {
  const title = String(job.title ?? "").replace(/<[^>]*>/g, " ");
  const description = String(job.description ?? "").replace(/<[^>]*>/g, " ");
  const text = (title + " " + description).replace(/\s+/g, " ").trim();
  // Reject positive experience requirements regardless of phrasing or title.
  const positiveRange = /\b([1-9]\d*)\s*(?:-|–|to)\s*([1-9]\d*)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const positivePlus = /\b[1-9]\d*\s*\+\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const positiveYears = /\b(?:minimum|min\.?|at least|over|more than|must have|required minimum of)\s*(?:of\s*)?[1-9]\d*\s*(?:\+\s*)?(?:years?|yrs?)\b/i;
  const yearsExperience = /\b[1-9]\d*\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const seniorTitle = /\b(senior|staff|principal|lead|manager|director|head|chief|vice president|architect|mid[- ]level)\b/i;
  if (positiveRange.test(text) || positivePlus.test(text) || positiveYears.test(text) || yearsExperience.test(text) || seniorTitle.test(title)) return false;
  const titleSignal = /\b(fresher|freshers|intern|internship|graduate trainee|management trainee|trainee|new grad(?:uate)?|entry[- ]level|associate(?: engineer| developer| analyst)?|campus hire|campus hiring|graduate program|graduate programme|apprentice|apprenticeship)\b/i.test(title);
  const noExperienceSignal = /\b(no experience required|no prior experience required|without prior experience|0 years? of experience|zero years? of experience|fresh graduates? (?:are )?welcome|suitable for freshers|open to freshers|recent graduates? encouraged|campus recruitment|early career program|early careers program)\b/i.test(text);
  return titleSignal || noExperienceSignal;
}

function normalize(source: any, row: any) {
  let externalId = "", title = "", location = "", description = "", company = "", url: string | null = null;
  let mode: string | null = null, type: string | null = null;
  if (source.provider === "smartrecruiters") {
    const sections = Array.isArray(row.jobAd?.sections) ? row.jobAd.sections.map((section: any) => section.text || section.content || section.body || "").join(" ") : "";
    const loc = row.location || {};
    const countryRaw = String(loc.country || "");
    const country = /^(in|india)$/i.test(countryRaw) || String(loc.countryCode || "").toLowerCase() === "in" ? "India" : countryRaw;
    const locationText = [loc.city, loc.region, country].filter(Boolean).join(", ");
    description = cleanText(row.jobAd?.jobDescription || row.jobDescription || sections || row.description);
    title = cleanText(row.name || row.title, 240);
    company = cleanText(row.company?.name || source.company_name, 200);
    location = cleanText(locationText, 240);
    externalId = String(row.id || row.uuid || "");
    url = validHttpUrl(row.applyUrl || row.postingUrl || row.jobAd?.applyUrl);
    mode = workMode(loc.remote ? "remote" : null, description + " " + locationText);
    type = employment(row.typeOfEmployment?.label, title, description);
  } else if (source.provider === "jobicy") {
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
    .select("id,provider,board_token,company_name,cursor_token,last_sync_status,last_synced_at")
    .eq("enabled", true).in("provider", ["smartrecruiters", "greenhouse", "lever", "ashby"])
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(30);
  if (sourceError) return json({ error: "Could not load approved sources" }, 500);
  if (!sources?.length) return json({ success: true, sources_checked: 0, imported: 0, skipped: 0, message: "No enabled sources yet." });
  // Prioritize verified Indian employers first; keep other official ATS boards as breadth sources.
  const indiaFirstCompanies = new Set(["phonepe", "freshworks", "servicenow", "bosch group", "jitterbit", "razorpay", "swiggy", "zoho", "freshworks", "paytm", "meesho", "flipkart", "zerodha", "groww", "cred", "dream11", "infosys", "tcs", "wipro", "hcltech", "tech mahindra", "browserstack", "chargebee", "juspay", "darwinbox", "storable india", "redwood software", "accordion india", "zenoti", "doordash india", "tide", "cred", "sarvam", "100ms"]);
  const orderedCompanySources = sources.filter((s: any) => s.provider !== "jobicy").sort((a: any, b: any) => {
    const ai = indiaFirstCompanies.has(String(a.company_name ?? "").toLowerCase()) ? 1 : 0;
    const bi = indiaFirstCompanies.has(String(b.company_name ?? "").toLowerCase()) ? 1 : 0;
    const af = String(a.last_sync_status ?? "").startsWith("error: Provider HTTP 404") ? 1 : 0;
    const bf = String(b.last_sync_status ?? "").startsWith("error: Provider HTTP 404") ? 1 : 0;
    return af - bf || bi - ai || Number(!!a.last_synced_at) - Number(!!b.last_synced_at);
  });
  // Only ingest sources whose public listings may be reused on a third-party job platform.
  const selectedSources = orderedCompanySources.slice(0, 12);

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
        : source.provider === "smartrecruiters"
          ? "https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(source.board_token) + "/postings?limit=100&country=in"
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
      } else if (source.provider === "smartrecruiters") {
        if (!payload || !Array.isArray(payload.content)) throw new Error("Unexpected SmartRecruiters payload shape");
        rows = payload.content;
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
      // Prefer Hyderabad-area postings within each board before applying the per-source cap.
      // Otherwise a board with many global/Bengaluru roles can hide Hyderabad openings
      // simply because those roles occur later in the provider response.
      const rawLocation = (raw: any) => source.provider === "smartrecruiters"
        ? [raw.location?.city, raw.location?.region, raw.location?.country, String(raw.location?.countryCode || "").toLowerCase() === "in" ? "India" : ""].filter(Boolean).join(" ")
        : source.provider === "greenhouse"
          ? String(raw.location?.name ?? "")
          : source.provider === "ashby"
            ? String(raw.location ?? "") + " " + (Array.isArray(raw.secondaryLocations) ? raw.secondaryLocations.map((x: any) => String(x.location ?? "")).join(" ") : "")
            : source.provider === "lever"
              ? String(raw.categories?.location ?? "")
              : String(raw.jobGeo ?? "");
      const localPriority = (raw: any) => {
        const loc = rawLocation(raw).toLowerCase();
        if (/hyderabad|secunderabad|telangana/.test(loc)) return 120;
        if (/bengaluru|bangalore/.test(loc)) return 110;
        if (/\bnellore\b/.test(loc)) return 105;
        if (/\bpune\b|chennai/.test(loc)) return 100;
        if (/india|mumbai|gurugram|gurgaon|noida|visakhapatnam|vijayawada|tirupati|kochi|coimbatore|jaipur|indore/.test(loc)) return 75;
        if (source.provider === "jobicy") return 10;
        return 0;
      };
      const indiaRows = rows.filter((raw: any) => source.provider !== "ashby" || raw?.isListed !== false).filter((raw: any) => { const job = normalize(source, raw); return isIndiaEligibleJob(job) && isFresherEligibleJob(job); });
      const cappedRows = [...indiaRows].sort((a: any, b: any) => localPriority(b) - localPriority(a)).slice(0, source.provider === "smartrecruiters" ? 10 : 15);
      for (const raw of cappedRows) {
        if (source.provider === "ashby" && raw?.isListed === false) { skipped++; continue; }
        let row = raw;
        if (source.provider === "smartrecruiters") {
          const detailResponse = await fetch("https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(source.board_token) + "/postings/" + encodeURIComponent(String(raw.id || raw.uuid || "")), {
            headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (!detailResponse.ok) { skipped++; continue; }
          row = await detailResponse.json();
        }
        const job = normalize(source, row);
        if (!isIndiaEligibleJob(job) || !isFresherEligibleJob(job)) { skipped++; continue; }
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
