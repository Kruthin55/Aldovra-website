// PayU posts the payment result here (surl/furl). We verify the response hash, double-check
// with PayU's verify_payment API, mark the payment, then send the student back to the dashboard.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RETURN_URL = "https://aldovra.com/dashboard.html";

async function sha512(text: string) {
  const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function back(result: "success" | "failed" | "pending", requestId?: string) {
  const u = new URL(RETURN_URL);
  u.searchParams.set("payment", result);
  if (requestId && /^\d+$/.test(requestId)) u.searchParams.set("request", requestId);
  return new Response(null, { status: 303, headers: { Location: u.toString(), "Cache-Control": "no-store" } });
}

async function verifyWithPayU(mode: string, key: string, salt: string, txnid: string) {
  const endpoint = mode === "live" ? "https://info.payu.in/merchant/postservice?form=2" : "https://test.payu.in/merchant/postservice?form=2";
  const command = "verify_payment";
  const hash = await sha512([key, command, txnid, salt].join("|"));
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ key, command, var1: txnid, hash }).toString(),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.transaction_details?.[txnid] || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return back("failed");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const key = Deno.env.get("PAYU_MERCHANT_KEY");
  const salt = Deno.env.get("PAYU_MERCHANT_SALT");
  const mode = (Deno.env.get("PAYU_MODE") || "test").toLowerCase() === "live" ? "live" : "test";
  if (!url || !serviceKey || !key || !salt) return back("pending");

  let p: Record<string, string> = {};
  try {
    const form = await req.formData();
    form.forEach((v, k) => { p[k] = String(v); });
  } catch {
    return back("failed");
  }

  const txnid = p.txnid || "";
  const status = (p.status || "").toLowerCase();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: row } = await admin.from("assessment_payments")
    .select("id,user_id,request_id,amount,status")
    .eq("provider", "payu").eq("provider_txn_id", txnid).maybeSingle();
  if (!row) return back("failed");
  const requestId = String(row.request_id);

  // Response hash: [additional_charges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
  const parts = [salt, p.status || "", "", "", "", "", "", p.udf5 || "", p.udf4 || "", p.udf3 || "", p.udf2 || "", p.udf1 || "",
    p.email || "", p.firstname || "", p.productinfo || "", p.amount || "", txnid, p.key || ""];
  if (p.additional_charges) parts.unshift(p.additional_charges);
  const expected = await sha512(parts.join("|"));
  const hashOk = p.key === key && safeEqual(expected, String(p.hash || "").toLowerCase());
  const amountOk = Math.abs(Number(p.amount) - Number(row.amount)) < 0.005;
  const ownerOk = p.udf2 === row.user_id && p.udf1 === requestId;

  const payload = {
    status: p.status, mihpayid: p.mihpayid, mode: p.mode, bank_ref_num: p.bank_ref_num,
    error: p.error, error_Message: p.error_Message, amount: p.amount, net_amount_debit: p.net_amount_debit,
    hash_ok: hashOk, amount_ok: amountOk, owner_ok: ownerOk,
  };

  if (row.status === "paid") return back("success", requestId); // idempotent replay

  if (!hashOk || !amountOk || !ownerOk) {
    await admin.from("assessment_payments").update({
      provider_status: "rejected", failure_reason: !hashOk ? "hash_mismatch" : !amountOk ? "amount_mismatch" : "owner_mismatch",
      provider_payload: payload, updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("status", "created");
    return back("failed", requestId);
  }

  if (status === "success") {
    // Belt and braces: confirm with PayU server-to-server before granting the reattempt.
    const v = await verifyWithPayU(mode, key, salt, txnid);
    const confirmed = v && String(v.status).toLowerCase() === "success" && Math.abs(Number(v.amt) - Number(row.amount)) < 0.005;
    if (!confirmed) {
      await admin.from("assessment_payments").update({
        provider_status: "success_unconfirmed", provider_payment_id: p.mihpayid || null,
        provider_payload: { ...payload, verify: v }, updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "created");
      return back("pending", requestId);
    }
    const nowIso = new Date().toISOString();
    await admin.from("assessment_payments").update({
      status: "paid", paid_at: nowIso, updated_at: nowIso,
      provider_status: "success", provider_payment_id: p.mihpayid || v.mihpayid || null,
      provider_payload: { ...payload, verify: { status: v.status, amt: v.amt, mihpayid: v.mihpayid } },
    }).eq("id", row.id).eq("status", "created");
    return back("success", requestId);
  }

  const pending = status === "pending";
  await admin.from("assessment_payments").update({
    status: pending ? "created" : "failed",
    provider_status: status || "unknown",
    failure_reason: pending ? null : (p.error_Message || p.error || "payment_failed").slice(0, 200),
    provider_payment_id: p.mihpayid || null,
    provider_payload: payload, updated_at: new Date().toISOString(),
  }).eq("id", row.id).eq("status", "created");
  return back(pending ? "pending" : "failed", requestId);
});
