// Self-service account deletion (students and recruiters; admins are refused).
// POST { confirm: "DELETE", reason?: string } with the user's own session.
// 1) removes the user's files from storage (student-resumes, profile-avatars, assessment-evidence: <uid>/...)
// 2) calls purge_user_account(uid) which deletes the rows and the auth user (see migration 20261106130000).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BUCKETS = ["student-resumes", "profile-avatars", "assessment-evidence"];

// deno-lint-ignore no-explicit-any
async function listAll(admin: any, bucket: string, prefix: string, out: string[], depth = 0) {
  if (depth > 4) return;
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data || !data.length) return;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      if (item.id === null) await listAll(admin, bucket, path, out, depth + 1); // folder
      else out.push(path);
    }
    if (data.length < 1000) return;
    offset += 1000;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Invalid authentication session" }, 401);

    const body = await req.json().catch(() => ({}));
    if (String(body?.confirm || "") !== "DELETE") return json({ error: "CONFIRM_REQUIRED" }, 400);
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 300) : null;

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: isAdmin } = await admin.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (isAdmin) return json({ error: "ADMIN_ACCOUNT" }, 403);

    let removed = 0;
    for (const bucket of BUCKETS) {
      const paths: string[] = [];
      await listAll(admin, bucket, user.id, paths);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) return json({ error: "STORAGE_CLEANUP_FAILED" }, 500);
        removed += Math.min(100, paths.length - i);
      }
    }

    const { data, error } = await admin.rpc("purge_user_account", { p_user: user.id, p_reason: reason });
    if (error) return json({ error: "DELETE_FAILED" }, 500);

    return json({ ok: true, files_removed: removed, result: data });
  } catch (_e) {
    return json({ error: "DELETE_FAILED" }, 500);
  }
});
