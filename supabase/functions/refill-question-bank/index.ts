// Keeps the question bank topped up (pg_cron every 5 min -> Bearer ALDOVRA_CRON_SECRET).
// Each run picks the skill that needs questions most (skills students are requesting first),
// asks Gemini for a fresh batch, validates it, and stores it via bank_add_questions()
// (duplicates are skipped by a normalised text fingerprint).
// POST {"skill_id": 29, "count": 40} forces a specific skill.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TARGET_ACTIVE = 300;          // active questions to keep per skill
const BATCH = 40;                   // questions per Gemini call (12 easy / 20 medium / 8 hard)
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function prompt(skill: string, count: number, avoid: string[]) {
  const easy = Math.round(count * 0.3), medium = Math.round(count * 0.5), hard = count - easy - medium;
  return `You write questions for Aldovra's skill-verification exams for Indian freshers (0–2 years experience).

SKILL: ${skill}

Write exactly ${count} NEW multiple-choice questions: ${easy} easy, ${medium} medium, ${hard} hard.
- Easy: core concepts and basic usage. Medium: practical, real-world usage and common mistakes. Hard: reasoning, debugging, edge cases, performance.
- Mix concept questions with short code/scenario questions where the skill allows it.
- Exactly 4 options, exactly ONE correct. Distractors must be plausible. No "All of the above"/"None of the above".
- Keep all 4 options similar in length, detail and tone. The correct option must NOT be noticeably longer or more specific than the others, and distractors must not be obviously silly.
- Vary which option position is correct.
- Each question must be self-contained and unambiguous, factual and current.
- Do NOT repeat or lightly reword any of these existing questions:
${avoid.map((q) => "  • " + q).join("\n") || "  (none yet)"}

Return ONLY JSON:
{"questions":[{"question":"...","options":["...","...","...","..."],"correct_index":0,"difficulty":"easy|medium|hard","category":"short topic name"}]}`;
}

async function callGemini(key: string, text: string) {
  let lastError = "";
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || "").join("");
        try { return JSON.parse(raw); } catch { lastError = "invalid JSON from " + model; continue; }
      }
      lastError = model + " " + res.status + " " + (await res.text()).slice(0, 200);
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error(lastError || "Gemini failed");
}

function clean(list: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const q of list || []) {
    const question = String(q?.question || "").trim();
    const options = Array.isArray(q?.options) ? q.options.slice(0, 4).map((o: any) => String(o).trim()) : [];
    const correct = Number(q?.correct_index);
    const difficulty = String(q?.difficulty || "").toLowerCase();
    if (question.length < 12 || options.length !== 4 || options.some((o: string) => !o)) continue;
    if (new Set(options.map((o: string) => o.toLowerCase())).size !== 4) continue;
    if (!Number.isInteger(correct) || correct < 0 || correct > 3) continue;
    if (!["easy", "medium", "hard"].includes(difficulty)) continue;
    if (options.some((o: string) => /^(all|none) of the above$/i.test(o))) continue;
    const key = question.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    // Store options in random order so the bank has no position bias.
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    out.push({
      question,
      options: order.map((i) => options[i]),
      correct_index: order.indexOf(correct),
      difficulty,
      category: String(q?.category || "Technical").slice(0, 60),
    });
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("ALDOVRA_CRON_SECRET");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!url || !serviceKey || !cronSecret || !geminiKey) return json({ error: "Server configuration missing" }, 500);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token !== cronSecret) return json({ error: "Cron authentication required" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: stats, error: statsError } = await admin.rpc("question_bank_stats");
  if (statsError) return json({ error: "stats failed", detail: statsError.message }, 500);

  let pick: any = null;
  if (body?.skill_id) pick = (stats || []).find((s: any) => Number(s.skill_id) === Number(body.skill_id));
  else {
    const needy = (stats || []).filter((s: any) => s.active < TARGET_ACTIVE);
    // Skills students are actually taking first, then the emptiest skills.
    needy.sort((a: any, b: any) =>
      (b.recent_requests > 0 ? 1 : 0) - (a.recent_requests > 0 ? 1 : 0) || a.active - b.active);
    pick = needy[0] || null;
  }
  if (!pick) return json({ ok: true, idle: true, message: "Every skill has at least " + TARGET_ACTIVE + " active questions." });

  const count = Math.max(10, Math.min(60, Number(body?.count) || BATCH));
  const { data: existing } = await admin
    .from("question_bank").select("question").eq("skill_id", pick.skill_id)
    .order("created_at", { ascending: false }).limit(80);
  const avoid = (existing || []).map((r: any) => String(r.question).slice(0, 140));

  try {
    const generated = await callGemini(geminiKey, prompt(pick.skill_name, count, avoid));
    const questions = clean(generated?.questions);
    const { data: added, error: addError } = await admin.rpc("bank_add_questions", {
      p_skill: pick.skill_id, p_questions: questions, p_source: "gemini",
    });
    if (addError) return json({ ok: false, skill: pick.skill_name, error: addError.message }, 500);
    return json({ ok: true, skill: pick.skill_name, generated: questions.length, inserted: added?.inserted ?? 0, active_before: pick.active });
  } catch (e) {
    return json({ ok: false, skill: pick.skill_name, error: (e as Error).message }, 502);
  }
});
