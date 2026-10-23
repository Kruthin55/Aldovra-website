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
const clean = (v: unknown, max = 6000) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const validUrl = (v: unknown) => {
  try { const u = new URL(String(v ?? "")); return u.protocol === "https:" ? u.href : null; }
  catch { return null; }
};
const isFreshersRole = (j: any) => {
  const title = clean(j.title, 240);
  const text = (title + " " + clean(j.description)).toLowerCase();
  if (/\b(senior|staff|principal|lead|manager|director|head|chief|architect|vice president)\b/i.test(title)) return false;
  if (/\b[1-9]\d*\s*(?:\+\s*)?(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+)?experience\b/i.test(text)) return false;
  return /\b(fresher|freshers|intern|internship|graduate trainee|management trainee|trainee|new graduate|entry[- ]level|campus hire|apprentice|apprenticeship|early career)\b/i.test(title)
    || /\b(no experience required|no prior experience|open to freshers|suitable for freshers|recent graduates? welcome|0 years? of experience)\b/i.test(text);
};
const todayIST = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const promptFor = (today: string) => `Find job openings that were first published on ${today} (India date, Asia/Kolkata) and are suitable for freshers or candidates with zero professional experience. Prioritize India, especially Hyderabad, Bengaluru, Pune, Chennai, and remote roles explicitly open to candidates in India. Use employer career pages and official ATS listings wherever possible. Include only currently open jobs with a direct original application URL and evidence of the original posting date. Exclude search result pages, expired roles, roles requiring professional experience, and any listing whose posting date cannot be verified as ${today}. Return ONLY valid JSON: {"jobs":[{"title":"...","company":"...","location":"...","workMode":"Remote|Hybrid|On-site|Unknown","employmentType":"Internship|Full-time|Apprenticeship|Unknown","description":"brief factual summary","applicationUrl":"https://...","postingDate":"YYYY-MM-DD","sourceName":"employer or official board"}]}. Maximum 12 jobs. Never invent jobs, dates, employers, or URLs. If no verifiable jobs, return an empty jobs array.`;
async function openAIJobs(key: string, prompt: string) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.5",
      tools: [{ type: "web_search" }],
      input: prompt,
      max_output_tokens: 6500,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error("OpenAI search returned HTTP " + res.status);
  const body = await res.json();
  const output = (body.output ?? []).filter((x: any) => x.type === "message")
    .flatMap((x: any) => x.content ?? []).filter((x: any) => x.type === "output_text")
    .map((x: any) => x.text).join("\n");
  return parseJobs(output);
}
async function geminiJobs(key: string, prompt: string) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(key), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error("Gemini search returned HTTP " + res.status);
  const body = await res.json();
  const output = (body.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("\n");
  return parseJobs(output);
}
function parseJobs(raw: string) {
  const text = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  const parsed = JSON.parse(text);
  return Array.isArray(parsed?.jobs) ? parsed.jobs : [];
}
async function hash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const origin = req.headers.get("Origin");
  if (origin && origin !== "https://aldovra.com") return json({ error: "Origin not allowed" }, 403);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 500);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token === serviceKey) return json({ error: "A student session is required" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!openAIKey && !geminiKey) return json({ error: "AI search is not configured" }, 503);
  const { data: gate, error: gateError } = await admin.rpc("claim_job_discovery_refresh", { p_user_id: authData.user.id });
  if (gateError) return json({ error: "Refresh limit is not configured" }, 503);
  const decision = Array.isArray(gate) ? gate[0] : gate;
  if (!decision?.allowed) return json({ error: "Please wait before refreshing jobs again.", retry_after_seconds: Number(decision?.retry_after_seconds ?? 300) }, 429);

  const prompt = promptFor(todayIST);
  const tasks = [
    openAIKey ? openAIJobs(openAIKey, prompt).then((jobs) => ({ provider: "openai_search", jobs })).catch((e) => ({ provider: "openai_search", jobs: [], error: String(e?.message ?? e).slice(0, 160) })) : Promise.resolve({ provider: "openai_search", jobs: [], skipped: true }),
    geminiKey ? geminiJobs(geminiKey, prompt).then((jobs) => ({ provider: "gemini_search", jobs })).catch((e) => ({ provider: "gemini_search", jobs: [], error: String(e?.message ?? e).slice(0, 160) })) : Promise.resolve({ provider: "gemini_search", jobs: [], skipped: true }),
  ];
  const results = await Promise.all(tasks);
  const all = new Map<string, any>();
  for (const result of results) for (const job of result.jobs) {
    const applicationUrl = validUrl(job.applicationUrl);
    if (!applicationUrl || job.postingDate !== todayIST || !isFreshersRole(job)) continue;
    const key = applicationUrl.toLowerCase().split("?")[0].replace(/\/$/, "");
    const previous = all.get(key);
    if (!previous || (clean(job.description).length > clean(previous.description).length)) all.set(key, { ...job, applicationUrl });
  }
  const { data: skills } = await admin.from("skills").select("id,name").limit(1000);
  let imported = 0, skipped = 0;
  const errors = results.filter((r: any) => r.error).map((r: any) => r.provider + ": " + r.error);
  for (const job of all.values()) {
    const company = clean(job.company, 200), title = clean(job.title, 240);
    const description = clean(job.description, 5000);
    if (!company || !title || !description || !job.postingDate) { skipped++; continue; }
    const externalId = await hash(job.applicationUrl);
    const searchable = (title + " " + description).toLowerCase();
    const matched = (skills ?? []).filter((s: any) => {
      const name = String(s.name ?? "").trim();
      return name.length > 1 && new RegExp("(^|[^a-z0-9+#.])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z0-9+#.])", "i").test(searchable);
    }).slice(0, 20);
    const { data: saved, error } = await admin.rpc("upsert_job_opportunity_atomic", {
      p_job: {
        source_provider: "ai_search",
        source_board_token: "daily-ai-search",
        source_external_id: externalId,
        source_url: job.applicationUrl,
        source_last_seen_at: new Date().toISOString(),
        title, company_name: company, location: clean(job.location, 240) || "India / location not specified",
        work_mode: ["Remote", "Hybrid", "On-site"].includes(job.workMode) ? job.workMode : null,
        employment_type: ["Internship", "Full-time", "Apprenticeship"].includes(job.employmentType) ? job.employmentType : null,
        description: description + "\n\nSource-reported posting date: " + job.postingDate + ". Source: " + clean(job.sourceName, 120),
        experience_level: "fresher",
        application_url: job.applicationUrl,
      },
      p_skill_ids: matched.map((s: any) => Number(s.id)),
    });
    if (error || !saved) { skipped++; if (errors.length < 8) errors.push("One listing could not be saved."); }
    else imported++;
  }
  return json({
    success: errors.length === 0,
    india_date: todayIST,
    sources_checked: results.filter((r: any) => !r.skipped).length,
    candidates_verified_today: all.size,
    imported, skipped, errors,
    message: all.size ? "Only source-reported today's fresher listings were considered." : "No jobs with a verifiable posting date for today were found.",
  });
});
