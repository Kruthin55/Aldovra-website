import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL")!;

const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY")!;

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

function json(
  data: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}


/* =========================================
   AUTHENTICATED USER
========================================= */

async function getUser(req: Request) {

  const authorization =
    req.headers.get(
      "Authorization"
    );

  if (!authorization) {
    throw new Error(
      "Missing authorization."
    );
  }

  const userClient =
    createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization:
              authorization,
          },
        },
      }
    );

  const {
    data: { user },
    error,
  } =
    await userClient.auth.getUser();

  if (
    error ||
    !user
  ) {
    throw new Error(
      "Unauthorized."
    );
  }

  return user;
}


/* =========================================
   CATEGORY SCORES
========================================= */

function calculateCategoryScores(
  questions: any[],
  answerMap: Map<string, number>
) {

  const categories:
    Record<
      string,
      {
        correct: number;
        total: number;
      }
    > = {};

  for (
    const question of questions
  ) {

    const category =
      question.category ||
      "Technical";

    if (!categories[category]) {

      categories[category] = {
        correct: 0,
        total: 0,
      };

    }

    categories[category].total++;

    const selected =
      answerMap.get(
        String(question.id)
      );

    if (
      selected !== undefined &&
      selected ===
        Number(
          question.correct_index
        )
    ) {

      categories[
        category
      ].correct++;

    }

  }

  const result:
    Record<string, number> = {};

  for (
    const [category, value]
    of Object.entries(
      categories
    )
  ) {

    result[category] =
      value.total > 0
        ? Number(
            (
              (value.correct /
                value.total) *
              100
            ).toFixed(2)
          )
        : 0;

  }

  return result;
}


/* =========================================
   PUBLIC RESULT
========================================= */

function publicResult(
  report: any,
  attemptId:
    | number
    | null
    | undefined
) {

  return {

    success: true,

    attempt_id:
      attemptId ??
      report?.attempt_id ??
      null,

    score:
      report?.score ?? 0,

    total_questions:
      report?.total_questions ??
      0,

    percentage:
      Number(
        report?.percentage ?? 0
      ),

    verification_status:
      report?.verification_status ??
      "pending",

    evaluation_status:
      report?.evaluation_status ??
      "evaluating",

    category_scores:
      report?.category_scores ??
      {},

    result_message:
      report?.result_message ??
      "Your assessment is being evaluated.",

    expired:
      report?.session_expired ??
      false,

  };

}


/* =========================================
   MAIN FUNCTION
========================================= */

