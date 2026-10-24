// Amazon India early-career jobs from the public amazon.jobs search JSON.
// Runs on its own schedule so a failure here never affects the main job sync.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const cleanText = (value: unknown, max = 8000) =>
  String(value ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim().slice(0, max);

const PAGE_SIZE = 100;
const PAGES_PER_RUN = 3;

/* ---- Experience classifier (kept in sync with sync-job-sources) ---- */
function normalizeExperienceText(text: string) {
  return text.replace(/\byears?\s*\(\s*s\s*\)/gi, "years").replace(/\byrs?\s*\(\s*s\s*\)/gi, "yrs");
}
function experienceRejected(rawTitle: string, rawDescription: string) {
  const title = normalizeExperienceText(rawTitle);
  const text = normalizeExperienceText((rawTitle + " " + rawDescription).replace(/\s+/g, " ").trim());
  const positiveRange = /\b([1-9]\d*)\s*(?:-|–|to)\s*([1-9]\d*)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const positivePlus = /\b[1-9]\d*\s*\+\s*(?:years?|yrs?)\b/i;
  const positiveYears = /\b(?:minimum|min\.?|at least|over|more than|must have|required minimum of)\s*(?:of\s*)?[1-9]\d*\s*(?:\+\s*)?(?:years?|yrs?)\b/i;
  const yearsExperience = /(?<!\b0\s*(?:-|–|to)\s*)\b[1-9]\d*\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const labelledYears = /\b(?:years? of (?:relevant |work |professional |total )?experience|(?:total |work |relevant )?experience(?: required)?)\s*[:\-–]\s*(?:minimum\s*|min\.?\s*|at least\s*)?[1-9]\d*\s*(?:\+|(?:-|–|to)\s*\d+)?\s*(?:years?|yrs?)?\b/i;
  const seniorTitle = /\b(senior|sr\.?|staff|principal|lead|team leader|team lead|manager|director|head|chief|vice president|architect|mid[- ]level|ii|iii|iv|level 3|level 4|level 5)(?=\b|\s|$)/i;
  return positiveRange.test(text) || positivePlus.test(text) || positiveYears.test(text) || yearsExperience.test(text) || labelledYears.test(text) || seniorTitle.test(title);
}
const FRESHER_TITLE = /\b(fresher|freshers|intern|internship|graduate|trainee|new grad(?:uate)?|entry[- ]level|junior|university|campus|apprentice(?:ship)?|associate|sde\s*i\b|software development engineer\s*i\b|engineer\s+i\b|analyst\s+i\b)\b/i;
const GENERIC_EARLY_TITLE = /\b(software (?:development )?engineer|software developer|developer|analyst|data engineer|qa engineer|test engineer|quality engineer|support engineer|technical support|customer support|consultant|engineer|executive|coordinator|representative)\b/i;
function classify(job: { title: string; qualifications: string; description: string; isIntern: boolean; university: boolean }): "fresher" | "Entry level" | null {
  if (experienceRejected(job.title, job.qualifications)) return null;
  if (job.isIntern || job.university || FRESHER_TITLE.test(job.title)) return "fresher";
  if (/\b0\s*(?:-|–|to)\s*[12]\s*(?:years?|yrs?)\b/i.test(job.qualifications + " " + job.description)) return "fresher";
  if (GENERIC_EARLY_TITLE.test(job.title) && job.qualifications.length > 40) return "Entry level";
  return null;
}

/* ---- Skill tagging (same aliases as the main sync) ---- */
const SKILL_ALIASES: Record<string, string[]> = {
  "javascript": ["js", "es6", "ecmascript"], "node.js": ["node", "nodejs"], "react": ["react.js", "reactjs"],
  "next.js": ["nextjs"], "vue.js": ["vue", "vuejs"], "express.js": ["express", "expressjs"],
  "postgresql": ["postgres", "psql"], "mongodb": ["mongo"], "kubernetes": ["k8s"],
  "google cloud": ["gcp", "google cloud platform"], "aws": ["amazon web services"], "azure": ["microsoft azure"],
  "machine learning": ["ml", "machine-learning"], "deep learning": ["neural networks", "pytorch", "tensorflow"],
  "nlp": ["natural language processing"], "generative ai": ["genai", "gen ai", "llm", "llms", "large language models"],
  "data analytics": ["data analysis", "data analyst"], "data science": ["data scientist"], "power bi": ["powerbi"],
  "spring boot": ["springboot", "spring framework"], "c++": ["cpp"], "go": ["golang"],
  "cybersecurity": ["cyber security", "information security", "infosec"], "manual testing": ["manual qa", "manual tester"],
  "api testing": ["postman", "rest assured"], "microservices": ["microservice", "micro-services"], "angular": ["angularjs"],
};
const SPECIAL: Record<string, RegExp[]> = {
  "go": [/\bgolang\b/i, /(?:^|[,\/(]\s*)Go\b(?!-)/, /\bGo (?:language|programming)\b/],
  "c": [/(?:^|[,\/(]\s*)C\b(?![+#-])/, /\bC (?:programming|language)\b/],
};
const esc = (v: string) => v.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
function hasSkill(text: string, skill: string) {
  const key = skill.trim().toLowerCase();
  if (SPECIAL[key]) return SPECIAL[key].some((re) => re.test(text));
  return [key, ...(SKILL_ALIASES[key] || [])].some((term) => new RegExp("(^|[^a-z0-9+#.])" + esc(term) + "($|[^a-z0-9+#.])", "i").test(text));
}

function postingDate(value: unknown): string | null {
  const d = new Date(String(value || ""));
  if (!Number.isFinite(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  return iso <= new Date().toISOString().slice(0, 10) ? iso : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("ALDOVRA_CRON_SECRET");
  if (!url || !serviceKey || !cronSecret) return json({ error: "Server configuration missing" }, 500);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token !== cronSecret) return json({ error: "Cron authentication required" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // The amazon row stays enabled=false so the main sync skips it; this function
  // owns its state. Set its cursor_token to "paused" to stop syncing.
  const { data: source } = await admin.from("job_sources").select("id,cursor_token")
    .eq("provider", "amazon").eq("board_token", "india").maybeSingle();
  if (!source) return json({ error: "Amazon source row missing" }, 500);
  if (source.cursor_token === "paused") return json({ success: true, message: "Amazon sync paused" });

  const { data: skills } = await admin.from("skills").select("id,name").limit(1000);
  const skillRows = (skills ?? []).filter((s: any) => String(s.name ?? "").trim().length >= 2);

  let offset = Number.parseInt(String(source.cursor_token || "0"), 10);
  if (!Number.isSafeInteger(offset) || offset < 0) offset = 0;
  let total = 0, fetched = 0, imported = 0, skipped = 0;
  const errors: string[] = [];
  try {
    for (let page = 0; page < PAGES_PER_RUN; page++) {
      const response = await fetch(
        "https://www.amazon.jobs/en/search.json?country=IND&sort=recent&result_limit=" + PAGE_SIZE + "&offset=" + offset,
        { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; AldovraJobDiscovery/1.0; +https://aldovra.com)" }, signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) throw new Error("Amazon search returned HTTP " + response.status);
      const payload = await response.json();
      total = Number(payload?.hits) || 0;
      const jobs: any[] = Array.isArray(payload?.jobs) ? payload.jobs : [];
      fetched += jobs.length;
      for (const raw of jobs) {
        const title = cleanText(raw.title, 240);
        const qualifications = cleanText(raw.basic_qualifications, 3000);
        const description = cleanText(raw.description, 5000);
        const level = classify({ title, qualifications, description, isIntern: raw.is_intern === true || raw.is_intern === "true", university: raw.university_job === true || raw.university_job === "true" });
        if (!level || !raw.id_icims || !raw.job_path) { skipped++; continue; }
        const jobUrl = "https://www.amazon.jobs" + String(raw.job_path);
        const fullDescription = cleanText(description + " Basic qualifications: " + qualifications + (raw.preferred_qualifications ? " Preferred qualifications: " + cleanText(raw.preferred_qualifications, 2000) : ""), 8000);
        const searchable = (title + " " + fullDescription).toLowerCase();
        const matched = skillRows.filter((s: any) => hasSkill(searchable, String(s.name))).slice(0, 20);
        const rawCity = cleanText(raw.city || "", 80);
        const virtual = /^virtual$/i.test(rawCity);
        const city = virtual ? "" : rawCity;
        const isIntern = raw.is_intern === true || raw.is_intern === "true" || /\bintern(ship)?\b/i.test(title);
        const schedule = String(raw.job_schedule_type || "").toLowerCase();
        const { error } = await admin.rpc("upsert_job_opportunity_atomic", {
          p_job: {
            source_provider: "amazon",
            source_board_token: "india",
            source_external_id: "amazon:" + String(raw.id_icims),
            source_url: jobUrl,
            source_last_seen_at: new Date().toISOString(),
            title,
            company_name: "Amazon",
            location: virtual ? "Remote, India" : city ? city + ", India" : "India",
            work_mode: virtual || /\bremote\b/i.test(title + " " + description) ? "Remote" : null,
            employment_type: isIntern ? "Internship" : schedule.includes("part") ? "Part-time" : schedule.includes("full") ? "Full-time" : null,
            description: fullDescription,
            experience_level: level,
            application_url: jobUrl,
            posting_date: postingDate(raw.posted_date),
          },
          p_skill_ids: matched.map((s: any) => Number(s.id)),
        });
        if (error) { skipped++; if (errors.length < 3) errors.push(String(error.message).slice(0, 120)); continue; }
        imported++;
      }
      offset += jobs.length;
      if (jobs.length < PAGE_SIZE || offset >= total) { offset = 0; break; }
    }
    const status = errors.length ? "partial: " + errors.join(" | ").slice(0, 150)
      : "success (fetched " + fetched + " of " + total + " India roles, saved " + imported + ")";
    await admin.from("job_sources").update({
      last_synced_at: new Date().toISOString(), last_sync_status: status, last_sync_count: imported,
      cursor_token: String(offset), updated_at: new Date().toISOString(),
    }).eq("id", source.id);
    return json({ success: errors.length === 0, total, fetched, imported, skipped, next_offset: offset, errors });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await admin.from("job_sources").update({
      last_synced_at: new Date().toISOString(), last_sync_status: "error: " + message.slice(0, 180), updated_at: new Date().toISOString(),
    }).eq("id", source.id);
    return json({ success: false, error: message, imported }, 500);
  }
});
