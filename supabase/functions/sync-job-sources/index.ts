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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 500);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Authentication required" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
  const { data: adminRow, error: adminError } = await admin.from("admin_users").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (adminError || !adminRow) return json({ error: "Admin access required" }, 403);

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
        const { data: saved, error: saveError } = await admin.from("opportunities").upsert({
          source_provider: source.provider, source_board_token: source.board_token, source_external_id: job.externalId,
          source_url: job.url, source_last_seen_at: new Date().toISOString(),
          title: job.title, company_name: job.company, location: job.location,
          work_mode: job.mode, employment_type: job.employment,
          description: job.description, experience_level: job.experience,
          application_url: job.url, active: true,
        }, { onConflict: "source_provider,source_external_id" }).select("id").single();
        if (saveError || !saved) { skipped++; continue; }
        const { error: clearError } = await admin.from("opportunity_skills").delete().eq("opportunity_id", saved.id);
        if (clearError) { skipped++; continue; }
        const { error: skillSaveError } = await admin.from("opportunity_skills").insert(matchedSkills.map((s: any) => ({
          opportunity_id: saved.id, skill_id: s.id, required: true, importance: "required",
        })));
        if (skillSaveError) { skipped++; continue; }
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