Deno.serve(
  async (req) => {

    if (
      req.method ===
      "OPTIONS"
    ) {

      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        }
      );

    }

    if (
      req.method !==
      "POST"
    ) {

      return json(
        {
          error:
            "Only POST requests are allowed.",
        },
        405
      );

    }


    try {

      /* -------------------------------------
         AUTH
      ------------------------------------- */

      const user =
        await getUser(req);

      const body =
        await req.json();

      const sessionId =
        body?.session_id;

      const incomingAnswers =
        Array.isArray(
          body?.answers
        )
          ? body.answers
          : [];

      const monitoringEvents =
        Array.isArray(
          body?.events
        )
          ? body.events
          : [];

      const evidence =
        body?.evidence ||
        {};


      if (!sessionId) {

        return json(
          {
            error:
              "session_id is required.",
          },
          400
        );

      }


      /* -------------------------------------
         LOAD SESSION
      ------------------------------------- */

      const {
        data: session,
        error: sessionError,
      } =
        await admin
          .from(
            "assessment_sessions"
          )
          .select("*")
          .eq(
            "id",
            sessionId
          )
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();


      if (sessionError) {

        throw sessionError;

      }


      if (!session) {

        return json(
          {
            error:
              "Assessment session not found.",
          },
          404
        );

      }


      /* -------------------------------------
         CHECK EXISTING REPORT
      ------------------------------------- */

      const {
        data: existingReport,
        error:
          existingReportError,
      } =
        await admin
          .from(
            "assessment_reports"
          )
          .select("*")
          .eq(
            "session_id",
            sessionId
          )
          .maybeSingle();


      if (
        existingReportError
      ) {

        throw existingReportError;

      }


      /*
        If this assessment has already
        finished, return the existing result.

        This prevents duplicate attempts if
        the student clicks twice or browser
        retries the request.
      */

      if (
        existingReport &&
        existingReport
          .evaluation_status ===
          "completed"
      ) {

        return json(
          publicResult(
            existingReport,
            existingReport.attempt_id
          )
        );

      }


      /* -------------------------------------
         LOAD QUESTIONS
      ------------------------------------- */

      const questions =
        Array.isArray(
          session.question_payload
        )
          ? session.question_payload
          : [];


      if (
        !questions.length
      ) {

        return json(
          {
            error:
              "No questions were found for this assessment session.",
          },
          400
        );

      }


      /* -------------------------------------
         ANSWERS
      ------------------------------------- */

      const savedAnswers =
        Array.isArray(
          session.answer_payload
        )
          ? session.answer_payload
          : [];

      const submittedAnswers =
        incomingAnswers.length
          ? incomingAnswers
          : savedAnswers;


      const now =
        new Date();


      /* -------------------------------------
         CHECK EXPIRATION
      ------------------------------------- */

      // The browser auto-submits at zero; allow a small network
      // transit grace period so normal timer submissions are not lost.
      const expiryTime = session.expires_at
        ? new Date(session.expires_at).getTime()
        : null;
      const expired =
        expiryTime !== null &&
        Number.isFinite(expiryTime) &&
        now.getTime() > expiryTime + 15_000;

      if (expired) {
        // Preserve the submitted answers for support/audit, but never
        // score an expired session or grant verification from it.
        const { error: expiredUpdateError } = await admin
          .from("assessment_sessions")
          .update({
            status: "expired",
            submitted_at: session.submitted_at || now.toISOString(),
            answer_payload: submittedAnswers,
          })
          .eq("id", sessionId)
          .eq("user_id", user.id);

        if (expiredUpdateError) {
          throw expiredUpdateError;
        }

        return json(
          {
            success: false,
            error: "This assessment session has expired. Start an eligible reattempt to try again.",
            code: "ASSESSMENT_SESSION_EXPIRED",
          },
          410
        );
      }


      /* -------------------------------------
         BUILD ANSWER MAP
      ------------------------------------- */

      const answerMap =
        new Map<
          string,
          number
        >();


      for (
        const answer
        of submittedAnswers
      ) {

        if (
          !answer ||
          answer.question_id ===
            undefined ||
          answer.selected_index ===
            undefined ||
          answer.selected_index ===
            null
        ) {

          continue;

        }


        const selected =
          Number(
            answer.selected_index
          );


        if (
          !Number.isInteger(
            selected
          ) ||
          selected < 0 ||
          selected > 3
        ) {

          continue;

        }


        answerMap.set(
          String(
            answer.question_id
          ),
          selected
        );

      }


      /* -------------------------------------
         SAVE SUBMISSION IMMEDIATELY
      ------------------------------------- */

      const submissionUpdate =
        {

          status:
            expired
              ? "expired"
              : "submitted",

          submitted_at:
            session.submitted_at ||
            now.toISOString(),

          answer_payload:
            submittedAnswers,

        };


      const {
        error:
          submissionError,
      } =
        await admin
          .from(
            "assessment_sessions"
          )
          .update(
            submissionUpdate
          )
          .eq(
            "id",
            sessionId
          )
          .eq(
            "user_id",
            user.id
          );


      if (
        submissionError
      ) {

        throw submissionError;

      }


      /* -------------------------------------
         SAVE MONITORING EVENTS
      ------------------------------------- */

      if (
        monitoringEvents.length
      ) {

        const eventRows =
          monitoringEvents.map(
            (event: any) => ({

              session_id:
                sessionId,

              event_type:
                String(
                  event?.type ||
                  "unknown"
                ),

              event_meta:
                event?.meta ||
                {},

              occurred_at:
                event?.at ||
                now.toISOString(),

            })
          );


        const {
          error:
            eventError,
        } =
          await admin
            .from(
              "assessment_monitor_events"
            )
            .insert(
              eventRows
            );


        /*
          Monitoring event failure should
          not destroy the student's result.
        */

        if (
          eventError
        ) {

          console.warn(
            "Monitoring event save warning:",
            eventError.message
          );

        }

      }


      /* -------------------------------------
         SAVE RECORDING METADATA
      ------------------------------------- */

      if (
        evidence?.camera_path ||
        evidence?.screen_path
      ) {

        const {
          error:
            evidenceError,
        } =
          await admin
            .from(
              "assessment_evidence"
            )
            .upsert(
              {

                session_id:
                  sessionId,

                user_id:
                  user.id,

                camera_path:
                  evidence.camera_path ||
                  null,

                screen_path:
                  evidence.screen_path ||
                  null,

              },
              {
                onConflict:
                  "session_id",
              }
            );


        if (
          evidenceError
        ) {

          console.warn(
            "Evidence metadata warning:",
            evidenceError.message
          );

        }

      }


      /* -------------------------------------
         CREATE EVALUATING REPORT
      ------------------------------------- */

      const {
        data:
          pendingReport,
        error:
          pendingError,
      } =
        await admin
          .from(
            "assessment_reports"
          )
          .upsert(
            {

              session_id:
                sessionId,

              user_id:
                user.id,

              score: 0,

              total_questions:
                questions.length,

              percentage: 0,

              verification_status:
                "pending",

              evaluation_status:
                "evaluating",

              category_scores:
                {},

              result_message:
                "Your assessment has been submitted. Evaluation is in progress.",

              evaluation_started_at:
                existingReport
                  ?.evaluation_started_at ||
                now.toISOString(),

            },
            {
              onConflict:
                "session_id",
            }
          )
          .select("*")
          .single();


      if (
        pendingError
      ) {

        throw pendingError;

      }


      /* -------------------------------------
         SCORE ASSESSMENT
      ------------------------------------- */

      let score = 0;


      for (
        const question
        of questions
      ) {

        const selected =
          answerMap.has(
            String(
              question.id
            )
          )
            ? answerMap.get(
                String(
                  question.id
                )
              )!
            : null;


        if (
          selected !== null &&
          selected ===
            Number(
              question.correct_index
            )
        ) {

          score++;

        }

      }


      const totalQuestions =
        questions.length;


      const percentage =
        totalQuestions > 0
          ? Number(
              (
                (score /
                  totalQuestions) *
                100
              ).toFixed(2)
            )
          : 0;


      /* -------------------------------------
         ALDOVRA VERIFICATION RULE
      ------------------------------------- */

      // A score is not verified until the student submits the required
      // environment-video evidence link. The score itself remains visible.
      const verificationStatus = "pending";

      const resultMessage =
        "Your assessment score is ready. Submit your YouTube Unlisted environment video link to complete verification.";


      /* -------------------------------------
         CATEGORY SCORES
      ------------------------------------- */

      const categoryScores =
        calculateCategoryScores(
          questions,
          answerMap
        );


      /* -------------------------------------
         CREATE ATTEMPT
      ------------------------------------- */

      let attemptId:
        | number
        | null =
        pendingReport
          ?.attempt_id ??
        existingReport
          ?.attempt_id ??
        null;


      if (!attemptId) {

        const {
          count:
            attemptCount,
          error:
            countError,
        } =
          await admin
            .from(
              "assessment_attempts"
            )
            .select(
              "id",
              {
                count:
                  "exact",
                head: true,
              }
            )
            .eq(
              "user_id",
              user.id
            )
            .eq(
              "assessment_id",
              session.assessment_id
            );


        if (
          countError
        ) {

          throw countError;

        }


        const attemptNumber =
          (attemptCount || 0) +
          1;


        const {
          data:
            attempt,
          error:
            attemptError,
        } =
          await admin
            .from(
              "assessment_attempts"
            )
            .insert(
              {

                user_id:
                  user.id,

                assessment_id:
                  session.assessment_id,

                session_id:
                  sessionId,

                request_id:
                  session.request_id,

                skill_name:
                  session.skill_name,

                attempt_number:
                  attemptNumber,

                score,

                total_questions:
                  totalQuestions,

                percentage,

                passed:
                  percentage >= 75,

                started_at:
                  session.started_at ||
                  now.toISOString(),

                submitted_at:
                  session.submitted_at ||
                  now.toISOString(),

              }
            )
            .select("id")
            .single();


        if (
          attemptError
        ) {

          throw attemptError;

        }


        attemptId =
          attempt.id;

      }


     /* -------------------------------------
   SAVE ANSWERS
------------------------------------- */

const answerRows =
  questions.map(
    (question: any) => {

      const questionId =
        String(
          question.id
        );

      const selected =
        answerMap.has(
          questionId
        )
          ? answerMap.get(
              questionId
            )!
          : null;

      const isCorrect =
        selected !== null &&
        selected ===
          Number(
            question.correct_index
          );

      return {

        session_id:
          sessionId,

        question_id:
          questionId,

        selected_index:
          selected,

        is_correct:
          isCorrect,

      };

    }
  );


if (
  answerRows.length
) {

  const {
    error:
      answersError,
  } =
    await admin
      .from(
        "assessment_answers"
      )
      .upsert(
        answerRows,
        {
          onConflict:
            "session_id,question_id",
        }
      );


  if (
    answersError
  ) {

    console.warn(
      "Assessment answers save warning:",
      answersError.message
    );

  }

}


      /* -------------------------------------
         FINAL REPORT
      ------------------------------------- */

      const completedAt =
        new Date()
          .toISOString();


      const {
        data:
          finalReport,
        error:
          finalReportError,
      } =
        await admin
          .from(
            "assessment_reports"
          )
          .update(
            {

              attempt_id:
                attemptId,

              score,

              total_questions:
                totalQuestions,

              percentage,

              verification_status:
                verificationStatus,

              evaluation_status:
                "completed",

              category_scores:
                categoryScores,

              result_message:
                resultMessage,

              evaluation_completed_at:
                completedAt,

            }
          )
          .eq(
            "session_id",
            sessionId
          )
          .select("*")
          .single();


      if (
        finalReportError
      ) {

        throw finalReportError;

      }


      /* -------------------------------------
         VERIFIED SKILL SYNC IS DEFERRED
         The authenticated video-link submission function will mark the
         skill verified only after evidence has been linked and score >= 75.
      ------------------------------------- */


      /* -------------------------------------
         SYNC ASSESSMENT REQUEST
      ------------------------------------- */

      const {
        data: request,
      } =
        await admin
          .from(
            "assessment_requests"
          )
          .select("id")
          .eq(
            "id",
            String(
              session.request_id
            )
          )
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();


      if (request) {

        /* -------------------------------
           UPDATE REQUEST DETAILS
        ------------------------------- */

        const {
          data:
            requestDetails,
        } =
          await admin
            .from(
              "assessment_request_details"
            )
            .select("id")
            .eq(
              "request_id",
              request.id
            )
            .maybeSingle();


        if (
          requestDetails?.id
        ) {

          const {
            error:
              detailsUpdateError,
          } =
            await admin
              .from(
                "assessment_request_details"
              )
              .update(
                {

                  score:
                    percentage,

                  verification_status:
                    verificationStatus,

                }
              )
              .eq(
                "id",
                requestDetails.id
              );


          if (
            detailsUpdateError
          ) {

            console.warn(
              "Request details sync warning:",
              detailsUpdateError.message
            );

          }

        }


        /* -------------------------------
           MARK REQUEST COMPLETED
        ------------------------------- */

        const {
          error:
            requestUpdateError,
        } =
          await admin
            .from(
              "assessment_requests"
            )
            .update(
              {

                status:
                  "completed",

                completed_at:
                  completedAt,

              }
            )
            .eq(
              "id",
              request.id
            )
            .eq(
              "user_id",
              user.id
            );


        if (
          requestUpdateError
        ) {

          console.warn(
            "Assessment request sync warning:",
            requestUpdateError.message
          );

        }

      }


      /* -------------------------------------
         RETURN FINAL RESULT
      ------------------------------------- */

      return json(
        publicResult(
          finalReport,
          attemptId
        )
      );


    } catch (
      error
    ) {

      console.error(
        "submit-assessment error:",
        error
      );


      return json(
        {

          error:
            error instanceof Error
              ? error.message
              : "Assessment submission failed.",

        },
        500
      );

    }

  }
);