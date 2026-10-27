// Starts a PayU hosted-checkout payment for an assessment reattempt.
// The fee is decided here from the student's latest score — never from the browser.
//   65–74%  -> ₹50     0–64% -> ₹100     75%+ -> already passed, no reattempt
// Secrets: PAYU_MERCHANT_KEY, PAYU_MERCHANT_SALT, PAYU_MODE ("test" | "live", default "test").
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://aldovra.com", "https://www.aldovra.com"];
function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const CALLBACK_URL = "https://lgefwfrjzweayfxahogs.supabase.co/functions/v1/payu-callback";

async function sha512(text: string) {
  const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function clean(v: unknown, max = 60) {
  // PayU rejects some special characters in these fields; keep them plain.
  return String(v ?? "").replace(/[|&<>"'`\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

Deno.serve(async (req: Request) => {
  const headers = { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const key = Deno.env.get("PAYU_MERCHANT_KEY");
  const salt = Deno.env.get("PAYU_MERCHANT_SALT");
  const mode = (Deno.env.get("PAYU_MODE") || "test").toLowerCase() === "live" ? "live" : "test";
  if (!url || !serviceKey) return json({ error: "Server configuration missing." }, 500);
  if (!key || !salt) return json({ error: "Payments are being set up. Please try again soon.", code: "PAYMENTS_NOT_CONFIGURED" }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- One-time TEST checkout (test mode only) for verifying the PayU integration end to end. ----
  // An admin creates platform_settings.payu_test_token via SQL; /payu-test.html?t=<token> redeems it once.
  let peek: any = null;
  try { peek = await req.clone().json(); } catch { /* not json */ }
  if (peek?.test_token) {
    if (mode !== "test") return json({ error: "Test checkout is only available in PayU test mode." }, 403);
    const { data: setting } = await admin.from("platform_settings").select("value").eq("key", "payu_test_token").maybeSingle();
    const t = setting?.value as any;
    const valid = t && typeof t.token === "string" && t.token.length >= 24 && t.token === String(peek.test_token) && Date.parse(t.expires_at) > Date.now();
    if (!valid) return json({ error: "This test link is invalid or has expired." }, 403);
    await admin.from("platform_settings").delete().eq("key", "payu_test_token"); // single use
    const { data: treq } = await admin.from("assessment_requests").select("id,user_id,assessment_id").eq("id", t.request_id).eq("user_id", t.user_id).maybeSingle();
    if (!treq) return json({ error: "Test request not found." }, 404);
    const { data: tuser } = await admin.auth.admin.getUserById(t.user_id);
    const tAmount = Math.max(1, Math.min(100, Number(t.amount) || 50));
    const tTxn = ("ALDT" + treq.id + Date.now().toString(36)).toUpperCase().slice(0, 25);
    const tFields = {
      key, txnid: tTxn, amount: tAmount.toFixed(2), productinfo: "Aldovra assessment reattempt",
      firstname: "Test", email: clean(tuser?.user?.email || "test@aldovra.com", 80),
      udf1: String(treq.id), udf2: treq.user_id, udf3: "", udf4: "", udf5: "",
    };
    const { error: tErr } = await admin.from("assessment_payments").insert({
      user_id: treq.user_id, request_id: treq.id, assessment_id: treq.assessment_id, amount: tAmount, currency: "INR",
      status: "created", entitlement_used: false, provider: "payu", provider_txn_id: tTxn, provider_status: "test_initiated",
    });
    if (tErr) return json({ error: "Could not create the test payment." }, 500);
    const tHash = await sha512([tFields.key, tFields.txnid, tFields.amount, tFields.productinfo, tFields.firstname, tFields.email,
      tFields.udf1, tFields.udf2, "", "", "", "", "", "", "", "", salt].join("|"));
    return json({ action: "https://test.payu.in/_payment", fields: { ...tFields, surl: CALLBACK_URL, furl: CALLBACK_URL, hash: tHash }, amount: tAmount, mode });
  }

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Please log in again." }, 401);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return json({ error: "Please log in again." }, 401);

  // Live payments only when the platform switch is on. Test mode is allowed for internal testing.
  const { data: live } = await admin.rpc("reattempt_payments_live");
  if (mode === "live" && live !== true) {
    return json({ error: "Paid reattempts are not open yet.", code: "PAYMENTS_DISABLED" }, 409);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const requestId = Number(body?.request_id);
  if (!Number.isFinite(requestId) || requestId <= 0) return json({ error: "request_id is required." }, 400);

  const { data: request, error: requestError } = await admin
    .from("assessment_requests").select("id,user_id,assessment_id,status,student_name")
    .eq("id", requestId).eq("user_id", user.id).maybeSingle();
  if (requestError) return json({ error: "Could not load the assessment." }, 500);
  if (!request) return json({ error: "Assessment request not found." }, 404);
  const productinfo = "Aldovra assessment reattempt";
  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const firstname = clean(profile?.full_name || request.student_name || user.user_metadata?.full_name || "Student", 40).split(" ")[0] || "Student";
  const email = clean(user.email, 80);
  const phone = clean(String(body?.phone || "").replace(/\D/g, ""), 10);

  /* ---- New skill verification (first exam free; later skills priced from the latest score) ---- */
  if (request.status === "payment_pending") {
    const { data: lastAttempt } = await admin.from("assessment_attempts").select("percentage")
      .eq("user_id", user.id).not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false }).limit(1).maybeSingle();
    if (!lastAttempt) return json({ error: "Finish your free first assessment before verifying another skill.", code: "FIRST_EXAM_PENDING" }, 409);
    const basis = Number(lastAttempt.percentage);
    const fee = Number.isFinite(basis) && basis >= 65 ? 50 : 100;
    const nAmount = fee.toFixed(2);
    const nTxn = ("ALDS" + requestId + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase().slice(0, 25);
    const nInfo = "Aldovra skill verification";
    await admin.from("assessment_requests").update({ unlock_fee: fee, unlock_fee_basis: basis }).eq("id", requestId);
    const { error: nErr } = await admin.from("assessment_payments").insert({
      user_id: user.id, request_id: requestId, assessment_id: request.assessment_id, amount: fee, currency: "INR",
      status: "created", entitlement_used: false, provider: "payu", provider_txn_id: nTxn, provider_status: "initiated", purpose: "new_skill",
    });
    if (nErr) return json({ error: "Could not start the payment. Please try again." }, 500);
    const nHash = await sha512([key, nTxn, nAmount, nInfo, firstname, email, String(requestId), user.id, "", "", "", "", "", "", "", "", salt].join("|"));
    const nFields: Record<string, string> = {
      key, txnid: nTxn, amount: nAmount, productinfo: nInfo, firstname, email,
      udf1: String(requestId), udf2: user.id, udf3: "", udf4: "", udf5: "",
      surl: CALLBACK_URL, furl: CALLBACK_URL, hash: nHash,
    };
    if (phone.length === 10) nFields.phone = phone;
    return json({ action: mode === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment", fields: nFields, amount: fee, mode, purpose: "new_skill" });
  }

  if (request.status !== "completed") return json({ error: "This assessment is not ready for a reattempt." }, 409);

  const { data: attempts, error: attemptsError } = await admin
    .from("assessment_attempts").select("percentage,passed,submitted_at,created_at")
    .eq("user_id", user.id).eq("request_id", String(requestId))
    .order("submitted_at", { ascending: false }).limit(100);
  if (attemptsError) return json({ error: "Could not load your attempts." }, 500);
  const latest = attempts?.[0];
  if (!latest) return json({ error: "No previous attempt found for this assessment." }, 409);
  const pct = Number(latest.percentage);
  if (latest.passed === true || pct >= 75) return json({ error: "You've already passed this assessment — no reattempt needed." }, 409);

  const now = Date.now();
  const lastMs = new Date(latest.submitted_at || latest.created_at || 0).getTime();
  const cooldownMs = 7 * 24 * 60 * 60 * 1000;
  if (Number.isFinite(lastMs) && lastMs > 0 && now - lastMs < cooldownMs) {
    const days = Math.ceil((cooldownMs - (now - lastMs)) / 86400000);
    return json({ error: `Retake cooldown active. You can pay and retry in about ${days} day(s).`, code: "REATTEMPT_COOLDOWN" }, 429);
  }
  const monthCount = (attempts || []).filter((a: any) => {
    const t = new Date(a.submitted_at || a.created_at || 0).getTime();
    return Number.isFinite(t) && t > 0 && now - t < 30 * 86400000;
  }).length;
  if (monthCount >= 4) return json({ error: "You have reached the maximum of 4 attempts for this assessment in the last 30 days.", code: "REATTEMPT_LIMIT_REACHED" }, 429);

  const { data: unused } = await admin.from("assessment_payments").select("id")
    .eq("user_id", user.id).eq("request_id", requestId).eq("status", "paid").eq("entitlement_used", false).limit(1);
  if (unused && unused.length) return json({ error: "You already have a paid reattempt waiting. Start it from your dashboard.", code: "ALREADY_PAID" }, 409);

  const amountRupees = Number.isFinite(pct) && pct >= 65 ? 50 : 100;
  const amount = amountRupees.toFixed(2);
  const txnid = ("ALD" + requestId + now.toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase().slice(0, 25);

  const udf1 = String(requestId), udf2 = user.id, udf3 = "", udf4 = "", udf5 = "";

  const { error: insertError } = await admin.from("assessment_payments").insert({
    user_id: user.id,
    request_id: requestId,
    assessment_id: request.assessment_id,
    amount: amountRupees,
    currency: "INR",
    status: "created",
    entitlement_used: false,
    provider: "payu",
    provider_txn_id: txnid,
    provider_status: "initiated",
  });
  if (insertError) return json({ error: "Could not start the payment. Please try again." }, 500);

  const hash = await sha512([key, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5, "", "", "", "", "", salt].join("|"));
  const fields: Record<string, string> = {
    key, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5,
    surl: CALLBACK_URL, furl: CALLBACK_URL, hash,
  };
  if (phone.length === 10) fields.phone = phone;

  return json({
    action: mode === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment",
    fields,
    amount: amountRupees,
    mode,
  });
});
