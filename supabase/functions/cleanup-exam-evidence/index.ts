// Nightly retention for exam evidence and old resumes (pg_cron -> this function, Bearer ALDOVRA_CRON_SECRET).
// Rules live in SQL: public.evidence_cleanup_candidates()
//   failed attempts 7 days · passed attempts 90 days · abandoned sessions 7 days · orphans 7 days
//   resumes: keep the newest 2 per student
// POST {"dry_run": true} returns what would be deleted without deleting.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("ALDOVRA_CRON_SECRET");
  if (!url || !serviceKey || !cronSecret) return json({ error: "Server configuration missing" }, 500);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token !== cronSecret) return json({ error: "Cron authentication required" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const dryRun = body?.dry_run === true;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: rows, error } = await admin.rpc("evidence_cleanup_candidates", { p_limit: 3000 });
  if (error) return json({ error: "Could not load cleanup candidates", detail: error.message }, 500);

  const byBucket = new Map<string, string[]>();
  const reasons: Record<string, number> = {};
  for (const r of (rows || []) as any[]) {
    if (!byBucket.has(r.bucket_id)) byBucket.set(r.bucket_id, []);
    byBucket.get(r.bucket_id)!.push(r.name);
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  }
  if (dryRun) return json({ ok: true, dry_run: true, total: (rows || []).length, reasons });

  const deleted: string[] = [];
  const failures: string[] = [];
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += 100) {
      const batch = names.slice(i, i + 100);
      const { error: rmError } = await admin.storage.from(bucket).remove(batch);
      if (rmError) failures.push(bucket + ": " + rmError.message);
      else deleted.push(...batch);
    }
  }
  if (deleted.length) {
    const { error: markError } = await admin.rpc("evidence_mark_deleted", { p_names: deleted });
    if (markError) failures.push("mark: " + markError.message);
  }
  return json({ ok: failures.length === 0, deleted: deleted.length, reasons, failures: failures.slice(0, 5) });
});
