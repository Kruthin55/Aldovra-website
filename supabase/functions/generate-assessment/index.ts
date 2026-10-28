// Source mirrored from the deployed "generate-assessment" edge function (v18).
// Logic is unchanged; whitespace was normalised when it was added to the repo.
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
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization.");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Unauthorized.");
  return user;
}

function buildPrompt(
  profile: Record<string, unknown>,
  resumeData: Record<string, unknown> | null,
  assessmentName: string,
  questionCount: number,
  questionType: string,
  skillName: string,
) {
  return `
You are the assessment generation engine for Aldovra,
a verified talent and hiring platform.

Create a professional skill-verification assessment.

ASSESSMENT NAME:
${assessmentName}

SELECTED SKILL:
${skillName}

QUESTION COUNT:
${questionCount}

QUESTION TYPE:
${questionType}

STUDENT PROFILE:
${JSON.stringify(profile, null, 2)}
RESUME INTELLIGENCE:
${JSON.stringify(resumeData || {}, null, 2)}

IMPORTANT RULES:

1. Generate exactly ${questionCount} questions.
2. Every question must have exactly 4 options.
3. Every question must have exactly ONE correct option.
4. Questions must be automatically scorable.
5. Include technical knowledge and practical scenarios.
6. Questions should be appropriate for a fresher hiring assessment.
7. Use the student's profile only when relevant.
7a. Use the student's analyzed resume information when relevant to the selected assessment skill.
7b. Resume information may be used to personalize practical scenarios and technical questions.
7c. Do not ask questions about resume information that is unrelated to the assessment skill.
7d. Never invent resume details that are not present in the provided resume intelligence.
7e. If resume intelligence is empty, generate a standard skill assessment.
8. Never invent projects, experience, certifications,
   employment or skills that are not present in the profile.
9. Avoid duplicate questions.
10. Use the following difficulty distribution:
   - 30% Easy
   - 50% Medium
   - 20% Hard
11. Difficulty must be distributed across the full assessment as evenly as possible.
12. Every question must have a difficulty value of exactly "easy", "medium", or "hard".
13. Easy questions should test foundational concepts and basic application.
14. Medium questions should test practical understanding, problem solving, and common real-world scenarios.
15. Hard questions should test deeper reasoning, edge cases, debugging, optimization, or advanced practical application.
16. Do not make hard questions unnecessarily obscure or dependent on knowledge unrelated to the selected skill.
17. Do not provide explanations.
18. Return ONLY valid JSON.
19. correct_index must be 0, 1, 2 or 3.

Return exactly this structure:

{
  "questions": [
    {
      "id": "q1",
      "category": "Technical",
      "difficulty": "medium",
      "question": "Question text",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "correct_index": 0
    }
  ]
}
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Only POST requests are allowed." }, 405);
  }

  try {
    if (!GEMINI_API_KEY) {
      return json({ error: "GEMINI_API_KEY is not configured in Supabase Secrets." }, 500);
    }

    const user = await getUser(req);
    const body = await req.json();
    const requestId = body?.request_id;

    if (!requestId) {
      return json({ error: "request_id is required." }, 400);
    }

    // 1. Get approved assessment request
    const { data: request, error: requestError } = await admin
      .from("assessment_requests")
      .select("*")
      .eq("id", requestId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!request) {
      return json({ error: "Assessment request not found." }, 404);
    }

    /* ===== SERVER-SIDE ASSESSMENT ACCESS GATE ===== */
    let accessMode: string | null = null;
    let paidReattempt: any = null;
    /* Free reattempts until platform_settings.reattempt_payments_live is switched on. */
    const { data: paymentsLive } = await admin.rpc("reattempt_payments_live");
    const FREE_REATTEMPTS_TEMPORARILY_ENABLED = paymentsLive !== true;

    if (request.status === "approved") {
      // FIRST ATTEMPT
      accessMode = "first_attempt";
    } else if (request.status === "completed") {
      // REATTEMPT: load recent attempt history so temporary free access still obeys limits.
      const { data: attempts, error: attemptsError } = await admin
        .from("assessment_attempts")
        .select("*")
        .eq("user_id", user.id)
        .eq("request_id", requestId)
        .order("submitted_at", { ascending: false })
        .limit(100);

      if (attemptsError) throw attemptsError;

      const latestAttempt = attempts?.[0] || null;

      const nowMs = Date.now();
      const latestAttemptMs = new Date(
        latestAttempt?.submitted_at || latestAttempt?.created_at || 0,
      ).getTime();
      const cooldownMs = 24 * 60 * 60 * 1000;
      if (Number.isFinite(latestAttemptMs) && latestAttemptMs > 0 && nowMs - latestAttemptMs < cooldownMs) {
        const hours = Math.ceil((cooldownMs - (nowMs - latestAttemptMs)) / (60 * 60 * 1000));
        return json({
          error: `Retake cooldown active. You can retry this assessment in about ${hours} hour(s).`,
          code: "REATTEMPT_COOLDOWN",
        }, 429);
      }

      const rollingMonthMs = 30 * 24 * 60 * 60 * 1000;
      const attemptsInRollingMonth = (attempts || []).filter((attempt: any) => {
        const timestamp = new Date(attempt.submitted_at || attempt.created_at || 0).getTime();
        return Number.isFinite(timestamp) && timestamp > 0 && nowMs - timestamp < rollingMonthMs;
      }).length;
      if (attemptsInRollingMonth >= 4) {
        return json({
          error: "You have reached the maximum of 4 attempts for this assessment in the last 30 days.",
          code: "REATTEMPT_LIMIT_REACHED",
        }, 429);
      }

      // No previous attempt
      if (!latestAttempt) {
        return json({ error: "This assessment has already been completed." }, 403);
      }

      // Already passed
      if (latestAttempt.passed === true) {
        return json({
          error: "You have already passed this assessment. This assessment is verified and cannot be attempted again.",
        }, 403);
      }

      // Failed attempt -> check payment
      const { data: payments, error: paymentError } = await admin
        .from("assessment_payments")
        .select(`
      id,
      request_id,
      assessment_id,
      amount,
      status,
      entitlement_used,
      paid_at,
      created_at
    `)
        .eq("user_id", user.id)
        .eq("request_id", requestId)
        .eq("status", "paid")
        .eq("entitlement_used", false)
        .order("paid_at", { ascending: false })
        .limit(1);

      if (paymentError) throw paymentError;

      paidReattempt = payments?.[0] || null;

      // No unused payment
      if (!paidReattempt && !FREE_REATTEMPTS_TEMPORARILY_ENABLED) {
        return json({
          error: "You have already attempted this assessment. Please complete the reattempt payment before starting again.",
        }, 403);
      }

      accessMode = paidReattempt ? "paid_reattempt" : "free_reattempt";
    } else {
      // Any other request status
      return json({ error: "This assessment is not available to start." }, 403);
    }

    // 2. Get request details
    const { data: details, error: detailsError } = await admin
      .from("assessment_request_details")
      .select("*")
      .eq("request_id", requestId)
      .maybeSingle();

    if (detailsError) throw detailsError;

    // 3. Get student profile
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.warn("Profile warning:", profileError.message);
    }

    // 3B. Get selected assessment skill
    const { data: assessment, error: assessmentError } = await admin
      .from("assessments")
      .select("id,skill_id")
      .eq("id", request.assessment_id)
      .maybeSingle();

    if (assessmentError) throw assessmentError;

    let skillName = "General Skill";

    if (assessment?.skill_id) {
      const { data: skill, error: skillError } = await admin
        .from("skills")
        .select("name")
        .eq("id", assessment.skill_id)
        .maybeSingle();

      if (skillError) throw skillError;
      skillName = skill?.name || "General Skill";
    }

    // 3A. Get latest analyzed resume
    const { data: resume, error: resumeError } = await admin
      .from("student_resumes")
      .select("parsed_data,status")
      .eq("user_id", user.id)
      .eq("status", "analyzed")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (resumeError) {
      console.warn("Resume warning:", resumeError.message);
    }

    const resumeData = resume?.parsed_data || null;

    // 3C. FINAL STUDENT ELIGIBILITY GATE
    const requiredProfileFields = [
      profile?.full_name,
      profile?.city,
      profile?.college,
      profile?.degree,
      profile?.graduation_year,
      profile?.bio,
      profile?.github_url,
      profile?.linkedin_url,
      profile?.career_track,
    ];

    const profileComplete = requiredProfileFields.every(
      (value) => value !== null && value !== undefined && String(value).trim() !== "",
    );

    const resumeVerified =
      resume?.status === "analyzed" &&
      resumeData &&
      typeof resumeData === "object";

    if (!profileComplete) {
      return json({
        success: false,
        error: "Complete your Aldovra profile before accessing assessments.",
        code: "PROFILE_INCOMPLETE",
      }, 403);
    }

    if (!resumeVerified) {
      return json({
        success: false,
        error: "Upload and analyze your resume before accessing assessments.",
        code: "RESUME_NOT_VERIFIED",
      }, 403);
    }

    // 4. Assessment settings
    const assessmentName =
      details?.assessment_name ||
      request?.assessment_name ||
      "Aldovra Skill Assessment";

    const questionCount = Math.min(Math.max(Number(details?.question_count) || 30, 10), 50);
    const generationQuestionCount = Math.min(Math.max(Math.ceil(questionCount * 1.6), 30), 80);
    const durationMinutes = Math.min(Math.max(Number(details?.duration_minutes) || 20, 5), 120);
    const questionType = details?.question_type || "Technical + Scenario";

    // 5. Check existing active session
    const { data: activeSessions, error: activeError } = await admin
      .from("assessment_sessions")
      .select("id,status,expires_at,question_payload")
      .eq("user_id", user.id)
      .eq("assessment_id", request.assessment_id)
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1);

    if (activeError) throw activeError;

    if (activeSessions?.length) {
      const existing = activeSessions[0];

      if (existing.expires_at && new Date(existing.expires_at).getTime() > Date.now()) {
        const safeQuestions = (existing.question_payload || []).map((q: any) => ({
          id: q.id,
          category: q.category,
          difficulty: q.difficulty,
          question: q.question,
          options: q.options,
        }));

        const remainingSeconds = Math.max(
          0,
          Math.ceil((new Date(existing.expires_at).getTime() - Date.now()) / 1000),
        );

        return json({
          success: true,
          session_id: existing.id,
          questions: safeQuestions,
          duration_minutes: durationMinutes,
          remaining_seconds: remainingSeconds,
          total_questions: safeQuestions.length,
          resumed: true,
        });
      }

      await admin
        .from("assessment_sessions")
        .update({ status: "expired" })
        .eq("id", existing.id);
    }

    // 6. Ask Gemini to generate questions
    const prompt = buildPrompt(
      profile || {},
      resumeData,
      assessmentName,
      generationQuestionCount,
      questionType,
      skillName,
    );

    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`Gemini error: ${errorText}`);
    }

    const aiData = await aiResponse.json();

    let rawText = "";
    if (aiData?.candidates?.length) {
      rawText = aiData.candidates
        .flatMap((candidate: any) => candidate?.content?.parts || [])
        .map((part: any) => part?.text || "")
        .join("");
    }

    if (!rawText) throw new Error("Gemini returned an empty response.");

    let generated;
    try {
      generated = JSON.parse(rawText);
    } catch {
      throw new Error("Gemini returned invalid JSON.");
    }

    if (!Array.isArray(generated?.questions)) {
      throw new Error("Invalid question response from Gemini.");
    }

    // 7. Validate questions
    let questions = generated.questions
      .map((q: any, index: number) => ({
        id: String(q?.id || `q${index + 1}`),
        category: String(q?.category || "Technical"),
        difficulty: String(q?.difficulty || "medium"),
        question: String(q?.question || "").trim(),
        options: Array.isArray(q?.options)
          ? q.options.slice(0, 4).map((x: any) => String(x).trim())
          : [],
        correct_index: Number(q?.correct_index),
      }))
      .filter((q: any) =>
        q.question &&
        q.options.length === 4 &&
        q.options.every((x: string) => x.length > 0) &&
        Number.isInteger(q.correct_index) &&
        q.correct_index >= 0 &&
        q.correct_index <= 3
      );

    // 7B. Validate difficulty values
    const validDifficulties = new Set(["easy", "medium", "hard"]);

    questions = questions.filter((q: any) =>
      validDifficulties.has(String(q.difficulty).toLowerCase())
    );

    questions = questions.map((q: any) => ({
      ...q,
      difficulty: String(q.difficulty).toLowerCase(),
    }));

    if (questions.length < Math.min(10, questionCount)) {
      throw new Error("Not enough valid questions were generated.");
    }

    // 8. Remove duplicates
    const seen = new Set<string>();
    questions = questions.filter((q: any) => {
      const key = q.question.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 8B. Balance question difficulty
    const easyQuestions = questions.filter((q: any) => q.difficulty === "easy");
    const mediumQuestions = questions.filter((q: any) => q.difficulty === "medium");
    const hardQuestions = questions.filter((q: any) => q.difficulty === "hard");

    const targetEasy = Math.round(questionCount * 0.30);
    const targetMedium = Math.round(questionCount * 0.50);
    const targetHard = questionCount - targetEasy - targetMedium;

    if (
      easyQuestions.length < targetEasy ||
      mediumQuestions.length < targetMedium ||
      hardQuestions.length < targetHard
    ) {
      throw new Error(
        "AI did not generate enough questions for the required difficulty distribution. Please try again.",
      );
    }

    questions = [
      ...shuffle(easyQuestions).slice(0, targetEasy),
      ...shuffle(mediumQuestions).slice(0, targetMedium),
      ...shuffle(hardQuestions).slice(0, targetHard),
    ];

    // 9. Randomize question order
    questions = shuffle(questions.slice(0, questionCount));

    // 10. Randomize options
    questions = questions.map((q: any) => {
      const pairs = q.options.map((option: string, index: number) => ({
        option,
        originalIndex: index,
      }));
      const randomized = shuffle(pairs);
      const correctIndex = randomized.findIndex(
        (item: any) => item.originalIndex === q.correct_index,
      );

      return {
        id: q.id,
        category: q.category,
        difficulty: q.difficulty,
        question: q.question,
        options: randomized.map((item: any) => item.option),
        correct_index: correctIndex,
      };
    });

    // 11. Create session
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

    const { data: session, error: sessionError } = await admin
      .from("assessment_sessions")
      .insert({
        request_id: String(requestId),
        user_id: user.id,
        assessment_id: request.assessment_id,
        skill_name: assessmentName,
        status: "in_progress",
        question_payload: questions,
        started_at: startedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();

    if (sessionError) throw sessionError;

    /* ===== CONSUME PAID REATTEMPT ===== */
    if (accessMode === "paid_reattempt") {
      if (!paidReattempt?.id) {
        await admin.from("assessment_sessions").update({ status: "cancelled" }).eq("id", session.id);
        throw new Error("Paid reattempt entitlement not found.");
      }

      const { data: consumed, error: consumeError } = await admin.rpc(
        "consume_assessment_reattempt",
        {
          p_payment_id: paidReattempt.id,
          p_user_id: user.id,
          p_request_id: Number(requestId),
        },
      );

      if (consumeError) {
        await admin.from("assessment_sessions").update({ status: "cancelled" }).eq("id", session.id);
        throw consumeError;
      }

      if (consumed !== true) {
        await admin.from("assessment_sessions").update({ status: "cancelled" }).eq("id", session.id);
        throw new Error("This reattempt payment has already been used.");
      }
    }

    // 12. NEVER send correct answers to browser
    const safeQuestions = questions.map((q: any) => ({
      id: q.id,
      category: q.category,
      difficulty: q.difficulty,
      question: q.question,
      options: q.options,
    }));

    return json({
      success: true,
      session_id: session.id,
      questions: safeQuestions,
      duration_minutes: durationMinutes,
      remaining_seconds: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
      total_questions: safeQuestions.length,
      assessment_name: assessmentName,
      resumed: false,
    });
  } catch (error) {
    console.error("generate-assessment:", error);
    return json({
      error: error instanceof Error ? error.message : "Assessment generation failed.",
    }, 500);
  }
});
