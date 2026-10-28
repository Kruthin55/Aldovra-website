// Mirrors the deployed "analyze-resume" edge function. Resume skills are matched to the catalog with
// aliases (resume_skills.ts); first exam free, later skills wait for payment once payments are live.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resumeHasSkill } from "./resume_skills.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const PRIMARY_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanJsonText(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    /* ---------- AUTHENTICATION ---------- */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Authorization required." }, 401);
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Invalid authentication." }, 401);
    }

    /* ---------- REQUEST ---------- */
    const body = await req.json().catch(() => ({}));
    const resumeId = body?.resume_id;
    if (!resumeId) {
      return jsonResponse({ error: "resume_id is required." }, 400);
    }

    /* ---------- GET RESUME RECORD ---------- */
    const { data: resume, error: resumeError } = await supabaseAdmin
      .from("student_resumes")
      .select("id,user_id,file_name,file_path,status")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (resumeError) throw resumeError;
    if (!resume) {
      return jsonResponse({ error: "Resume not found." }, 404);
    }

    /* ---------- MARK ANALYZING ---------- */
    await supabaseAdmin
      .from("student_resumes")
      .update({ status: "analyzing" })
      .eq("id", resume.id)
      .eq("user_id", user.id);

    /* ---------- DOWNLOAD PRIVATE RESUME ---------- */
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from("student-resumes")
      .download(resume.file_path);

    if (downloadError || !fileData) {
      throw downloadError || new Error("Unable to download resume.");
    }

    /* ---------- FILE TYPE ---------- */
    const fileName = String(resume.file_name || "").toLowerCase();
    const isPdf = fileName.endsWith(".pdf");

    if (!isPdf) {
      await supabaseAdmin
        .from("student_resumes")
        .update({ status: "analysis_failed" })
        .eq("id", resume.id);

      return jsonResponse({
        error: "Resume analysis currently supports PDF files. DOC/DOCX analysis will be added in the next step.",
      }, 400);
    }

    /* ---------- PDF -> BASE64 ---------- */
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
    }
    const base64Pdf = btoa(binary);

    /* ---------- AI PROMPT ---------- */
    const prompt = `
You are Aldovra's resume analysis engine.

Analyze the attached student resume carefully.

Extract ONLY information supported by the resume.

Return ONLY valid JSON.

Use this exact structure:

{
  "full_name": "",
  "education": [],
  "skills": [],
  "programming_languages": [],
  "technologies": [],
  "tools": [],
  "projects": [],
  "experience": [],
  "certifications": [],
  "technical_areas": [],
  "summary": ""
}

Rules:

- Do not invent information.
- Keep skills and technologies separate where possible.
- Extract project names and meaningful project details.
- Extract programming languages explicitly mentioned.
- Extract tools/platforms explicitly mentioned.
- Extract education details.
- Extract work/internship experience if present.
- Extract certifications if present.
- technical_areas may include areas such as web development, data analysis, cloud computing, machine learning, databases, cybersecurity, etc., only when supported by the resume.
- summary should be a concise factual summary based only on the resume.
- Use empty arrays when information is unavailable.
`;

    /* ---------- GEMINI REQUEST WITH RETRY ---------- */
    async function callGemini(model: string) {
      const maxRetries = 3;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    { inline_data: { mime_type: "application/pdf", data: base64Pdf } },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json",
              },
            }),
          },
        );

        if (response.ok) return response;

        const errorText = await response.text();
        const retryable = [429, 500, 502, 503, 504].includes(response.status);

        if (!retryable) {
          throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        console.warn(`Gemini ${model} returned ${response.status}. Retry ${attempt + 1}/${maxRetries}`);

        if (attempt < maxRetries - 1) {
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      throw new Error(`Gemini ${model} failed after ${maxRetries} attempts.`);
    }

    /* ---------- PRIMARY + FALLBACK MODEL ---------- */
    let geminiResponse;
    try {
      geminiResponse = await callGemini(PRIMARY_MODEL);
      console.log(`Primary Gemini model succeeded: ${PRIMARY_MODEL}`);
    } catch (primaryError) {
      console.warn(`Primary Gemini model failed: ${PRIMARY_MODEL}`, primaryError);
      console.log(`Trying fallback Gemini model: ${FALLBACK_MODEL}`);
      geminiResponse = await callGemini(FALLBACK_MODEL);
      console.log(`Fallback Gemini model succeeded: ${FALLBACK_MODEL}`);
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text || "")
      .join("")
      .trim();

    if (!rawText) throw new Error("Gemini returned no analysis.");

    /* ---------- PARSE AI JSON ---------- */
    const parsedData = JSON.parse(cleanJsonText(rawText));

    /* ---------- SAVE RESULT ---------- */
    const { error: saveError } = await supabaseAdmin
      .from("student_resumes")
      .update({ status: "analyzed", parsed_data: parsedData })
      .eq("id", resume.id)
      .eq("user_id", user.id);

    if (saveError) throw saveError;

    /* ---------- AUTO-CREATE ASSESSMENT REQUESTS ---------- */
    const extractedSkills = [
      ...(Array.isArray(parsedData?.skills) ? parsedData.skills : []),
      ...(Array.isArray(parsedData?.programming_languages) ? parsedData.programming_languages : []),
      ...(Array.isArray(parsedData?.technologies) ? parsedData.technologies : []),
      ...(Array.isArray(parsedData?.tools) ? parsedData.tools : []),
      ...(Array.isArray(parsedData?.technical_areas) ? parsedData.technical_areas : []),
    ]
      .map((value) => String(value).trim())
      .filter(Boolean);

    /* ---------- NORMALIZE SKILL NAMES ---------- */
    function normalizeSkillName(value: unknown) {
      return String(value || "")
        .toLowerCase()
        .replace(/[._-]/g, " ")
        .replace(/[\/\\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const extractedSkillNames = [...new Set(extractedSkills.map(normalizeSkillName))];
    console.log("AUTO ASSESSMENT - EXTRACTED SKILLS:", extractedSkillNames);

    /* ---------- FIND MATCHING ACTIVE ASSESSMENTS ---------- */
    const { data: activeAssessments, error: assessmentLookupError } = await supabaseAdmin
      .from("assessments")
      .select(`
          id,
          skill_id,
          title,
          is_active
        `)
      .eq("is_active", true);

    if (assessmentLookupError) {
      console.warn("Assessment lookup warning:", assessmentLookupError.message);
    }

    /* ---------- LOAD SKILL NAMES ---------- */
    const skillIds = (activeAssessments || [])
      .map((assessment) => assessment.skill_id)
      .filter(Boolean);

    const { data: skillRows, error: skillLookupError } = await supabaseAdmin
      .from("skills")
      .select(`
          id,
          name,
          category
        `)
      .in("id", skillIds);

    if (skillLookupError) {
      console.warn("Skill lookup warning:", skillLookupError.message);
    }

    /* ---------- BUILD SKILL MAP ---------- */
    const skillMap = new Map((skillRows || []).map((skill) => [String(skill.id), skill]));

    /* ---------- MATCH RESUME SKILLS ---------- */
    // Alias-aware matching ("AWS Lambda" -> AWS, "Data Analysis" -> Data Analytics), one assessment per skill.
    const seenSkillIds = new Set<string>();
    const matchingAssessments = (activeAssessments || [])
      .slice()
      .sort((a: any, b: any) => Number(a.id) - Number(b.id))
      .filter((assessment: any) => {
        const skill = skillMap.get(String(assessment.skill_id));
        if (!skill || seenSkillIds.has(String(assessment.skill_id))) return false;
        const hit = extractedSkillNames.includes(normalizeSkillName(skill.name)) || resumeHasSkill(parsedData, skill.name);
        if (hit) seenSkillIds.add(String(assessment.skill_id));
        return hit;
      });

    console.log(
      "AUTO ASSESSMENT - MATCHING ASSESSMENTS:",
      matchingAssessments.map((assessment) => ({
        id: assessment.id,
        title: assessment.title,
        skill_id: assessment.skill_id,
      })),
    );

    /* ---------- CHECK EXISTING REQUESTS (prevent duplicates) ---------- */
    const assessmentIds = matchingAssessments.map((assessment) => assessment.id).filter(Boolean);

    let existingRequests: any[] = [];

    if (assessmentIds.length) {
      const { data, error } = await supabaseAdmin
        .from("assessment_requests")
        .select(`
            id,
            assessment_id,
            status
          `)
        .eq("user_id", user.id)
        .in("assessment_id", assessmentIds);

      if (error) {
        console.warn("Existing assessment request lookup warning:", error.message);
      } else {
        existingRequests = data || [];
        console.log("AUTO ASSESSMENT - USER ID:", user.id);
        console.log("AUTO ASSESSMENT - EXISTING REQUESTS:", existingRequests);
      }
    }

    const existingAssessmentIds = new Set(
      existingRequests.map((request) => String(request.assessment_id)),
    );
    console.log("AUTO ASSESSMENT - EXISTING ASSESSMENT IDS:", [...existingAssessmentIds]);

    /* ---------- STUDENT PROFILE ---------- */
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const studentName =
      profile?.full_name ||
      user.user_metadata?.full_name ||
      user.email ||
      "Student";

    /* ---------- CREATE NEW REQUESTS ---------- */
    console.log("AUTO ASSESSMENT - TOTAL MATCHES:", matchingAssessments.length);

    /* Pricing: first exam free. When payments are live, other skills wait for payment
       (fee from the latest exam score: 65%+ -> ₹50, else ₹100). */
    const { data: paymentsLive } = await supabaseAdmin.rpc("payments_live_for", { p_user: user.id });
    let freeSlotAvailable = true;
    let unlockFee: number | null = null;
    let feeBasis: number | null = null;
    if (paymentsLive === true) {
      const { count: priorRequests } = await supabaseAdmin
        .from("assessment_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("status", "in", "(rejected,payment_pending)");
      freeSlotAvailable = (priorRequests || 0) === 0;
      const { data: lastAttempt } = await supabaseAdmin
        .from("assessment_attempts")
        .select("percentage")
        .eq("user_id", user.id)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastAttempt) {
        feeBasis = Number(lastAttempt.percentage);
        unlockFee = Number.isFinite(feeBasis) && feeBasis >= 65 ? 50 : 100;
      }
    }

    for (const assessment of matchingAssessments) {
      if (existingAssessmentIds.has(String(assessment.id))) continue;

      const isFree = paymentsLive !== true || freeSlotAvailable;
      if (isFree) freeSlotAvailable = false;
      const nowIso = new Date().toISOString();

      const { error: requestError } = await supabaseAdmin
        .from("assessment_requests")
        .insert(isFree ? {
          user_id: user.id,
          assessment_id: assessment.id,
          status: "approved",
          student_email: user.email || null,
          student_name: studentName,
          approved_at: nowIso,
          reviewed_at: nowIso,
        } : {
          user_id: user.id,
          assessment_id: assessment.id,
          status: "payment_pending",
          student_email: user.email || null,
          student_name: studentName,
          unlock_fee: unlockFee,
          unlock_fee_basis: feeBasis,
        });

      if (requestError) {
        console.warn("Automatic assessment request creation warning:", requestError.message);
      }
    }

    /* ---------- SUCCESS ---------- */
    return jsonResponse({
      success: true,
      resume_id: resume.id,
      status: "analyzed",
      parsed_data: parsedData,
    });
  } catch (error) {
    console.error("Resume analysis error:", error);
    return jsonResponse({
      success: false,
      error: (error as any)?.message || "Resume analysis failed.",
    }, 500);
  }
});
