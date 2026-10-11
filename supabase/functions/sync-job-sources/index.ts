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
  if (source.provider === "greenhouse") {
    const desc = cleanText(row.content);
    return {
      externalId: String(row.id ?? ""), title: cleanText(row.title, 240), company: source.company_name,
      location: cleanText(row.location?.name, 240) || null, description: desc,
      url: validHttpUrl(row.absolute_url), mode: workMode(null, desc),
      employment: employment(null, row.title, desc),
      experience: /intern|entry.?level|fresher|graduate/i.test(row.title + " " + desc) ? "fresher" : null,
    };
  }
  const desc = cleanText(row.descriptionPlain || row.description);
  const title = cleanText(row.text, 240);
  return {
    externalId: String(row.id ?? ""), title, company: source.company_name,
    location: cleanText(row.categories?.location, 240) || null, description: desc,
    url: validHttpUrl(row.hostedUrl), mode: workMode(row.workplaceType, desc),
    employment: employment(row.categories?.commitment, title, desc),
    experience: /intern|entry.?level|fresher|graduate/i.test(title + " " + desc) ? "fresher" : null,
  };
}
function hasSkill(text: string, skill: string) {
  const escaped = skill.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z0-9+#.])" + escaped + "($|[^a-z0-9+#.])", "i").test(text);
}

async function validatePublicBoard(provider: string, boardToken: string): Promise<{ error?: string; rows?: any[]; sample_titles?: string[] }> {
  const endpoint = provider === "greenhouse"
    ? "https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(boardToken) + "/jobs"
    : "https://api.lever.co/v0/postings/" + encodeURIComponent(boardToken) + "?mode=json";
  const response = await fetch(endpoint, {
    headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return { error: "Board validation failed (HTTP " + response.status + "). Check the official board token." };
  const payload = await response.json();
  const rows = provider === "greenhouse"
    ? (Array.isArray(payload?.jobs) ? payload.jobs : null)
    : (Array.isArray(payload) ? payload : null);
  if (!rows) return { error: "Provider response was not a valid public jobs feed" };
  return {
    rows,
    sample_titles: rows.slice(0, 3).map((row: any) => cleanText(provider === "greenhouse" ? row.title : row.text, 160)).filter(Boolean),
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
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Scheduled invocations may use the service-role secret stored in Supabase Vault.
  // All browser/manual invocations must be a valid admin user session.
  if (token !== serviceKey) {
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
  // The service-role bearer is reserved for scheduled sync only; admin source mutations require a real admin session.
  if (token === serviceKey && ["validate_source", "save_source", "set_enabled"].includes(action)) {
    return json({ error: "A signed-in admin session is required for source management." }, 403);
  }

  // Validate against fixed official ATS API hosts; never accept arbitrary URLs.
  if (action === "validate_source" || action === "save_source") {
    const provider = requestBody.provider;
    const boardToken = String(requestBody.board_token ?? "").trim();
    const companyName = String(requestBody.company_name ?? "").trim();
    if (provider !== "greenhouse" && provider !== "lever") return json({ error: "Unsupported provider" }, 400);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(boardToken)) return json({ error: "Invalid board token format" }, 400);
    if (action === "save_source" && (!companyName || companyName.length > 200)) {
      return json({ error: "Company name is required and must be 200 characters or fewer." }, 400);
    }
    try {
      const validation = await validatePublicBoard(provider, boardToken);
      if (validation.error) return json({ error: validation.error }, 422);
      const rows = validation.rows as any[];
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
    } catch {
      return json({ error: "Could not reach the public board API. No source was saved." }, 422);
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

  const { data: sources, error: sourceError } = await admin.from("job_sources")
    .select("id,provider,board_token,company_name").eq("enabled", true).limit(25);
  if (sourceError) return json({ error: "Could not load approved sources" }, 500);
  if (!sources?.length) return json({ success: true, message: "No approved job sources are enabled yet.", sources_checked: 0, imported: 0, skipped: 0 });
  const { data: skills, error: skillsError } = await admin.from("skills").select("id,name").limit(1000);
  if (skillsError) return json({ error: "Could not load skill catalogue" }, 500);
  const skillRows = (skills ?? []).filter((s: any) => String(s.name ?? "").trim().length >= 2);
  let imported = 0, skipped = 0, checked = 0;
  const errors: string[] = [];

  for (const source of sources) {
    checked++;
    try {
      const endpoint = source.provider === "greenhouse"
        ? "https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(source.board_token) + "/jobs?content=true"
        : "https://api.lever.co/v0/postings/" + encodeURIComponent(source.board_token) + "?mode=json";
      const response = await fetch(endpoint, {
        headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Provider returned HTTP " + response.status);
      const payload = await response.json();
      const rows = source.provider === "greenhouse" ? (Array.isArray(payload?.jobs) ? payload.jobs : []) : (Array.isArray(payload) ? payload : []);
      let sourceCount = 0;
      for (const raw of rows.slice(0, 500)) {
        const job = normalize(source, raw);
        if (!job.externalId || !job.title || !job.url || !job.description) { skipped++; continue; }
        const searchable = (job.title + " " + job.description).toLowerCase();
        const matchedSkills = skillRows.filter((s: any) => hasSkill(searchable, String(s.name))).slice(0, 20);
        // Do not create high-scoring "skill-free" matches from unclassified descriptions.
        if (!matchedSkills.length) { skipped++; continue; }
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
          errors.push(source.company_name + ": atomic job/skill save failed");
          continue;
        }
        imported++; sourceCount++;
      }
      // Expire stale listings only after a successful provider response.
      const staleCutoff = new Date(Date.now() - 14 * 86400000).toISOString();
      const { error: expireError } = await admin.from("opportunities").update({ active: false })
        .eq("source_provider", source.provider).eq("source_board_token", source.board_token).lt("source_last_seen_at", staleCutoff);
      if (expireError) errors.push(source.company_name + ": stale-job expiry failed");
      await admin.from("job_sources").update({
        last_synced_at: new Date().toISOString(), last_sync_status: "success",
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
  return json({ success: errors.length === 0, sources_checked: checked, imported, skipped, errors });
});
