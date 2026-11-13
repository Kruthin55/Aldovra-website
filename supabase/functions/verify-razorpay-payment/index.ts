// Confirms a Razorpay payment and unlocks what it paid for (13 Nov 2026).
// Called by the dashboard after Razorpay Checkout succeeds ({order_id, payment_id, signature}),
// and on dashboard load with {reconcile:true} to settle payments whose tab closed before we heard back.
// The truth is always Razorpay's own API (order payments), never the browser.
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.
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

async function hmacHex(secret: string, text: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req: Request) => {
  const headers = { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const keyId = Deno.env.get("RAZORPAY_KEY_ID") || "";
  const secret = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
  if (!url || !serviceKey || !keyId || !secret) return json({ error: "Payments are being set up.", code: "PAYMENTS_NOT_CONFIGURED" }, 503);
  const auth = "Basic " + btoa(keyId + ":" + secret);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Please log in again." }, 401);
  const { data: authData } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (!user) return json({ error: "Please log in again." }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  const cols = "id,user_id,request_id,amount,status,purpose,razorpay_order_id,created_at";
  let rows: any[] = [];
  if (body?.order_id) {
    const { data } = await admin.from("assessment_payments").select(cols)
      .eq("provider", "razorpay").eq("razorpay_order_id", String(body.order_id)).eq("user_id", user.id).limit(1);
    rows = data || [];
    if (!rows.length) return json({ error: "Payment not found." }, 404);
  } else if (body?.reconcile) {
    const since = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data } = await admin.from("assessment_payments").select(cols)
      .eq("provider", "razorpay").eq("user_id", user.id).eq("status", "created").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(5);
    rows = data || [];
  } else {
    return json({ error: "order_id is required." }, 400);
  }

  // The checkout signature is extra evidence only; we still ask Razorpay before unlocking anything.
  let signatureOk: boolean | null = null;
  if (body?.order_id && body?.payment_id && body?.signature) {
    const expected = await hmacHex(secret, String(body.order_id) + "|" + String(body.payment_id));
    signatureOk = safeEqual(expected, String(body.signature));
  }

  const results: any[] = [];
  for (const row of rows) {
    const reqId = row.request_id;
    if (row.status === "paid") { results.push({ status: "paid", request_id: reqId, purpose: row.purpose }); continue; }

    let items: any[] = [];
    let fetchedOk = false;
    try {
      const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(row.razorpay_order_id)}/payments`, {
        headers: { Authorization: auth }, signal: AbortSignal.timeout(12000),
      });
      const data = await res.json().catch(() => null);
      items = Array.isArray(data?.items) ? data.items : [];
      fetchedOk = res.ok && Array.isArray(data?.items);
    } catch { /* treat as pending */ }

    const paise = Math.round(Number(row.amount) * 100);
    let paid = items.find((p) => p.status === "captured" && Number(p.amount) === paise && p.currency === "INR");
    if (!paid) {
      const authorized = items.find((p) => p.status === "authorized" && Number(p.amount) === paise && p.currency === "INR");
      if (authorized) {
        try {
          const cap = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(authorized.id)}/capture`, {
            method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" },
            body: JSON.stringify({ amount: paise, currency: "INR" }), signal: AbortSignal.timeout(12000),
          });
          const capData = await cap.json().catch(() => null);
          if (cap.ok && capData?.status === "captured") paid = capData;
        } catch { /* stays pending */ }
      }
    }

    const nowIso = new Date().toISOString();
    if (paid) {
      const { data: upd } = await admin.from("assessment_payments").update({
        status: "paid", paid_at: nowIso, updated_at: nowIso, provider_status: "captured",
        provider_payment_id: paid.id, razorpay_payment_id: paid.id,
        razorpay_signature: signatureOk && String(body?.payment_id) === paid.id ? String(body.signature) : null,
        provider_payload: { method: paid.method, amount: paid.amount, fee: paid.fee, tax: paid.tax, vpa_bank: paid.bank || null, signature_ok: signatureOk },
      }).eq("id", row.id).eq("status", "created").select("id");
      if (upd && upd.length && row.purpose === "new_skill") {
        // The payment itself is the unlock: approve the skill request and mark the entitlement used.
        await admin.from("assessment_requests").update({ status: "approved", approved_at: nowIso, reviewed_at: nowIso })
          .eq("id", reqId).eq("status", "payment_pending");
        await admin.from("assessment_payments").update({ entitlement_used: true, used_at: nowIso }).eq("id", row.id);
      }
      results.push({ status: "paid", request_id: reqId, purpose: row.purpose });
      continue;
    }

    const failed = items.length > 0 && items.every((p) => p.status === "failed");
    const old = Date.now() - new Date(row.created_at).getTime() > 2 * 3600000;
    const abandoned = fetchedOk && items.length === 0;
    if ((failed || abandoned) && old) {
      // Nothing succeeded and the order is stale: close it so the dashboard stops checking it.
      const last = items[0] || {};
      await admin.from("assessment_payments").update({
        status: "failed", provider_status: "failed", updated_at: nowIso,
        failure_reason: String(last.error_description || last.error_reason || (abandoned ? "checkout_closed" : "payment_failed")).slice(0, 200),
      }).eq("id", row.id).eq("status", "created");
      results.push({ status: "failed", request_id: reqId, purpose: row.purpose });
    } else {
      results.push({ status: failed ? "failed" : "pending", request_id: reqId, purpose: row.purpose });
    }
  }

  if (body?.order_id) return json(results[0] || { status: "pending" });
  return json({ settled: results.filter((r) => r.status === "paid").length, results });
});
