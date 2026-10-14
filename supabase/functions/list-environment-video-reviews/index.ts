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
      .from("admin_users").select("user_id").eq("user_id", authData.user.id).maybeSingle();
    if (adminError) throw adminError;
    if (!adminRecord) return json({ success: false, error: "Admin access is required." }, 403);

    const { data: evidenceRows, error: evidenceError } = await admin
      .from("assessment_evidence")
      .select("session_id,user_id,environment_video_url,created_at")
      .not("environment_video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(250);
    if (evidenceError) throw evidenceError;

    const rows = (evidenceRows || []).filter((row: any) => String(row.environment_video_url || "").trim());
    if (!rows.length) return json({ success: true, reviews: [] });

    const sessionIds = [...new Set(rows.map((row: any) => row.session_id).filter(Boolean))];
    const userIds = [...new Set(rows.map((row: any) => row.user_id).filter(Boolean))];

    const [{ data: sessions, error: sessionsError }, { data: reports, error: reportsError }, { data: profiles, error: profilesError }, { data: attempts, error: attemptsError }] = await Promise.all([
      admin.from("assessment_sessions").select("id,request_id,user_id,assessment_id,skill_name,created_at").in("id", sessionIds),
      admin.from("assessment_reports").select("id,session_id,user_id,percentage,score,total_questions,verification_status,evaluation_status,result_message,created_at,attempt_id").in("session_id", sessionIds),
      admin.from("profiles").select("id,full_name").in("id", userIds),
      admin.from("assessment_attempts").select("id,session_id,attempt_number,submitted_at,created_at").in("session_id", sessionIds),
    ]);
    if (sessionsError) throw sessionsError;
    if (reportsError) throw reportsError;
    if (profilesError) throw profilesError;
    if (attemptsError) throw attemptsError;

    const assessmentIds = [...new Set((sessions || []).map((row: any) => row.assessment_id).filter(Boolean))];
    const { data: assessments, error: assessmentsError } = assessmentIds.length
      ? await admin.from("assessments").select("id,title,skill_id").in("id", assessmentIds)
      : { data: [], error: null };
    if (assessmentsError) throw assessmentsError;

    const sessionMap = new Map((sessions || []).map((row: any) => [String(row.id), row]));
    const reportMap = new Map((reports || []).map((row: any) => [String(row.session_id), row]));
    const profileMap = new Map((profiles || []).map((row: any) => [String(row.id), row]));
    const assessmentMap = new Map((assessments || []).map((row: any) => [String(row.id), row]));
    const attemptMap = new Map((attempts || []).map((row: any) => [String(row.session_id), row]));

    const reviews = rows.map((evidence: any) => {
      const session: any = sessionMap.get(String(evidence.session_id));
      const report: any = reportMap.get(String(evidence.session_id));
      const profile: any = profileMap.get(String(evidence.user_id));
      const assessment: any = session ? assessmentMap.get(String(session.assessment_id)) : null;
      if (!session || !report) return null;
      return {
        session_id: session.id,
        request_id: session.request_id || null,
        student_id: session.user_id,
        student_name: profile?.full_name || "Student",
        assessment_id: session.assessment_id,
        assessment_title: assessment?.title || session.skill_name || "Skill Assessment",
        attempt_number: Number(attemptMap.get(String(session.id))?.attempt_number || 1),
        score: Number(report.percentage || 0),
        correct_answers: Number(report.score || 0),
        total_questions: Number(report.total_questions || 0),
        verification_status: report.verification_status || "pending_review",
        evaluation_status: report.evaluation_status || "unknown",
        result_message: report.result_message || "",
        submitted_at: evidence.created_at || report.created_at || session.created_at,
        video_url: evidence.environment_video_url,
      };
    }).filter(Boolean);

    reviews.sort((a: any, b: any) => {
      const pendingA = a.verification_status === "pending_review" ? 1 : 0;
      const pendingB = b.verification_status === "pending_review" ? 1 : 0;
      if (pendingA !== pendingB) return pendingB - pendingA;
      return new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime();
    });

    return json({ success: true, reviews });
  } catch (error) {
    console.error("list-environment-video-reviews error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Could not load environment video reviews." }, 400);
  }
});