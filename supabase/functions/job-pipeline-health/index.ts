// Public, read-only job pipeline health: aggregate counts only, no job or user data.
// Polled hourly by the "Job Pipeline Health" GitHub Action, which fails (and emails
// the repo owner) when `ok` is false.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "https://aldovra.com",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "GET required" }), { status: 405, headers });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response(JSON.stringify({ ok: false, problems: ["server configuration missing"] }), { status: 500, headers });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc("job_pipeline_health");
  if (error || !data) return new Response(JSON.stringify({ ok: false, problems: ["health query failed"] }), { status: 500, headers });

  const h = data as Record<string, any>;
  const problems: string[] = [];
  const lastSyncMinutes = h.last_source_sync_at ? (Date.now() - Date.parse(h.last_source_sync_at)) / 60000 : Infinity;
  if (lastSyncMinutes > 30) problems.push("job source sync has not run for " + Math.round(lastSyncMinutes) + " minutes");
  if (Number(h.student_visible_jobs) < 100) problems.push("only " + h.student_visible_jobs + " jobs visible to students");
  if (Number(h.new_jobs_24h) < 10) problems.push("only " + h.new_jobs_24h + " new jobs in the last 24 hours");
  if (Number(h.links_checked_24h) < 100) problems.push("only " + h.links_checked_24h + " job links verified in the last 24 hours");
  if (Number(h.sources_erroring) > Math.max(10, Number(h.sources_enabled) * 0.25)) problems.push(h.sources_erroring + " job sources are failing");

  return new Response(JSON.stringify({ ok: problems.length === 0, problems, ...h }), { status: 200, headers });
});
