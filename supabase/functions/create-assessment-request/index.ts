// Creates (or reuses) a student's assessment request for a skill.
// First assessment is free. Once paid assessments are live, every later skill verification starts as
// status "payment_pending" with a fee from the latest exam score (65%+ -> ₹50, below 65% -> ₹100).
// Only skills found in the student's analyzed resume can be requested (see resume_skills.ts).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resumeHasSkill } from "./resume_skills.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    /* ---------- AUTHENTICATED USER ---------- */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Authentication required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid authentication session" }, 401);
    }

    /* ---------- REQUEST BODY ---------- */
    const body = await req.json();
    const skillId = Number(body?.skill_id);
    if (!Number.isInteger(skillId) || skillId <= 0) {
      return json({ error: "A valid skill_id is required" }, 400);
    }

    /* ---------- ADMIN CLIENT (server-side only) ---------- */
    const admin = createClient(supabaseUrl, serviceRoleKey);

    /* ---------- STUDENT ELIGIBILITY GATE: profile + analyzed resume ---------- */
    const { data: profileCheck, error: profileCheckError } = await admin
      .from("profiles")
      .select(`
          full_name,
          city,
          college,
          degree,
          graduation_year,
          bio,
          github_url,
          linkedin_url,
          career_track
        `)
      .eq("id", user.id)
      .maybeSingle();

    if (profileCheckError) {
      console.error("Profile eligibility lookup error:", profileCheckError);
      return json({ error: "Unable to verify your profile" }, 500);
    }

    const requiredProfileFields = [
      profileCheck?.full_name,
      profileCheck?.city,
      profileCheck?.college,
      profileCheck?.degree,
      profileCheck?.graduation_year,
      profileCheck?.bio,
      profileCheck?.github_url,
      profileCheck?.linkedin_url,
      profileCheck?.career_track,
    ];

    const profileComplete = requiredProfileFields.every(
      (value) => value !== null && value !== undefined && String(value).trim() !== "",
    );

    if (!profileComplete) {
      return json({
        success: false,
        error: "Complete your Aldovra profile before accessing assessments.",
        code: "PROFILE_INCOMPLETE",
      }, 403);
    }

    /* ---------- LATEST RESUME ---------- */
    const { data: resume, error: resumeError } = await admin
      .from("student_resumes")
      .select(`
          status,
          parsed_data
        `)
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (resumeError) {
      console.error("Resume eligibility lookup error:", resumeError);
      return json({ error: "Unable to verify your resume" }, 500);
    }

    const resumeVerified =
      resume?.status === "analyzed" &&
      resume?.parsed_data &&
      typeof resume.parsed_data === "object";

    if (!resumeVerified) {
      return json({
        success: false,
        error: "Upload and analyze your resume before accessing assessments.",
        code: "RESUME_NOT_VERIFIED",
      }, 403);
    }

    /* ---------- FIND ACTIVE ASSESSMENT ---------- */
    const { data: assessment, error: assessmentError } = await admin
      .from("assessments")
      .select(`
          id,
          skill_id,
          title,
          description,
          duration_minutes,
          passing_score,
          is_active
        `)
      .eq("skill_id", skillId)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (assessmentError) {
      console.error("Assessment lookup error:", assessmentError);
      return json({ error: "Unable to find assessment" }, 500);
    }

    if (!assessment) {
      return json({ error: "No active assessment is available for this skill" }, 404);
    }

    /* ---------- ONLY SKILLS FOUND IN THE STUDENT'S RESUME ---------- */
    const { data: skillRow } = await admin.from("skills").select("name").eq("id", skillId).maybeSingle();
    const { count: earlierRequests } = await admin
      .from("assessment_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("assessment_id", assessment.id);
    if (!(earlierRequests || 0) && !resumeHasSkill(resume.parsed_data, String(skillRow?.name || ""))) {
      return json({
        success: false,
        error: "This skill isn't in your resume. Add it to your resume and upload it again to verify it.",
        code: "SKILL_NOT_IN_RESUME",
      }, 403);
    }

    /* ---------- STUDENT PROFILE ---------- */
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.warn("Profile lookup warning:", profileError.message);
    }

    const studentName =
      profile?.full_name ||
      user.user_metadata?.full_name ||
      user.email ||
      "Student";

    /* ---------- CHECK EXISTING ACTIVE REQUEST ---------- */
    const { data: existingRequest, error: existingError } = await admin
      .from("assessment_requests")
      .select(`
          id,
          status,
          assessment_id
        `)
      .eq("user_id", user.id)
      .eq("assessment_id", assessment.id)
      .in("status", ["pending", "approved", "payment_pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.warn("Existing request lookup warning:", existingError.message);
    }

    /* ---------- PRICING: first exam free, later skills paid (when payments are live) ---------- */
    const { data: paymentsLive } = await admin.rpc("payments_live_for", { p_user: user.id });
    let unlockFee: number | null = null;
    let feeBasis: number | null = null;
    if (paymentsLive === true) {
      const { count: priorRequests } = await admin
        .from("assessment_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("status", "in", "(rejected,payment_pending)");
      if ((priorRequests || 0) > 0) {
        const { data: lastAttempt } = await admin
          .from("assessment_attempts")
          .select("percentage,submitted_at")
          .eq("user_id", user.id)
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!lastAttempt) {
          return json({
            success: false,
            error: "Finish your free first assessment before verifying another skill.",
            code: "FIRST_EXAM_PENDING",
          }, 409);
        }
        feeBasis = Number(lastAttempt.percentage);
        unlockFee = Number.isFinite(feeBasis) && feeBasis >= 65 ? 50 : 100;
      }
    }

    /* ---------- REUSE EXISTING REQUEST ---------- */
    if (existingRequest) {
      if (existingRequest.status === "payment_pending") {
        const fee = unlockFee ?? 100;
        await admin.from("assessment_requests").update({ unlock_fee: fee, unlock_fee_basis: feeBasis }).eq("id", existingRequest.id);
        return json({
          success: true,
          request_id: existingRequest.id,
          assessment_id: existingRequest.assessment_id,
          status: "payment_pending",
          payment_required: true,
          amount: fee,
          based_on_score: feeBasis,
          reused: true,
        });
      }
      return json({
        success: true,
        request_id: existingRequest.id,
        assessment_id: existingRequest.assessment_id,
        status: existingRequest.status,
        reused: true,
      });
    }

    /* ---------- PAID SKILL: create a request that waits for payment ---------- */
    if (unlockFee !== null) {
      const { data: pendingRequest, error: pendingError } = await admin
        .from("assessment_requests")
        .insert({
          user_id: user.id,
          assessment_id: assessment.id,
          status: "payment_pending",
          student_email: user.email || null,
          student_name: studentName,
          unlock_fee: unlockFee,
          unlock_fee_basis: feeBasis,
        })
        .select("id, assessment_id, status")
        .single();
      if (pendingError) {
        console.error("Payment-pending request creation error:", pendingError);
        return json({ error: "Unable to create assessment request" }, 500);
      }
      return json({
        success: true,
        request_id: pendingRequest.id,
        assessment_id: pendingRequest.assessment_id,
        status: "payment_pending",
        payment_required: true,
        amount: unlockFee,
        based_on_score: feeBasis,
        reused: false,
      });
    }

    /* ---------- CREATE SELF-SERVICE REQUEST ---------- */
    const { data: request, error: requestError } = await admin
      .from("assessment_requests")
      .insert({
        user_id: user.id,
        assessment_id: assessment.id,
        status: "approved",
        student_email: user.email || null,
        student_name: studentName,
        approved_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
      })
      .select("id, assessment_id, status")
      .single();

    if (requestError) {
      console.error("Assessment request creation error:", requestError);
      return json({
        error: "Unable to create assessment request",
        details: requestError.message,
      }, 500);
    }

    /* ---------- SUCCESS ---------- */
    return json({
      success: true,
      request_id: request.id,
      assessment_id: request.assessment_id,
      status: request.status,
      reused: false,
    });
  } catch (error) {
    console.error("Create assessment request error:", error);
    return json({ error: "Unexpected server error" }, 500);
  }
});
