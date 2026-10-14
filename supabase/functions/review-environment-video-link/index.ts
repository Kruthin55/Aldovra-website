import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Only POST requests are allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ success: false, error: "Please sign in again." }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ success: false, error: "Your session is invalid. Please sign in again." }, 401);

    const { data: adminRecord, error: adminError } = await admin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (adminError) throw adminError;
    if (!adminRecord) return json({ success: false, error: "Admin access is required." }, 403);

    const body = await req.json();
    const requestId = String(body?.request_id || "").trim();
    const requestedStatus = String(body?.verification_status || "").trim().toLowerCase();
    const recordingUrl = String(body?.recording_url || "").trim();

    if (!requestId) return json({ success: false, error: "Assessment request ID is required." }, 400);
    if (!["pending_review", "verified", "rejected", "not_verified"].includes(requestedStatus)) {
      return json({ success: false, error: "Unsupported verification status." }, 400);
    }
    if (!/^https:\/\/(?:www\.)?(?:youtube\.com|m\.youtube\.com|youtu\.be)\//i.test(recordingUrl)) {
      return json({ success: false, error: "A valid YouTube video URL is required before reviewing environment evidence." }, 400);
    }

    const { data: sessions, error: sessionsError } = await admin
      .from("assessment_sessions")
      .select("id,user_id,assessment_id")
      .eq("request_id", requestId);
    if (sessionsError) throw sessionsError;
    if (!sessions?.length) return json({ success: false, error: "No assessment sessions were found for this request." }, 404);

    let updated = 0;
    for (const session of sessions) {
      const { data: evidence, error: evidenceError } = await admin
        .from("assessment_evidence")
        .select("environment_video_url")
        .eq("session_id", session.id)
        .eq("user_id", session.user_id)
        .maybeSingle();
      if (evidenceError) throw evidenceError;
      if (String(evidence?.environment_video_url || "").trim() !== recordingUrl) continue;

      const { data: report, error: reportError } = await admin
        .from("assessment_reports")
        .select("id,percentage")
        .eq("session_id", session.id)
        .eq("user_id", session.user_id)
        .maybeSingle();
      if (reportError) throw reportError;
      if (!report) continue;

      const scoreMeetsBenchmark = Number(report.percentage || 0) >= 75;
      let status = "pending_review";
      let message = "Environment video link received. Aldovra will review the evidence before final verification.";

      if (requestedStatus === "verified" && scoreMeetsBenchmark) {
        status = "eligible";
        message = "Your assessment and environment video have been reviewed and verified by Aldovra.";
      } else if (requestedStatus === "rejected" || requestedStatus === "not_verified" ||
        (requestedStatus === "verified" && !scoreMeetsBenchmark)) {
        status = "reattempt_required";
        message = requestedStatus === "verified" && !scoreMeetsBenchmark
          ? "Your environment video was reviewed, but your assessment score is below the 75% verification benchmark."
          : "Your environment video was not approved. Please review the admin feedback or contact Aldovra support.";
      }

      const { error: updateError } = await admin
        .from("assessment_reports")
        .update({ verification_status: status, result_message: message })
        .eq("id", report.id)
        .eq("user_id", session.user_id);
      if (updateError) throw updateError;

      if (status === "eligible" && session.assessment_id) {
        const { data: assessment, error: assessmentError } = await admin
          .from("assessments")
          .select("skill_id")
          .eq("id", session.assessment_id)
          .maybeSingle();
        if (assessmentError) throw assessmentError;
        if (assessment?.skill_id) {
          const { error: skillError } = await admin
            .from("student_skills")
            .upsert({ user_id: session.user_id, skill_id: assessment.skill_id, status: "verified" },
              { onConflict: "user_id,skill_id" });
          if (skillError) throw skillError;
        }
      }

      const title = status === "eligible"
        ? "Assessment verified"
        : status === "pending_review"
          ? "Environment video under review"
          : "Assessment not verified";
      const { error: notificationError } = await admin.from("notifications").insert({
        user_id: session.user_id,
        title,
        message,
        type: "assessment",
        is_read: false,
      });
      if (notificationError) console.warn("Review notification warning:", notificationError.message);
      updated++;
    }

    return json({ success: true, updated, message: "Student assessment verification status updated." });
  } catch (error) {
    console.error("review-environment-video-link error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Could not update verification status." }, 400);
  }
});
