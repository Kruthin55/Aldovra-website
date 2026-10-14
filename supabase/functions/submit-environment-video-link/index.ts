import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isSupportedYouTubeVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:") return false;

    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean).length === 1;
    }

    if (host !== "youtube.com" && host !== "m.youtube.com") return false;

    if (url.pathname === "/watch") {
      return Boolean(url.searchParams.get("v"));
    }

    return /^\/(shorts|embed|live)\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Please sign in again.");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("Your session is invalid. Please sign in again.");
  return data.user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Only POST requests are allowed." }, 405);
  }

  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const sessionId = String(body?.session_id || "").trim();
    const youtubeUrl = String(body?.youtube_url || "").trim();

    if (!sessionId) return json({ success: false, error: "Assessment session is missing." }, 400);
    if (youtubeUrl.length > 2048 || !isSupportedYouTubeVideoUrl(youtubeUrl)) {
      return json({
        success: false,
        error: "Please enter a valid HTTPS YouTube video URL. Set its visibility to Unlisted, not Private.",
      }, 400);
    }

    const { data: session, error: sessionError } = await admin
      .from("assessment_sessions")
      .select("id,user_id,request_id,assessment_id,skill_name,status")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) return json({ success: false, error: "Assessment session not found." }, 404);

    const { data: report, error: reportError } = await admin
      .from("assessment_reports")
      .select("id,session_id,user_id,percentage,evaluation_status,verification_status,attempt_id")
      .eq("session_id", session.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (reportError) throw reportError;
    if (!report || report.evaluation_status !== "completed") {
      return json({ success: false, error: "Finish your assessment evaluation before submitting the environment video link." }, 409);
    }

    const { error: evidenceError } = await admin
      .from("assessment_evidence")
      .upsert({
        session_id: session.id,
        user_id: user.id,
        environment_video_url: youtubeUrl,
      }, { onConflict: "session_id" });

    if (evidenceError) throw evidenceError;

    const percentage = Number(report.percentage || 0);
    // Submitting a link is not the same as approving the evidence.
    // Keep the result in review until an authorized reviewer updates it.
    const verificationStatus = "pending_review";
    const resultMessage =
      "Environment video link received. Aldovra will review the evidence before final verification.";

    const { error: reportUpdateError } = await admin
      .from("assessment_reports")
      .update({
        verification_status: verificationStatus,
        result_message: resultMessage,
      })
      .eq("id", report.id)
      .eq("user_id", user.id);

    if (reportUpdateError) throw reportUpdateError;

    // Keep the existing assessment-request admin workflow aligned with the
    // student-submitted evidence link so reviewers can open it in admin.html.
    const { error: detailsError } = await admin
      .from("assessment_request_details")
      .update({
        score: Math.round(percentage),
        verification_status: "pending_review",
        recording_url: youtubeUrl,
      })
      .eq("request_id", String(session.request_id));

    if (detailsError) {
      console.warn("Assessment request details sync warning:", detailsError.message);
    }

    const { error: notificationError } = await admin
      .from("notifications")
      .insert({
        user_id: user.id,
        title: "Environment video submitted",
        message: "Your YouTube environment video link was saved. Aldovra will review it before final verification.",
        type: "assessment",
        is_read: false,
      });

    if (notificationError) {
      console.warn("Environment video notification warning:", notificationError.message);
    }

    return json({
      success: true,
      verification_status: verificationStatus,
      percentage,
      message: "Video link saved successfully. Your environment evidence is now under review.",
    });
  } catch (error) {
    console.error("submit-environment-video-link error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Could not save the environment video link.",
    }, 400);
  }
});
