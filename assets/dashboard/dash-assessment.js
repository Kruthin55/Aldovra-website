/* ========================================================
   HELPERS
======================================================== */

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      })[char],
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function showModal() {
  $("assessmentModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("assessmentDonutTooltip")?.remove();
  $("assessmentModal").classList.add("hidden");
}

const closeModalBtn = $("closeModalBtn");

if (closeModalBtn) {
  closeModalBtn.onclick = closeModal;
}

$("assessmentModal").onclick = (event) => {
  if (event.target.id === "assessmentModal") {
    closeModal();
  }
};

/* ========================================================
   DASHBOARD DATA STATE
======================================================== */

let profile = null;

let assessmentRequests = [];

let assessmentDetails = [];
let assessmentPayments = [];

let reports = [];

let attempts = [];

let evidence = [];

let screeningCalls = [];
let screeningCallsLoading = false;
let notifications = [];
let notificationsUnreadCount = 0;
/* =====================================================
   8D — LOAD NOTIFICATIONS
===================================================== */

async function loadNotifications() {
  if (!currentUser) {
    return;
  }
  try {
    const { data, error } = await db
      .from("notifications")
      .select("id,title,message,type,is_read,created_at")
      .eq("user_id", currentUser.id)
      .order("created_at", {
        ascending: false,
      })
      .limit(30);
    if (error) {
      throw error;
    }
    notifications = data || [];
    notificationsUnreadCount = notifications.filter((notification) => notification.is_read !== true).length;
    updateNotificationBadge();
    renderNotifications();
  } catch (error) {
    console.error("Notifications loading error:", error);
    notifications = [];
    notificationsUnreadCount = 0;
    updateNotificationBadge();
    renderNotifications();
  }
}
/* =====================================================
   8D — NOTIFICATION PANEL TOGGLE
===================================================== */

const notificationBtn = document.getElementById("notificationBtn");

const notificationPanel = document.getElementById("notificationPanel");

const markAllNotificationsReadBtn = document.getElementById("markAllNotificationsReadBtn");

if (markAllNotificationsReadBtn) {
  markAllNotificationsReadBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    markAllNotificationsRead();
  });
}

if (notificationBtn && notificationPanel) {
  notificationBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = notificationPanel.classList.contains("show");
    if (isOpen) {
      notificationPanel.classList.remove("show");
      notificationPanel.setAttribute("aria-hidden", "true");
      notificationBtn.setAttribute("aria-expanded", "false");
    } else {
      notificationPanel.classList.add("show");
      notificationPanel.setAttribute("aria-hidden", "false");
      notificationBtn.setAttribute("aria-expanded", "true");
    }
  });
}

/* =====================================================
   8D — CLOSE NOTIFICATION PANEL OUTSIDE CLICK
===================================================== */

document.addEventListener("click", (event) => {
  if (!notificationPanel || !notificationBtn) {
    return;
  }
  if (notificationPanel.contains(event.target) || notificationBtn.contains(event.target)) {
    return;
  }
  notificationPanel.classList.remove("show");
  notificationPanel.setAttribute("aria-hidden", "true");
  notificationBtn.setAttribute("aria-expanded", "false");
});
/* =====================================================
   8D — UPDATE NOTIFICATION BADGE
===================================================== */

function updateNotificationBadge() {
  const badge = document.getElementById("notificationBadge");
  const unreadText = document.getElementById("notificationUnreadText");
  if (!badge) {
    return;
  }
  const count = Number(notificationsUnreadCount || 0);
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.style.display = "flex";
  } else {
    badge.textContent = "0";
    badge.style.display = "none";
  }
  if (unreadText) {
    unreadText.textContent =
      count > 0 ? `${count} unread notification${count === 1 ? "" : "s"}` : "No new notifications";
  }
}
/* =====================================================
   8D — RENDER NOTIFICATIONS
===================================================== */

function renderNotifications() {
  const list = document.getElementById("notificationList");
  if (!list) {
    return;
  }
  if (!notifications.length) {
    list.innerHTML = `
      <div class="notification-empty">
        <div class="notification-empty-icon">
          🔔
        </div>

        <strong>No notifications yet</strong>

        <span>
          Your Aldovra updates will appear here.
        </span>
      </div>
    `;
    return;
  }
  list.innerHTML = notifications
    .map((notification) => {
      const isUnread = notification.is_read !== true;
      const title = escapeHtml(notification.title || "Notification");
      const message = escapeHtml(notification.message || "");
      const type = String(notification.type || "general")
        .trim()
        .toLowerCase();
      const icon =
        type === "assessment"
          ? "📝"
          : type === "resume"
            ? "📄"
            : type === "screening"
              ? "📞"
              : type === "profile"
                ? "👤"
                : "🔔";
      let createdText = "";
      if (notification.created_at) {
        const createdDate = new Date(notification.created_at);
        if (!Number.isNaN(createdDate.getTime())) {
          createdText = createdDate.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      }
      return `
            <article
              class="notification-item ${isUnread ? "unread" : ""}"
              data-notification-id="${notification.id}"
            >

              <div class="notification-item-icon">
                ${icon}
              </div>

              <div class="notification-item-content">

                <div class="notification-item-top">

                  <strong>
                    ${title}
                  </strong>

                  ${
                    isUnread
                      ? `
                        <span
                          class="notification-unread-dot"
                          aria-label="Unread"
                        ></span>
                      `
                      : ""
                  }

                </div>

                <p>
                  ${message}
                </p>

                ${
                  createdText
                    ? `
                      <span class="notification-item-time">
                        ${escapeHtml(createdText)}
                      </span>
                    `
                    : ""
                }

              </div>

            </article>
          `;
    })
    .join("");
}
/* =====================================================
   8D — MARK ALL NOTIFICATIONS AS READ
===================================================== */

async function markAllNotificationsRead() {
  if (!currentUser) {
    return;
  }
  const unreadNotifications = notifications.filter((notification) => notification.is_read !== true);
  if (!unreadNotifications.length) {
    updateNotificationBadge();
    return;
  }
  const unreadIds = unreadNotifications.map((notification) => notification.id);
  try {
    const { error } = await db
      .from("notifications")
      .update({
        is_read: true,
      })
      .eq("user_id", currentUser.id)
      .in("id", unreadIds);
    if (error) {
      throw error;
    }
    notifications = notifications.map((notification) => ({
      ...notification,
      is_read: true,
    }));
    notificationsUnreadCount = 0;
    updateNotificationBadge();
    renderNotifications();
  } catch (error) {
    console.error("Mark notifications read error:", error);
  }
}
/* ========================================================
   AUTH
======================================================== */

async function requireUser() {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) {
    location.href = "/login.html?redirect=" + encodeURIComponent(location.pathname);
    return null;
  }
  return data.user;
}

/* ========================================================
   LOAD PROFILE
======================================================== */

async function loadProfile() {
  const { data, error } = await db.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
  if (error) {
    console.error("Profile error:", error);
    return;
  }
  profile = data || {};
  const name = profile.full_name || currentUser.email || "Student";

  /* Welcome */
  const welcomeName = $("welcomeName");
  if (welcomeName) {
    welcomeName.textContent = name;
  }

  /* Full Name */
  const profileName = $("profileName");
  if (profileName) {
    profileName.value = profile.full_name || "";
  }

  /* Email */
  const profileEmail = $("profileEmail");
  if (profileEmail) {
    profileEmail.value = profile.email || currentUser.email || "";
  }

  /* Account Type */
  const profileRole = $("profileRole");
  if (profileRole) {
    profileRole.value = profile.role || "student";
  }

  /* City */
  const profileCity = $("profileCity");
  if (profileCity) {
    profileCity.value = profile.city || "";
  }

  /* College */
  const profileCollege = $("profileCollege");
  if (profileCollege) {
    profileCollege.value = profile.college || profile.college_name || "";
  }

  /* Degree */
  const profileDegree = $("profileDegree");
  if (profileDegree) {
    profileDegree.value = profile.degree || "";
  }

  /* Graduation Year */
  const profileGraduationYear = $("profileGraduationYear");
  if (profileGraduationYear) {
    profileGraduationYear.value = profile.graduation_year || profile.passout_year || "";
  }

  /* Target Career */
  const targetCareer = $("targetCareer");
  if (targetCareer) {
    targetCareer.value = profile.career_track || "";
  }

  /* Bio */
  const profileBio = $("profileBio");
  if (profileBio) {
    profileBio.value = profile.bio || "";
  }

  /* GitHub */
  const profileGithub = $("profileGithub");
  if (profileGithub) {
    profileGithub.value = profile.github_url || profile.github || "";
  }
}

/* ========================================================
   LOAD ASSESSMENT REQUESTS
======================================================== */

async function loadAssessmentRequests() {
  const { data, error } = await db
    .from("assessment_requests")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false,
    });
  if (error) {
    console.error("Assessment requests error:", error);
    assessmentRequests = [];
    assessmentDetails = [];
    return;
  }
  assessmentRequests = data || [];
  /* =====================================================
     LOAD ASSESSMENT TITLES IN ONE QUERY
  ===================================================== */
  const assessmentIds = [
    ...new Set(assessmentRequests.map((request) => request.assessment_id).filter(Boolean)),
  ];
  if (assessmentIds.length) {
    const { data: assessments, error: assessmentsError } = await db
      .from("assessments")
      .select("id,title,skill_id")
      .in("id", assessmentIds);
    if (assessmentsError) {
      console.error("Assessment titles error:", assessmentsError);
    } else {
      const assessmentMap = new Map(
        (assessments || []).map((assessment) => [String(assessment.id), assessment.title]),
      );
      const assessmentSkillMap = new Map(
        (assessments || []).map((assessment) => [String(assessment.id), assessment.skill_id]),
      );
      assessmentRequests = assessmentRequests.map((request) => ({
        ...request,
        assessment_name: assessmentMap.get(String(request.assessment_id)) || request.assessment_name || null,
        assessment_skill_id: assessmentSkillMap.get(String(request.assessment_id)) || null,
      }));
    }
  }

  /* =====================================================
     LOAD REQUEST DETAILS IN ONE QUERY
  ===================================================== */
  assessmentDetails = [];
  const requestIds = assessmentRequests.map((request) => request.id).filter(Boolean);
  if (requestIds.length) {
    const { data: details, error: detailsError } = await db
      .from("assessment_request_details")
      .select("*")
      .in("request_id", requestIds);
    if (detailsError) {
      console.error("Assessment details error:", detailsError);
    } else {
      assessmentDetails = details || [];
    }
  }
}

/* ========================================================
   LOAD REPORTS
======================================================== */

async function loadReports() {
  const { data, error } = await db
    .from("assessment_reports")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false,
    })
    .limit(50);
  if (error) {
    console.error("Assessment reports error:", error);
    reports = [];
    return;
  }
  reports = data || [];
}
/* ========================================================
   LOAD ASSESSMENT PAYMENTS
======================================================== */

async function loadAssessmentPayments() {
  if (!currentUser) {
    assessmentPayments = [];
    return;
  }
  const { data, error } = await db
    .from("assessment_payments")
    .select(
      `
      id,
      request_id,
      assessment_id,
      amount,
      currency,
      razorpay_order_id,
      razorpay_payment_id,
      status,
      entitlement_used,
      paid_at,
      created_at
    `,
    )
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false,
    });
  if (error) {
    console.error("Assessment payments error:", error);
    assessmentPayments = [];
    return;
  }
  assessmentPayments = data || [];
}
/* ========================================================
   FIND UNUSED PAID REATTEMPT
======================================================== */

function getPaidReattemptForRequest(requestId) {
  if (!requestId) {
    return null;
  }
  return (
    assessmentPayments
      .filter(
        (payment) =>
          String(payment.request_id) === String(requestId) &&
          payment.status === "paid" &&
          payment.entitlement_used !== true,
      )
      .sort((a, b) => new Date(b.paid_at || b.created_at) - new Date(a.paid_at || a.created_at))[0] || null
  );
}

/* ========================================================
   LOAD ATTEMPTS
======================================================== */

async function loadAttempts() {
  const { data, error } = await db
    .from("assessment_attempts")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("submitted_at", {
      ascending: false,
    })
    .limit(100);
  if (error) {
    console.error("Assessment attempts error:", error);
    attempts = [];
    return;
  }
  attempts = data || [];
}

/* ========================================================
   LOAD EVIDENCE
======================================================== */

async function loadEvidence() {
  const { data, error } = await db.from("assessment_evidence").select("*").eq("user_id", currentUser.id);
  if (error) {
    console.error("Assessment evidence error:", error);
    evidence = [];
    return;
  }
  evidence = data || [];
}

/* ========================================================
   LOAD SCREENING CALLS
======================================================== */

async function loadScreeningCalls() {
  screeningCallsLoading = true;
  const { data, error } = await db
    .from("screening_calls")
    .select("*")
    .eq("student_id", currentUser.id)
    .order("scheduled_at", {
      ascending: false,
    });
  if (error) {
    console.error("Screening calls error:", error);
    screeningCalls = [];
    screeningCallsLoading = false;
    return;
  }
  screeningCalls = data || [];
  screeningCallsLoading = false;
}

/* ========================================================
   FIND DETAILS
======================================================== */

function detailsForRequest(requestId) {
  return assessmentDetails.find((detail) => String(detail.request_id) === String(requestId)) || null;
}

/* ========================================================
   FIND LATEST REPORT
======================================================== */

function latestReport() {
  return reports[0] || null;
}

/* ========================================================
   EVALUATING STATE
======================================================== */

/* ========================================================
   RENDER STATS
======================================================== */
/* ========================================================
   BUILD SKILL VERIFICATION STATUS
======================================================== */

function buildSkillVerificationStatus() {
  const statusMap = new Map();
  assessmentRequests.forEach((request) => {
    const skillId = request.assessment_skill_id;
    const assessmentId = request.assessment_id;
    if (!skillId || !assessmentId) {
      return;
    }

    // Verification evidence must belong to this specific request.
    // Matching only by assessment ID can leak a pass across requests.
    const relatedAttempts = attempts.filter(
      (attempt) => String(attempt.request_id || "") === String(request.id),
    );
    if (!relatedAttempts.length) {
      return;
    }
    const hasPassed = relatedAttempts.some(
      (attempt) =>
        attempt.passed === true &&
        (attempt.percentage === null || attempt.percentage === undefined || Number(attempt.percentage) >= 75),
    );

    /*
        IMPORTANT:
        Once a skill is verified,
        a later failed attempt must
        never downgrade it.
      */
    if (hasPassed) {
      statusMap.set(String(skillId), "verified");
    } else if (!statusMap.has(String(skillId))) {
      statusMap.set(String(skillId), "reattempt");
    }
  });
  return statusMap;
}
function renderStats() {
  const completed = new Set(
    attempts
      .filter((attempt) => attempt.submitted_at && attempt.assessment_id)
      .map((attempt) => String(attempt.assessment_id)),
  ).size;
  $("statCompleted").textContent = completed;
  $("statAttempts").textContent = attempts.length;
  const skillVerificationStatus = buildSkillVerificationStatus();
  const latest = latestReport();
  const requiredRequests = (assessmentRequests || []).filter(
    (request) => request && request.id && request.assessment_id,
  );
  const latestReportForRequest = (request) => {
    const matchingReports = (reports || []).filter((report) => {
      if (report.request_id != null && String(report.request_id) === String(request.id)) {
        return true;
      }
      const attempt = (attempts || []).find(
        (item) =>
          (report.attempt_id != null && String(item.id) === String(report.attempt_id)) ||
          (report.session_id && item.session_id && String(item.session_id) === String(report.session_id)),
      );
      return Boolean(
        attempt && attempt.request_id != null && String(attempt.request_id) === String(request.id),
      );
    });
    return (
      matchingReports.sort(
        (a, b) =>
          new Date(b.submitted_at || b.created_at || 0).getTime() -
          new Date(a.submitted_at || a.created_at || 0).getTime(),
      )[0] || null
    );
  };
  const verifiedAssessmentCount = requiredRequests.filter((request) => {
    const latestForRequest = latestReportForRequest(request);
    const reportEvidence = latestForRequest
      ? (evidence || []).find(
          (item) => String(item.session_id || "") === String(latestForRequest.session_id || ""),
        )
      : null;
    return Boolean(
      latestForRequest &&
      reportEvidence?.environment_video_url &&
      latestForRequest.evaluation_status === "completed" &&
      latestForRequest.verification_status === "eligible" &&
      Number(latestForRequest.percentage) >= 75,
    );
  }).length;
  const allRequiredVerified =
    requiredRequests.length > 0 && verifiedAssessmentCount === requiredRequests.length;
  if (allRequiredVerified) {
    $("statVerification").textContent = "Overall Verified";
  } else if (latest?.evaluation_status === "evaluating" || latest?.verification_status === "pending") {
    $("statVerification").textContent = "Evaluating";
  } else if (requiredRequests.length > 0) {
    $("statVerification").textContent =
      verifiedAssessmentCount + "/" + requiredRequests.length + " Exams Verified";
  } else {
    $("statVerification").textContent = "Pending";
  }
  $("statScreening").textContent = screeningCalls.length;
}
/* ========================================================
   RENDER OVERVIEW PROGRESS
======================================================== */

function renderOverviewProgress() {
  const assignedRequests = (assessmentRequests || []).filter(
    (request) => request && request.id && request.assessment_id,
  );
  const completedRequestIds = new Set(
    (attempts || [])
      .filter((attempt) => attempt && attempt.submitted_at && attempt.request_id)
      .map((attempt) => String(attempt.request_id)),
  );
  const totalAssigned = assignedRequests.length;
  const completed = assignedRequests.filter((request) => completedRequestIds.has(String(request.id))).length;
  const progress = totalAssigned > 0 ? Math.min(Math.round((completed / totalAssigned) * 100), 100) : 0;
  const progressValue = $("overviewProgressValue");
  const progressFill = $("overviewProgressFill");
  const nextGoal = $("overviewNextGoal");
  if (progressValue) {
    progressValue.textContent = progress + "%";
  }
  if (progressFill) {
    progressFill.style.width = progress + "%";
  }
  if (nextGoal) {
    if (progress >= 100) {
      nextGoal.textContent = "Assigned assessments complete — next, verify your skills 🎯";
    } else {
      const remaining = Math.max(0, totalAssigned - completed);
      nextGoal.textContent =
        remaining > 0
          ? "Complete " + remaining + " more assigned assessment" + (remaining > 1 ? "s" : "")
          : "No assessments assigned yet";
    }
  }
}

/* ========================================================
   STATUS CLASS
======================================================== */

function statusClass(status) {
  if (status === "approved") return "approved";
  if (status === "completed") return "completed";
  if (status === "evaluating") return "evaluating";
  if (status === "reattempt_required") return "reattempt";
  return "pending";
}

/* ========================================================
   STATUS TEXT
======================================================== */

function statusText(status) {
  const map = {
    pending: "Assessment Request Pending",
    approved: "Assessment Approved",
    evaluating: "Evaluating",
    completed: "Exam Completed",
    reattempt_required: "Reattempt Required",
    environment_video_pending: "Environment Video Pending",
    payment_pending: "Payment Pending",
  };
  return map[status] || status || "Pending";
}

/* ========================================================
   RENDER ASSESSMENTS
======================================================== */
/* =====================================================
   BATCH 7B — PROFILE SKILL VERIFICATION
===================================================== */

function renderProfileVerification() {
  const list = document.getElementById("profileVerificationList");
  const verifiedCount = document.getElementById("profileVerifiedCount");
  const reattemptCount = document.getElementById("profileReattemptCount");
  const progressCount = document.getElementById("profileProgressCount");
  if (!list) {
    return;
  }
  const requests = Array.isArray(assessmentRequests) ? assessmentRequests : [];
  let verified = 0;
  let reattempt = 0;
  let progress = 0;
  if (!requests.length) {
    list.innerHTML = `
      <div class="profile-verification-empty">
        Complete an assessment to see your skill verification status here.
      </div>
    `;
    if (verifiedCount) {
      verifiedCount.textContent = "0";
    }
    if (reattemptCount) {
      reattemptCount.textContent = "0";
    }
    if (progressCount) {
      progressCount.textContent = "0";
    }
    return;
  }
  const cards = [];
  requests.forEach((request) => {
    const matchingReports = reports.filter((report) => {
      if (report.request_id && String(report.request_id) === String(request.id)) {
        return true;
      }
      if (report.attempt_id) {
        const attempt = attempts.find((item) => String(item.id) === String(report.attempt_id));
        if (attempt && attempt.request_id && String(attempt.request_id) === String(request.id)) {
          return true;
        }
      }
      if (report.session_id) {
        const attempt = attempts.find((item) => String(item.session_id || "") === String(report.session_id));
        if (attempt && attempt.request_id && String(attempt.request_id) === String(request.id)) {
          return true;
        }
      }
      return false;
    });
    const report = matchingReports.length
      ? matchingReports
          .slice()
          .sort(
            (a, b) =>
              new Date(b.submitted_at || b.created_at || 0).getTime() -
              new Date(a.submitted_at || a.created_at || 0).getTime(),
          )[0]
      : null;
    const scoreValue =
      report?.percentage !== undefined && report?.percentage !== null ? Number(report.percentage) : null;
    let state = "pending";
    if (report?.evaluation_status === "evaluating") {
      state = "progress";
    } else if (report?.evaluation_status === "completed") {
      const reportEvidence = (evidence || []).find(
        (item) => String(item.session_id || "") === String(report.session_id || ""),
      );
      if (!reportEvidence?.environment_video_url) {
        state = "video_pending";
      } else if (report.verification_status === "pending_review") {
        state = "video_review";
      } else if (report.verification_status === "eligible") {
        state = "verified";
      } else {
        state = "reattempt";
      }
    } else if (request.status === "approved") {
      state = "progress";
    }
    if (state === "verified") {
      verified++;
    } else if (state === "reattempt") {
      reattempt++;
    } else {
      progress++;
    }
    const assessmentName =
      request.assessment_name || report?.assessment_name || report?.skill_name || "Skill Assessment";
    const scoreText = Number.isFinite(scoreValue) ? `Score: ${scoreValue}%` : "Score not available";
    let statusLabel = "Pending";
    if (state === "verified") {
      statusLabel = "✓ Verified";
    } else if (state === "reattempt") {
      statusLabel = "Reattempt Required";
    } else if (state === "video_pending") {
      statusLabel = "Environment Video Pending";
    } else if (state === "video_review") {
      statusLabel = "Environment Video Under Review";
    } else if (state === "progress") {
      statusLabel =
        report?.evaluation_status === "evaluating" ? "Evaluation in Progress" : "Assessment Approved";
    }
    const button =
      report &&
      (report.evaluation_status === "completed" ||
        report.verification_status === "eligible" ||
        report.verification_status === "reattempt_required")
        ? `
            <button
              type="button"
              class="profile-verification-action"
              data-view-result="${esc(request.id)}"
            >
              View Result
            </button>
          `
        : "";
    cards.push(`
        <div
          class="profile-verification-item"
        >

          <div
            class="profile-verification-info"
          >

            <strong>
              ${esc(assessmentName)}
            </strong>

            <small>
              ${esc(scoreText)}
            </small>

          </div>


          <div
            class="profile-verification-right"
          >

            <span
              class="profile-verification-score"
            >
              ${esc(scoreText.replace("Score: ", ""))}
            </span>

            <span
            
              class="
  profile-verification-status
  ${state === "progress" || state === "video_pending" ? "in-progress" : state}
"
            >
              ${esc(statusLabel)}
            </span>

            ${button}

          </div>

        </div>
      `);
  });
  list.innerHTML = cards.join("");
  if (verifiedCount) {
    verifiedCount.textContent = String(verified);
  }
  if (reattemptCount) {
    reattemptCount.textContent = String(reattempt);
  }
  if (progressCount) {
    progressCount.textContent = String(progress);
  }
}
function renderAssessments() {
  const container = $("assessmentList");
  const resultContainer = $("assessmentResultList");
  const assessmentCount = $("assessmentCount");
  const resultCount = $("resultCount");
  if (!assessmentRequests.length) {
    container.innerHTML = `
<div class="empty">
No assessment requests yet.
</div>
`;
    if (resultContainer) {
      resultContainer.innerHTML = `
<div class="empty">
No completed results yet.
</div>
`;
    }
    if (assessmentCount) {
      assessmentCount.textContent = "0";
    }
    if (resultCount) {
      resultCount.textContent = "0";
    }
    return;
  }

  /* =====================================================
   BUILD ASSESSMENT CARDS
===================================================== */
  const assessmentCards = [];
  const resultCards = [];
  assessmentRequests.forEach((request) => {
    const detail = detailsForRequest(request.id);

    /* ----------------------------------------
   Find reports belonging to this request
---------------------------------------- */
    const matchingReports = reports.filter((report) => {
      if (report.request_id && String(report.request_id) === String(request.id)) {
        return true;
      }
      if (report.attempt_id) {
        const attempt = attempts.find((item) => String(item.id) === String(report.attempt_id));
        if (attempt && attempt.request_id && String(attempt.request_id) === String(request.id)) {
          return true;
        }
      }
      if (report.session_id) {
        const attempt = attempts.find((item) => String(item.session_id || "") === String(report.session_id));
        if (attempt && attempt.request_id && String(attempt.request_id) === String(request.id)) {
          return true;
        }
      }
      return false;
    });

    /* ----------------------------------------
   Use latest report
---------------------------------------- */
    const report = matchingReports.length
      ? matchingReports
          .slice()
          .sort(
            (a, b) =>
              new Date(b.submitted_at || b.created_at || 0).getTime() -
              new Date(a.submitted_at || a.created_at || 0).getTime(),
          )[0]
      : null;

    /* ----------------------------------------
   Determine status
---------------------------------------- */
    let status = request.status || "pending";
    if (report?.evaluation_status === "evaluating") {
      status = "evaluating";
    } else if (report?.evaluation_status === "completed") {
      const reportEvidence = (evidence || []).find(
        (item) => String(item.session_id || "") === String(report.session_id || ""),
      );
      status = reportEvidence?.environment_video_url ? "completed" : "environment_video_pending";
      if (report.verification_status === "reattempt_required" && reportEvidence?.environment_video_url) {
        status = "reattempt_required";
      }
    }

    /* ----------------------------------------
   Score
---------------------------------------- */
    const scoreValue =
      report?.percentage !== undefined && report?.percentage !== null
        ? Number(report.percentage)
        : detail?.score !== null && detail?.score !== undefined
          ? Number(detail.score)
          : null;
    const score = Number.isFinite(scoreValue) ? `${scoreValue}%` : "Not available";
    /* ----------------------------------------
   REATTEMPT FEE
---------------------------------------- */
    const reattemptFee = Number.isFinite(scoreValue)
      ? scoreValue >= 75
        ? null
        : scoreValue >= 65
          ? 50
          : 100
      : null;
    const paidReattempt = getPaidReattemptForRequest(request.id);
    const hasPaidReattempt = Boolean(paidReattempt);
    const FREE_REATTEMPTS_TEMPORARILY_ENABLED = !window.ALDOVRA_PAYMENTS_LIVE;
    const reattemptLastAt = new Date(report?.submitted_at || report?.created_at || 0).getTime();
    const reattemptOpensAt =
      Number.isFinite(reattemptLastAt) && reattemptLastAt > 0 ? reattemptLastAt + 864e5 : 0;
    const reattemptLocked = reattemptOpensAt > Date.now();
    const reattemptLockedButton = reattemptLocked
      ? `
    <button class="btn btn-small reattempt-btn" type="button" disabled aria-disabled="true"
      title="Reattempts open 24 hours after your last attempt">
      Reattempt from ${new Date(reattemptOpensAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · ₹${esc(reattemptFee ?? "")}
    </button>`
      : "";

    /* ----------------------------------------
   Button
---------------------------------------- */
    const button =
      status === "payment_pending"
        ? (() => {
            const latestAnyAttempt = (attempts || [])
              .filter((a) => a && (a.submitted_at || a.created_at))
              .sort(
                (a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at),
              )[0];
            if (!latestAnyAttempt) {
              return `
<button class="btn btn-small" type="button" disabled aria-disabled="true"
title="Your first assessment is free. Other skills unlock after it.">
🔒 Unlocks after your free first exam
</button>`;
            }
            const unlockFee =
              Number(request.unlock_fee) || (Number(latestAnyAttempt.percentage) >= 65 ? 50 : 100);
            return `
<button
class="btn btn-primary btn-small"
type="button"
data-pay-new-skill="${esc(request.id)}"
title="Fee is based on your latest exam score">
Pay ₹${esc(unlockFee)} to unlock →
</button>`;
          })()
        : status === "approved"
          ? `
<button
class="btn btn-primary btn-small"
data-open-assessment="${esc(request.id)}">
Attend Assessment →
</button>
`
          : status === "evaluating"
            ? `
<button
class="btn btn-small"
data-view-result="${esc(request.id)}">
View Evaluation
</button>
`
            : status === "reattempt_required"
              ? `
<div class="assessment-action-group">

<button
class="btn btn-small"
data-view-result="${esc(request.id)}">
View Result
</button>

${
  hasPaidReattempt || FREE_REATTEMPTS_TEMPORARILY_ENABLED
    ? `
    <button
      class="btn btn-primary btn-small"
      type="button"
      data-open-reattempt="${esc(request.id)}">

      ${hasPaidReattempt ? "Start Paid Reattempt →" : "Free Reattempt →"}

    </button>
    `
    : window.ALDOVRA_PAYMENTS_LIVE && reattemptLocked
      ? reattemptLockedButton
      : window.ALDOVRA_PAYMENTS_LIVE
        ? `
    <button
      class="btn btn-primary btn-small reattempt-btn"
      type="button"
      data-reattempt-request="${esc(request.id)}"
      data-reattempt-fee="${esc(reattemptFee ?? "")}"
      title="Secure payment via PayU">

      Pay ₹${esc(reattemptFee ?? "")} &amp; reattempt →

    </button>
    `
        : `
    <button
      class="btn btn-small reattempt-btn"
      type="button"
      disabled
      aria-disabled="true"
      data-reattempt-request="${esc(request.id)}"
      data-reattempt-fee="${esc(reattemptFee ?? "")}"
      title="Paid reattempts are temporarily unavailable while payment setup is finalized">

      Payment setup pending · ₹${esc(reattemptFee ?? "")}

    </button>
    `
}

</div>
`
              : status === "completed" || status === "environment_video_pending"
                ? `
<div class="assessment-action-group">
  <button
    class="btn btn-small"
    data-view-result="${esc(request.id)}">
    View Result
  </button>
  ${
    Number.isFinite(scoreValue) && scoreValue < 75 && reattemptFee !== null
      ? hasPaidReattempt || !window.ALDOVRA_PAYMENTS_LIVE
        ? `
    <button
      class="btn btn-primary btn-small"
      type="button"
      data-open-reattempt="${esc(request.id)}">
      ${hasPaidReattempt ? "Start Paid Reattempt →" : "Free Reattempt →"}
    </button>
  `
        : reattemptLocked
          ? reattemptLockedButton
          : `
    <button
      class="btn btn-primary btn-small reattempt-btn"
      type="button"
      data-reattempt-request="${esc(request.id)}"
      data-reattempt-fee="${esc(reattemptFee)}"
      title="Secure payment via PayU">
      Pay ₹${esc(reattemptFee)} &amp; reattempt →
    </button>
  `
      : ""
  }
</div>
`
                : "";

    /* ----------------------------------------
   Card
---------------------------------------- */
    const card = `
<div class="assessment-row">

<div class="assessment-info">

<h4>
${esc(detail?.assessment_name || request.assessment_name || "Aldovra Skill Assessment")}
</h4>

<div class="assessment-meta">

Status:
${esc(statusText(status))}

<br>

${detail?.question_count ? esc(detail.question_count) + " questions · " : ""}

${detail?.duration_minutes ? esc(detail.duration_minutes) + " minutes" : ""}

${
  score !== "Not available"
    ? `
<br>
Score: <b>${esc(score)}</b>

${
  ["completed", "environment_video_pending", "reattempt_required"].includes(status) &&
  Number.isFinite(scoreValue) &&
  scoreValue < 75 &&
  reattemptFee !== null
    ? `<br>${status === "reattempt_required" ? "Reattempt fee" : "Potential reattempt fee"}: <b>₹${esc(reattemptFee)}</b>`
    : ""
}
`
    : ""
}

</div>

</div>

<div class="assessment-right">

<span class="status ${statusClass(status)}">
${status === "completed" && Number.isFinite(scoreValue) && scoreValue >= 75 ? "Verified" : statusText(status)}
</span>

${button}

</div>

</div>
`;

    /* ----------------------------------------
   DIVIDE INTO TWO SECTIONS
---------------------------------------- */
    if (status === "completed" || status === "reattempt_required" || status === "environment_video_pending") {
      /*
  75% or above = Verified
  Below 75% = Reattempt Required
*/
      if (status !== "environment_video_pending" && Number.isFinite(scoreValue) && scoreValue >= 75) {
        resultCards.push(card.replace("status reattempt", "status completed"));
      } else {
        resultCards.push(card);
      }
    } else {
      assessmentCards.push(card);
    }
  });

  /* =====================================================
   RENDER LEFT — ASSESSMENTS
===================================================== */
  if (assessmentCards.length) {
    container.innerHTML = assessmentCards.join("");
  } else {
    container.innerHTML = `
<div class="empty">
No active assessments right now.
</div>
`;
  }

  /* =====================================================
   RENDER RIGHT — VERIFIED / REATTEMPT
===================================================== */
  if (resultCards.length) {
    resultContainer.innerHTML = resultCards.join("");
  } else {
    resultContainer.innerHTML = `
<div class="empty">
No completed assessment results yet.
</div>
`;
  }

  /* =====================================================
   COUNTS
===================================================== */
  if (assessmentCount) {
    assessmentCount.textContent = String(assessmentCards.length);
  }
  if (resultCount) {
    resultCount.textContent = String(resultCards.length);
  }

  /* =====================================================
   ATTEND ASSESSMENT
===================================================== */
  container.querySelectorAll("[data-open-assessment]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.openAssessment;
      const request = assessmentRequests.find((r) => String(r.id) === String(id));
      openAssessment(request);
    };
  });

  /* =====================================================
   VIEW RESULT
===================================================== */
  resultContainer.querySelectorAll("[data-view-result]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.viewResult;
      const request = assessmentRequests.find((r) => String(r.id) === String(id));
      openResultModal(request);
    };
  });

  /* =====================================================
   VIEW EVALUATION
===================================================== */
  container.querySelectorAll("[data-view-result]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.viewResult;
      const request = assessmentRequests.find((r) => String(r.id) === String(id));
      openResultModal(request);
    };
  });

  /* =====================================================
   REATTEMPT PAYMENT
===================================================== */
  resultContainer.querySelectorAll("[data-reattempt-request]").forEach((button) => {
    button.onclick = () => {
      const requestId = button.dataset.reattemptRequest;
      const fee = button.dataset.reattemptFee;
      if (!requestId || !fee) {
        console.error("Missing reattempt payment data.");
        return;
      }
      startReattemptPayment(requestId, fee);
    };
  });

  /* =====================================================
   START PAID REATTEMPT
===================================================== */
  resultContainer.querySelectorAll("[data-open-reattempt]").forEach((button) => {
    button.onclick = () => {
      const requestId = button.dataset.openReattempt;
      const request = assessmentRequests.find((item) => String(item.id) === String(requestId));
      if (!request) {
        return;
      }
      const paidReattempt = getPaidReattemptForRequest(requestId);
      if (!paidReattempt && window.ALDOVRA_PAYMENTS_LIVE) {
        alert("Your reattempt payment could not be verified. Please refresh and try again.");
        return;
      }
      openAssessment(request);
    };
  });
}
/* ========================================================
   RECOMMENDED ASSESSMENTS
======================================================== */

function renderRecommendedAssessments() {
  const container = $("recommendedAssessmentsList");
  if (!container) return;
  if (!assessmentRequests.length) {
    container.innerHTML = `
      <div class="recommended-empty">

        <div class="recommended-empty-icon">
          🎯
        </div>

        <div>
          <strong>
            No assessments available yet
          </strong>

          <span>
            New assessments will appear here when they become available.
          </span>
        </div>

      </div>
    `;
    return;
  }
  const recommendations = assessmentRequests
    .filter(
      (request) => request && request.id && (request.status === "approved" || request.status === "pending"),
    )
    .filter((request) => {
      // Keep each request isolated: another request for the same
      // assessment must not make this request appear completed.
      const relatedAttempts = attempts.filter(
        (attempt) => String(attempt.request_id || "") === String(request.id),
      );
      if (!relatedAttempts.length) {
        return true;
      }
      const latestAttempt = [...relatedAttempts].sort(
        (a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at),
      )[0];
      const latestAttemptPassed =
        latestAttempt?.passed === true &&
        (latestAttempt.percentage === null ||
          latestAttempt.percentage === undefined ||
          Number(latestAttempt.percentage) >= 75);
      return !latestAttemptPassed;
    })
    .slice(0, 4);
  container.innerHTML = recommendations
    .map((request) => {
      const detail = detailsForRequest(request.id);
      const relatedAttempts = attempts
        .filter((attempt) => String(attempt.request_id || "") === String(request.id))
        .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));
      const latestAttempt = relatedAttempts[0] || null;
      let status = "available";
      let statusLabel = "Available";
      let actionLabel = "Start Assessment →";
      if (latestAttempt) {
        if (
          latestAttempt.passed === true &&
          (latestAttempt.percentage === null ||
            latestAttempt.percentage === undefined ||
            Number(latestAttempt.percentage) >= 75)
        ) {
          status = "verified";
          statusLabel = "Verified";
          actionLabel = "View Result →";
        } else {
          status = "reattempt";
          statusLabel = "Reattempt";
          actionLabel = "Reattempt →";
        }
      }
      const assessmentName = request.assessment_name || detail?.assessment_name || "Aldovra Skill Assessment";
      const questionCount = detail?.question_count || latestAttempt?.total_questions || null;
      const duration = detail?.duration_minutes || null;
      return `
          <div class="recommended-assessment-item">

            <div class="recommended-assessment-top">

              <div class="recommended-assessment-icon">
                🎯
              </div>

              <span class="recommended-assessment-badge">
                ${esc(statusLabel)}
              </span>

            </div>


            <h3>
              ${esc(assessmentName)}
            </h3>


          <p>
  Complete this assessment to verify this skill
  and strengthen your Aldovra profile.
</p>


            <div class="recommended-assessment-meta">

              ${questionCount ? `<span>${esc(questionCount)} Questions</span>` : ""}

              ${duration ? `<span>${esc(duration)} Minutes</span>` : ""}

              <span>Skill Verification</span>

            </div>


            <button
              type="button"
              class="recommended-assessment-action"
              data-recommended-assessment="${esc(request.id)}"
              data-recommended-action="${status}"
            >
              ${actionLabel}
            </button>

          </div>
        `;
    })
    .join("");
  container.querySelectorAll("[data-recommended-assessment]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.recommendedAssessment;
      const request = assessmentRequests.find((item) => String(item.id) === String(id));
      if (!request) return;
      const action = button.dataset.recommendedAction;
      if (action === "verified") {
        openResultModal(request);
        return;
      }

      /* ==========================================
   REATTEMPT
========================================== */
      if (action === "reattempt") {
        const paidReattempt = getPaidReattemptForRequest(request.id);

        /* ------------------------------------------
     ALREADY PAID
  ------------------------------------------ */
        if (paidReattempt) {
          openAssessment(request);
          return;
        }

        /* ------------------------------------------
     PAYMENT REQUIRED
  ------------------------------------------ */

        /*
         * Prefer attempts linked to this exact request. Matching only by
         * assessment_id can accidentally use a different request's score
         * when the same assessment is assigned more than once.
         */
        const requestAttempts = attempts.filter(
          (attempt) => String(attempt.request_id || "") === String(request.id),
        );
        const relatedAttempts = (
          requestAttempts.length
            ? requestAttempts
            : attempts.filter(
                (attempt) => String(attempt.assessment_id || "") === String(request.assessment_id || ""),
              )
        ).sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));
        const latestAttempt = relatedAttempts[0] || null;
        const matchingReport =
          reports.find((report) => {
            if (String(report.request_id || "") === String(request.id)) {
              return true;
            }
            if (
              latestAttempt &&
              report.attempt_id &&
              String(report.attempt_id) === String(latestAttempt.id)
            ) {
              return true;
            }
            return false;
          }) || null;
        const scoreValue =
          matchingReport?.percentage !== undefined && matchingReport?.percentage !== null
            ? Number(matchingReport.percentage)
            : latestAttempt?.percentage !== undefined && latestAttempt?.percentage !== null
              ? Number(latestAttempt.percentage)
              : null;

        /*
         * Pricing policy:
         * 65–74% => ₹50 reattempt
         * below 65% => ₹100 reattempt
         * 75%+ meets the verification threshold and must not be charged
         * for a reattempt from this failed-attempt path.
         */
        const reattemptFee = Number.isFinite(scoreValue)
          ? scoreValue >= 75
            ? null
            : scoreValue >= 65
              ? 50
              : 100
          : null;
        if (Number.isFinite(scoreValue) && scoreValue >= 75) {
          alert(
            "Your score meets the 75% verification threshold. Refresh your dashboard to view your updated verification status.",
          );
          return;
        }
        if (!Number.isFinite(reattemptFee)) {
          alert("Unable to determine the reattempt fee. Please refresh and try again.");
          return;
        }
        startReattemptPayment(request.id, reattemptFee);
        return;
      }

      /* ==========================================
   NORMAL NEW ASSESSMENT
========================================== */
      openAssessment(request);
    };
  });
}

/* ========================================================
   OPEN APPROVED ASSESSMENT
======================================================== */

function openAssessment(request) {
  if (!request) return;
  const url = `/assessment.html?request=${encodeURIComponent(request.id)}`;
  location.href = url;
}

/* ========================================================
   SIGN PRIVATE VIDEO
======================================================== */

async function signedUrl(path) {
  if (!path) return null;
  const { data, error } = await db.storage.from("assessment-evidence").createSignedUrl(path, 1800);
  if (error) {
    console.error("Signed URL error:", error);
    return null;
  }
  return data?.signedUrl || null;
}

/* ========================================================
   VIDEO HTML
======================================================== */

/* ========================================================
   LIVE RESULTS
======================================================== */

async function renderLiveResults() {
  // Phase 3: results are opened from My Assessments → View Result.
  // No separate Results & Recordings dashboard section is rendered.
}

/* ========================================================
   PHASE 3 — RESULT MODAL
======================================================== */

async function openResultModal(request) {
  const relatedRequestAttempts = attempts
    .filter((attempt) => String(attempt.request_id || "") === String(request?.id || ""))
    .sort(
      (a, b) =>
        new Date(b.submitted_at || b.created_at || 0).getTime() -
        new Date(a.submitted_at || a.created_at || 0).getTime(),
    );
  const latestRequestAttempt = relatedRequestAttempts[0] || null;
  const reportForLatestAttempt = latestRequestAttempt
    ? reports.find(
        (item) =>
          (latestRequestAttempt.id && String(item.attempt_id || "") === String(latestRequestAttempt.id)) ||
          (latestRequestAttempt.session_id &&
            String(item.session_id || "") === String(latestRequestAttempt.session_id)),
      )
    : null;
  const relatedReports = reports
    .filter((item) => {
      const linkedAttempt = attempts.find(
        (attempt) =>
          (item.attempt_id && String(attempt.id || "") === String(item.attempt_id)) ||
          (item.session_id && String(attempt.session_id || "") === String(item.session_id)),
      );
      return Boolean(linkedAttempt && String(linkedAttempt.request_id || "") === String(request?.id || ""));
    })
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const report = reportForLatestAttempt || relatedReports[0] || null;
  const modalBody = $("modalBody");
  if (!modalBody) return;
  modalBody.closest(".assessment-result-modal")?.classList.remove("rr-mode");

  /* ======================================================
     NO REPORT
  ====================================================== */
  if (!report) {
    modalBody.innerHTML = `

      <div class="assessment-result-head">

        <div>

          <h2>
            Assessment Result
          </h2>

          <p>
            Result is not available yet.
          </p>

        </div>


        <button
          id="dashboardResultClose"
          class="result-close-button"
          type="button"
          aria-label="Close result"
        >
          ✕
        </button>

      </div>


      <div class="assessment-result-panel">

        <div class="result-empty">

          Your assessment result will
          appear here after evaluation.

        </div>

      </div>

    `;
    showModal();
    document.getElementById("dashboardResultClose")?.addEventListener("click", closeModal);
    return;
  }

  /* ======================================================
     STATUS
  ====================================================== */
  const evaluating =
    report.evaluation_status === "evaluating" ||
    (report.verification_status === "pending" && report.evaluation_status !== "completed");
  const assessmentEvidence =
    (evidence || []).find((item) => String(item.session_id || "") === String(report.session_id || "")) ||
    null;
  const environmentVideoUrl = String(assessmentEvidence?.environment_video_url || "").trim();
  const environmentVideoRejected =
    Boolean(environmentVideoUrl) &&
    report.verification_status === "reattempt_required" &&
    /not approved|rejected/i.test(String(report.result_message || ""));
  const environmentVideoPending = report.evaluation_status === "completed" && !environmentVideoUrl;
  const environmentVideoUnderReview =
    Boolean(environmentVideoUrl) && report.verification_status === "pending_review";
  const reportEligible = report.verification_status === "eligible" && Number(report.percentage) >= 75;
  const environmentVideoUnverified =
    Boolean(environmentVideoUrl) &&
    report.verification_status === "reattempt_required" &&
    !environmentVideoRejected;
  const statusClass =
    evaluating || environmentVideoPending || environmentVideoUnderReview
      ? "pending"
      : reportEligible
        ? "success"
        : "warning";
  const statusLabel = evaluating
    ? "Evaluation in Progress"
    : environmentVideoRejected
      ? "Video Rejected — Re-upload Required"
      : environmentVideoPending
        ? "Environment Video Pending"
        : environmentVideoUnderReview
          ? "Environment Video Under Review"
          : reportEligible
            ? "Verified"
            : environmentVideoUnverified
              ? "Unverified"
              : "Reattempt Required";

  /* ======================================================
     BASIC DATA
  ====================================================== */
  const assessmentName =
    report.assessment_name || report.skill_name || request?.assessment_name || "Aldovra Skill Assessment";
  const attemptedAt = report.created_at ? formatDate(report.created_at) : "Not available";
  const overall = Number(report.percentage);
  const reattemptFeeForResult = Number.isFinite(overall)
    ? overall >= 75
      ? null
      : overall >= 65
        ? 50
        : 100
    : null;
  const performanceGuidance = !Number.isFinite(overall)
    ? "Your score is not available yet. Refresh after evaluation completes."
    : overall >= 75
      ? "You met the 75% benchmark. Keep your environment video Unlisted until Aldovra finishes reviewing it."
      : overall >= 65
        ? "You are close to the verification benchmark. Review subject-wise analysis, practise weaker topics, and aim for at least 75% on a reattempt."
        : "Start with the fundamentals and revisit incorrect answers. Use the subject-wise analysis to identify weak topics before trying again.";
  const score = Number.isFinite(overall) ? `${Math.round(overall)}%` : "—";
  const correctCount = Number(report.score) || 0;
  const questionCount = Number(report.total_questions) || 0;
  const unansweredCount = Number(report.unanswered_questions ?? report.unattempted ?? 0) || 0;
  const incorrectCount = Math.max(0, questionCount - correctCount - unansweredCount);
  const matchingAttempt =
    attempts.find(
      (attempt) =>
        (report.attempt_id && String(attempt.id) === String(report.attempt_id)) ||
        (report.session_id && String(attempt.session_id) === String(report.session_id)),
    ) ||
    attempts[0] ||
    null;

  /* ======================================================
   LOAD ACTUAL SESSION TIMING
====================================================== */
  let sessionTiming = null;
  if (report.session_id) {
    const { data: timingData, error: timingError } = await db
      .from("assessment_sessions")
      .select("id,started_at,submitted_at")
      .eq("id", report.session_id)
      .maybeSingle();
    if (timingError) {
      console.warn("Session timing load warning:", timingError);
    }
    sessionTiming = timingData || null;
  }

  /* ======================================================
   ATTEMPT NUMBER
====================================================== */
  const sameAssessmentAttempts = attempts
    .filter(
      (attempt) => report.assessment_id && String(attempt.assessment_id) === String(report.assessment_id),
    )
    .sort(
      (a, b) =>
        new Date(a.submitted_at || a.created_at || 0).getTime() -
        new Date(b.submitted_at || b.created_at || 0).getTime(),
    );
  let attemptNumber =
    report.attempt_number ??
    matchingAttempt?.attempt_number ??
    request?.attempt_number ??
    (sameAssessmentAttempts.length
      ? sameAssessmentAttempts.findIndex((attempt) => String(attempt.id) === String(matchingAttempt?.id)) + 1
      : 1);
  if (!Number.isFinite(Number(attemptNumber)) || Number(attemptNumber) < 1) {
    attemptNumber = 1;
  }

  /* ======================================================
   ACTUAL TIME TAKEN
====================================================== */
  let durationText = "—";
  const startedAt = matchingAttempt?.started_at || sessionTiming?.started_at || report.started_at || null;
  const submittedAt =
    matchingAttempt?.submitted_at || sessionTiming?.submitted_at || report.submitted_at || null;
  if (startedAt && submittedAt) {
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(submittedAt).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      const totalSeconds = Math.round((endMs - startMs) / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) {
        durationText = `${hours}h ${minutes}m ${seconds}s`;
      } else {
        durationText = `${minutes}m ${seconds}s`;
      }
    }
  }
  const resultMessage = evaluating
    ? report.result_message ||
      "Your assessment was submitted successfully. Aldovra is evaluating your result."
    : environmentVideoPending
      ? "Your score is ready. Upload your mobile-recorded exam environment video to YouTube as Unlisted, then submit the link here. Your result will be verified after review."
      : environmentVideoUnderReview
        ? "Your environment video link is saved. Aldovra is reviewing the evidence; your final verification status will appear here after review."
        : reportEligible
          ? report.result_message || "Your assessment and environment video have been verified by Aldovra."
          : environmentVideoUnverified
            ? report.result_message ||
              "Your environment video was not approved. Please review the feedback or contact Aldovra support."
            : report.result_message ||
              "Your assessment has been recorded. A score of at least 75% and approved environment evidence are required for verification.";

  /* ======================================================
     SUBJECT SCORES
  ====================================================== */
  const categoryScores =
    report.category_scores && typeof report.category_scores === "object"
      ? Object.entries(report.category_scores)
          .filter(([, value]) => Number.isFinite(Number(value)))
          .map(([name, value]) => [name, Math.max(0, Math.min(100, Number(value)))])
      : [];

  /* ======================================================
     NEW PROFESSIONAL RESULT VIEW (Oct 2026)
  ====================================================== */
  if (window.AldovraResultReview) {
    const lastAttemptAt = new Date(
      matchingAttempt?.submitted_at || submittedAt || report.created_at || 0,
    ).getTime();
    const opensAt = Number.isFinite(lastAttemptAt) && lastAttemptAt > 0 ? lastAttemptAt + 864e5 : 0;
    window.AldovraResultReview.render(
      modalBody,
      {
        assessmentName,
        attemptedAt,
        percentage: overall,
        correct: correctCount,
        incorrect: incorrectCount,
        unanswered: unansweredCount,
        questions: questionCount,
        duration: durationText,
        attemptNumber,
        attemptId: report.attempt_id || matchingAttempt?.id || "",
        sessionId: report.session_id,
        categories: categoryScores,
        message: resultMessage,
        evaluating,
        videoPending: environmentVideoPending,
        underReview: environmentVideoUnderReview,
        verified: reportEligible,
        rejected: environmentVideoRejected,
        unverified: environmentVideoUnverified,
        videoUrl: environmentVideoUrl,
        reattemptFee: reattemptFeeForResult,
        paymentsLive: !!window.ALDOVRA_PAYMENTS_LIVE,
        reattemptFrom:
          opensAt > Date.now()
            ? new Date(opensAt).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })
            : null,
      },
      {
        db,
        onClose: closeModal,
        onSubmitted: async () => {
          try {
            await loadEvidence();
            await loadReports();
            await loadNotifications();
            renderAssessments();
            renderProfileVerification();
          } catch (refreshError) {
            console.warn("Refresh after video link:", refreshError);
          }
          await openResultModal(request);
        },
      },
    );
    showModal();
    return;
  }
  const subjectRows = categoryScores.length
    ? categoryScores
        .map(
          ([name, value]) => `

              <div
                class="subject-score-row"
              >

                <div
                  class="subject-score-name"
                >
                  ${esc(name)}
                </div>


                <div
                  class="subject-score-track"
                >

                  <div
                    class="subject-score-fill"
                    style="
                      width:${value}%;
                    "
                  ></div>

                </div>


                <div
                  class="subject-score-value"
                >
                  ${value}%
                </div>

              </div>

            `,
        )
        .join("")
    : `

          <div class="result-empty">

            Subject-wise scores are not
            available for this assessment.

          </div>

        `;

  /* ======================================================
     PIE / DONUT SVG
     Hover over each section for details
  ====================================================== */
  const chartTotal = correctCount + incorrectCount + unansweredCount;
  const chartParts = [
    {
      label: "Correct",
      count: correctCount,
      color: "#22c55e",
    },
    {
      label: "Incorrect",
      count: incorrectCount,
      color: "#ef4444",
    },
    {
      label: "Unattempted",
      count: unansweredCount,
      color: "#cbd5e1",
    },
  ].filter((item) => item.count > 0);
  const centerX = 110;
  const centerY = 110;
  const radius = 78;
  const strokeWidth = 32;
  function polarToCartesian(cx, cy, r, angle) {
    const radians = ((angle - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(radians),
      y: cy + r * Math.sin(radians),
    };
  }
  function donutPath(startAngle, endAngle) {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `
      M ${start.x} ${start.y}
      A ${radius} ${radius}
        0 ${largeArc} 0
        ${end.x} ${end.y}
    `;
  }
  let currentAngle = 0;
  const donutPaths = chartParts
    .map((part) => {
      const percentage = chartTotal ? part.count / chartTotal : 0;
      const angle = percentage * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      const percentText = chartTotal ? Math.round(percentage * 100) : 0;
      return `

     <path
  d="${donutPath(startAngle, endAngle)}"
  fill="none"
  stroke="${part.color}"
  stroke-width="${strokeWidth}"
  stroke-linecap="butt"
  data-tooltip="${esc(part.label)}: ${part.count} (${percentText}%)"
>
  <title>
    ${esc(part.label)}: ${part.count} (${percentText}%)
  </title>
</path>

      `;
    })
    .join("");

  /* ======================================================
     RECORDINGS
  ====================================================== */
  const ev = evidence.find((item) => String(item.session_id) === String(report.session_id));
  let cameraUrl = null;
  let screenUrl = null;
  if (ev?.camera_path) {
    cameraUrl = await signedUrl(ev.camera_path);
  }
  if (ev?.screen_path) {
    screenUrl = await signedUrl(ev.screen_path);
  }

  /* Snapshot proctoring (Oct 2026): photo timeline + audio instead of videos. */
  const useSnapshots = !!(ev && (ev.timeline_path || ev.media_deleted_at) && window.AldovraEvidence);
  if (useSnapshots) {
    setTimeout(() => {
      const mount = document.querySelector("[data-ald-evidence-mount]");
      if (mount) window.AldovraEvidence.render(mount, ev, db);
    }, 0);
  }
  const cameraHtml = useSnapshots
    ? `<div class="recording-card" style="grid-column:1/-1" data-ald-evidence-mount></div>`
    : cameraUrl
      ? `

        <div class="recording-card">

          <h3>
            🎥 Camera Recording
          </h3>

          <video
            controls
            preload="metadata"
            src="${esc(cameraUrl)}"
          ></video>


          <div
            class="recording-actions"
          >

            <a
              class="recording-download"
              href="${esc(cameraUrl)}"
              download
            >
              ↓ Download Recording
            </a>

          </div>

        </div>

      `
      : `

        <div class="recording-card">

          <h3>
            🎥 Camera Recording
          </h3>

          <div class="result-empty">
            Camera recording is not available.
          </div>

        </div>

      `;
  const screenHtml = useSnapshots
    ? ""
    : screenUrl
      ? `

        <div class="recording-card">

          <h3>
            🖥️ Screen Recording
          </h3>

          <video
            controls
            preload="metadata"
            src="${esc(screenUrl)}"
          ></video>


          <div
            class="recording-actions"
          >

            <a
              class="recording-download"
              href="${esc(screenUrl)}"
              download
            >
              ↓ Download Recording
            </a>

          </div>

        </div>

      `
      : `

        <div class="recording-card">

          <h3>
            🖥️ Screen Recording
          </h3>

          <div class="result-empty">
            Screen recording is not available.
          </div>

        </div>

      `;

  /* ======================================================
     FINAL MODAL
  ====================================================== */
  modalBody.innerHTML = `

    <div
      class="assessment-result-head"
    >

      <div>

        <h2>
          Assessment Result
        </h2>


        <p>

          <strong>
            ${esc(assessmentName)}
          </strong>

          · ${esc(attemptedAt)}

          · ${questionCount} questions

  · ${esc(durationText)}

        </p>

      </div>


      <div
        style="
          display:flex;
          align-items:center;
          gap:10px;
        "
      >

        <span
          class="
            assessment-result-status
            ${statusClass}
          "
        >
          ${statusLabel}
        </span>


        <button
          id="dashboardResultClose"
          class="result-close-button"
          type="button"
          aria-label="Close result"
        >
          ✕
        </button>

      </div>

    </div>


    <!-- ==========================================
         STATS
    =========================================== -->

    <div
      class="assessment-result-stats"
    >

      <div
        class="assessment-result-stat"
      >

        <small>
          Score
        </small>

        <strong class="accent">
          ${score}
        </strong>

        <span
          style="
            font-size:11.5px;
            color:var(--muted);
          "
        >
          ${correctCount} /
          ${questionCount}
          correct
        </span>

      </div>


      <div
        class="assessment-result-stat"
      >

        <small>
          Status
        </small>

        <strong>
          ${statusLabel}
        </strong>

        <span
          style="
            font-size:11.5px;
            color:var(--muted);
          "
        >
          Assessment result
        </span>

      </div>


      <div
        class="assessment-result-stat"
      >

        <small>
         Time Taken
        </small>

        <strong>
         ${esc(durationText)}
        </strong>

        <span
          style="
            font-size:11.5px;
            color:var(--muted);
          "
        >
     Actual exam time
        </span>

      </div>


      <div
        class="assessment-result-stat"
      >

        <small>
          Attempt
        </small>

       <strong>
  ${esc(attemptNumber)}
</strong>

        <span
          style="
            font-size:11.5px;
            color:var(--muted);
          "
        >
          Recorded attempt
        </span>

      </div>

    </div>


    <!-- ==========================================
         TABS
    =========================================== -->

    <div
      class="assessment-result-tabs"
    >

      <button
        class="
          assessment-result-tab
          active
        "
        data-result-tab="overview"
        type="button"
      >
        Overview
      </button>


      <button
        class="assessment-result-tab"
        data-result-tab="subjects"
        type="button"
      >
        Subject-wise Analysis
      </button>


      <button
        class="assessment-result-tab"
        data-result-tab="recordings"
        type="button"
      >
        Recordings
      </button>


      <button
        class="assessment-result-tab"
        data-result-tab="details"
        type="button"
      >
        Details
      </button>

    </div>


    <!-- ==========================================
         OVERVIEW
    =========================================== -->

    <div
      class="assessment-result-panel"
      data-result-panel="overview"
    >

      <div
        class="
          result-message
          ${statusClass}
        "
      >
        ${esc(resultMessage)}
      </div>

      ${environmentVideoRejected ? '<div role="alert" style="margin:12px 0;padding:12px 16px;border-radius:12px;background:#fff1f2;color:#be123c;font-weight:750;">Video rejected by Aldovra. Upload a new Unlisted video link below to request another review.</div>' : ""}

      ${
        Number.isFinite(overall)
          ? `
        <section class="result-panel-card" style="margin:16px 0;border-left:4px solid var(--primary);">
          <h3 style="margin:0 0 8px;">Performance &amp; Next Steps</h3>
          <p style="margin:0 0 10px;color:var(--muted);line-height:1.6;">${esc(performanceGuidance)}</p>
          ${
            overall < 75
              ? `
            <div style="display:inline-flex;gap:8px;align-items:center;padding:9px 12px;border-radius:10px;background:var(--orange-soft);color:var(--orange);font-weight:850;">
              ${environmentVideoUnderReview ? "Potential reattempt fee if reattempt is required" : "Reattempt fee"}: ₹${reattemptFeeForResult}
            </div>
            <p style="margin:10px 0 0;color:var(--muted);font-size:12px;line-height:1.5;">Scores of 65–74% use the ₹50 band; scores below 65% use the ₹100 band. Paid reattempts are not available yet, so no payment has been taken.</p>
          `
              : `
            <div style="display:inline-flex;padding:9px 12px;border-radius:10px;background:var(--green-soft);color:var(--green);font-weight:850;">75% verification benchmark met</div>
          `
          }
        </section>
      `
          : ""
      }

      ${
        environmentVideoPending || environmentVideoRejected
          ? `
        <section class="ald-env-link-card" aria-labelledby="aldEnvLinkTitle">
          <h3 id="aldEnvLinkTitle">${environmentVideoRejected ? "Video rejected — upload a new link" : "Submit exam environment video link"}</h3>
          <button type="button" class="aeg-btn" data-env-guide><i>▶</i>Not sure how? Watch the 30-sec guide</button>
          ${environmentVideoRejected ? '<p role="alert" style="color:var(--danger,#b91c1c);font-weight:700;">Your previous environment video was not approved. Please record a new video, upload it to YouTube as Unlisted, and submit a different link.</p>' : ""}
          <p>1. Use your mobile phone to record the exam environment for this attempt.
          2. Upload this attempt's video to your own YouTube account.
          3. Set Visibility to <strong>Unlisted</strong> (not Private).
          4. Paste the new YouTube link below. <strong>Every retake needs a different video and a new link.</strong> Aldovra stores the link, not the video file.</p>
          <label for="aldEnvironmentVideoUrl">YouTube Unlisted video URL</label>
          <input id="aldEnvironmentVideoUrl" type="url" inputmode="url"
            placeholder="https://www.youtube.com/watch?v=..."
            autocomplete="url" />
          <button type="button" id="aldSubmitEnvironmentVideoUrl" class="btn btn-primary">
            Save video link & finish verification
          </button>
          <p id="aldEnvironmentVideoMessage" class="small" role="status" aria-live="polite"></p>
        </section>
      `
          : environmentVideoUrl
            ? `
        <section class="ald-env-link-card ald-env-link-saved">
          <strong>✓ Environment video link submitted</strong>
          <p>${environmentVideoUnderReview ? "Your video link is saved and awaiting reviewer approval." : reportEligible ? "Your assessment and environment video have been verified." : environmentVideoUnverified ? "Your video link is saved, but verification was not approved." : "Your video link is saved."}</p>
          <a href="${esc(environmentVideoUrl)}" target="_blank" rel="noopener noreferrer">Open submitted YouTube video ↗</a>
        </section>
      `
            : ""
      }

      <div
        class="result-two-column"
      >

        <!-- SUBJECT SCORES -->

        <div
          class="result-panel-card"
        >

          <h3>
            📊 Subject-wise Performance
          </h3>

          ${subjectRows}

        </div>


        <!-- DONUT -->

        <div
          class="result-panel-card"
        >

          <h3>
            Score Breakdown
          </h3>


          <div
            class="result-donut-wrap"
          >

            <svg
              class="result-donut-svg"
              viewBox="0 0 220 220"
              role="img"
              aria-label="Assessment score breakdown"
            >

              <!-- Background ring -->

              <circle
                cx="110"
                cy="110"
                r="78"
                fill="none"
                stroke="var(--border)"
                stroke-width="32"
              ></circle>


              ${donutPaths}


              <text
                x="110"
                y="105"
                text-anchor="middle"
                font-size="28"
                font-weight="900"
                fill="var(--text)"
                class="result-donut-center"
              >
                ${score}
              </text>


              <text
                x="110"
                y="125"
                text-anchor="middle"
                font-size="10"
                fill="var(--muted)"
                class="result-donut-center"
              >
                Overall Score
              </text>

            </svg>

          </div>


          <div
            style="
              text-align:center;
              color:var(--muted);
              font-size:11px;
              margin-top:-5px;
            "
          >
            Hover over the chart sections
            to view score details.
          </div>

        </div>

      </div>

    </div>


    <!-- ==========================================
         SUBJECT ANALYSIS
    =========================================== -->

    <div
      class="assessment-result-panel"
      data-result-panel="subjects"
      style="display:none"
    >

      <div
        class="result-panel-card"
      >

        <h3>
          📊 Subject-wise Analysis
        </h3>

        ${subjectRows}

      </div>

    </div>


    <!-- ==========================================
         RECORDINGS
    =========================================== -->

    <div
      class="assessment-result-panel"
      data-result-panel="recordings"
      style="display:none"
    >

      <div
        class="recordings-grid"
      >

        ${cameraHtml}

        ${screenHtml}

      </div>


      <div
        class="
          result-message
          pending
        "
        style="margin-top:15px"
      >

        Assessment recordings are
        private Aldovra evidence and are
        available through secure links.

      </div>

    </div>


    <!-- ==========================================
         DETAILS
    =========================================== -->

    <div
      class="assessment-result-panel"
      data-result-panel="details"
      style="display:none"
    >

      <div
        class="result-details-grid"
      >

        <div class="result-detail">

          <small>
            Assessment
          </small>

          <strong>
            ${esc(assessmentName)}
          </strong>

        </div>


        <div class="result-detail">

          <small>
            Attempted
          </small>

          <strong>
            ${esc(attemptedAt)}
          </strong>

        </div>


        <div class="result-detail">

          <small>
            Questions
          </small>

          <strong>
            ${questionCount}
          </strong>

        </div>


        <div class="result-detail">

          <small>
            Correct Answers
          </small>

          <strong>
            ${correctCount}
          </strong>

        </div>


        <div class="result-detail">

          <small>
            Evaluation Status
          </small>

          <strong>
            ${esc(report.evaluation_status || "—")}
          </strong>

        </div>


        <div class="result-detail">

          <small>
            Verification Status
          </small>

          <strong>
            ${esc(report.verification_status || "—")}
          </strong>

        </div>

      </div>

    </div>

  `;

  /* ======================================================
     OPEN MODAL
  ====================================================== */
  showModal();
  const donutSvg = modalBody.querySelector(".result-donut-svg");
  if (donutSvg) {
    const tooltip = document.createElement("div");
    tooltip.className = "donut-tooltip";
    tooltip.id = "assessmentDonutTooltip";
    document.body.appendChild(tooltip);
    donutSvg.querySelectorAll("path[data-tooltip]").forEach((path) => {
      path.addEventListener("mouseenter", () => {
        tooltip.textContent = path.dataset.tooltip;
        tooltip.style.display = "block";
      });
      path.addEventListener("mousemove", (event) => {
        tooltip.style.left = `${event.clientX + 14}px`;
        tooltip.style.top = `${event.clientY + 14}px`;
      });
      path.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
    });
  }
  const submitEnvironmentVideoButton = document.getElementById("aldSubmitEnvironmentVideoUrl");
  if (submitEnvironmentVideoButton) {
    submitEnvironmentVideoButton.addEventListener("click", async () => {
      const input = document.getElementById("aldEnvironmentVideoUrl");
      const message = document.getElementById("aldEnvironmentVideoMessage");
      const url = String(input?.value || "").trim();
      if (!url) {
        if (message) message.textContent = "Paste your YouTube Unlisted video link first.";
        input?.focus();
        return;
      }
      submitEnvironmentVideoButton.disabled = true;
      submitEnvironmentVideoButton.textContent = "Saving link...";
      if (message) message.textContent = "Saving your link and updating verification status...";
      try {
        const { data, error } = await db.functions.invoke("submit-environment-video-link", {
          body: { session_id: report.session_id, youtube_url: url },
        });
        if (error) {
          let serverMessage = "";
          try {
            const response = error.context;
            if (response && typeof response.json === "function") {
              const payload = await response.json();
              serverMessage = payload?.error || payload?.message || "";
            }
          } catch (_) {}
          throw new Error(serverMessage || error.message || "Could not save the video link.");
        }
        if (!data?.success) throw new Error(data?.error || "Could not save the video link.");
        if (message)
          message.textContent = data.message || "Video link saved. Your verification is now under review.";
        await loadEvidence();
        await loadReports();
        await loadNotifications();
        renderAssessments();
        renderProfileVerification();
        await openResultModal(request);
      } catch (error) {
        console.error("Environment video link submission error:", error);
        if (message)
          message.textContent = error?.message || "Could not save the link. Please check it and try again.";
        submitEnvironmentVideoButton.disabled = false;
        submitEnvironmentVideoButton.textContent = "Save video link & finish verification";
      }
    });
  }

  /* Close button */
  document.getElementById("dashboardResultClose")?.addEventListener("click", closeModal);

  /* ======================================================
     TAB SWITCHING
  ====================================================== */
  modalBody.querySelectorAll("[data-result-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.resultTab;
      modalBody.querySelectorAll("[data-result-tab]").forEach((item) => {
        item.classList.toggle("active", item === tab);
      });
      modalBody.querySelectorAll("[data-result-panel]").forEach((panel) => {
        panel.style.display = panel.dataset.resultPanel === target ? "block" : "none";
      });
    });
  });
}

/* ========================================================
   SCREENING CALLS
======================================================== */

function renderScreeningCalls() {
  const list = $("screeningList");
  if (screeningCallsLoading) {
    list.innerHTML = `
    <div class="empty screening-loading">
      Loading your screening calls...
    </div>
  `;
    return;
  }
  if (!screeningCalls.length) {
    list.innerHTML = `
  <div class="screening-empty">
    <div class="screening-empty-icon">
      📞
    </div>

    <strong>
      No screening calls yet
    </strong>

    <span>
      When a company schedules a screening call,
      your interview details will appear here.
    </span>
  </div>
`;
    return;
  }
  list.innerHTML = screeningCalls
    .map((call) => {
      const statusMeta = getScreeningStatusMeta(call.status);
      return `


<div class="assessment-row">

<div class="assessment-info">

<h4>
${esc(call.company_name || "Screening Call")}
</h4>

<div class="assessment-meta">

Role:
${esc(call.role_title || "—")}

<br>

Scheduled:
${esc(formatDate(call.scheduled_at))}

<br>

Status:
${esc(call.status || "scheduled")}

${call.notes ? `<br>Notes: ${esc(call.notes)}` : ""}

</div>

</div>

<div class="assessment-right">

<span class="status ${statusMeta.className}">

${esc(statusMeta.label)}
</span>

</div>

</div>

`;
    })
    .join("");
}

/* ========================================================
   SCREENING STATUS LABEL
======================================================== */

function getScreeningStatusMeta(status) {
  const normalized = String(status || "scheduled")
    .trim()
    .toLowerCase();
  if (normalized === "completed") {
    return {
      label: "Completed",
      className: "completed",
    };
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return {
      label: "Cancelled",
      className: "cancelled",
    };
  }
  if (normalized === "pending") {
    return {
      label: "Pending",
      className: "pending",
    };
  }
  if (normalized === "confirmed" || normalized === "approved") {
    return {
      label: "Confirmed",
      className: "approved",
    };
  }
  return {
    label: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    className: "approved",
  };
}

/* ========================================================
   REFRESH EVERYTHING
======================================================== */
async function loadDashboard() {
  /* =====================================================
     LOAD DASHBOARD DATA IN PARALLEL
  ===================================================== */
  await Promise.all([
    loadProfile(),
    loadAssessmentRequests(),
    loadReports(),
    loadAttempts(),
    loadEvidence(),
    loadScreeningCalls(),
    loadResumeStatus(),
    loadResumeIntelligence(),
    loadAssessmentPayments(),
    loadNotifications(),
  ]);
  await loadSkills();
  await renderExploreStudents();
  populateExploreFilters();
  setupExploreFilterEvents();
  /* =====================================================
     RENDER ONLY AFTER INITIAL DATA IS READY
  ===================================================== */
  renderStats();
  if (typeof renderPerformanceVisual === "function") renderPerformanceVisual();
  else
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        if (typeof renderPerformanceVisual === "function") renderPerformanceVisual();
      },
      { once: true },
    );
  renderOverviewProgress();
  renderAssessments();
  renderRecommendedAssessments();
  renderProfileVerification();
  renderScreeningCalls();
  await renderLiveResults();
  window.scrollTo(0, 0);
}

/* ========================================================
   LOGOUT
======================================================== */

$("logoutBtn").onclick = async () => {
  await db.auth.signOut();
  location.href = "/login.html";
};

/* ========================================================
   INITIALIZE
======================================================== */

(async () => {
  currentUser = await requireUser();
  if (!currentUser) return;
  await loadDashboard();
})();

/* ========================================================
   AUTO REFRESH
======================================================== */

setInterval(async () => {
  if (!currentUser) return;
  await loadReports();
  await loadAttempts();
  await loadEvidence();
  await loadNotifications();
  renderStats();
  renderAssessments();
  renderRecommendedAssessments();
  renderOverviewProgress();
  await renderLiveResults();
}, 15000);

/* ========================================================
   DASHBOARD RESULT HELPERS
======================================================== */

/* ========================================================
   SHOW EVALUATION OVERLAY
======================================================== */

function showEvaluationOverlay() {
  const overlay = document.getElementById("dashboardEvaluationOverlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
}

/* ========================================================
   HIDE EVALUATION OVERLAY
======================================================== */

function hideEvaluationOverlay() {
  const overlay = document.getElementById("dashboardEvaluationOverlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
}

/* ========================================================
   UPDATE EVALUATION OVERLAY
======================================================== */
function updateEvaluationOverlay(reportOverride = null) {
  const report = reportOverride || latestReport();
  if (report && report.evaluation_status === "evaluating") {
    showEvaluationOverlay();
    const title = document.getElementById("dashboardEvaluationTitle");
    const text = document.getElementById("dashboardEvaluationText");
    if (title) title.textContent = "Evaluation in progress";
    if (text)
      text.textContent =
        "Your assessment was submitted successfully. Aldovra is evaluating your result. Please wait.";
    return;
  }
  hideEvaluationOverlay();
}

/* ========================================================
   REFRESH DASHBOARD RESULT
======================================================== */

/* ========================================================
   OPEN RESULT FROM ASSESSMENT ROW
======================================================== */

/* ========================================================
   CHECK EVALUATION STATUS
======================================================== */

async function checkEvaluationStatus() {
  if (!currentUser) return;
  const { data, error } = await db
    .from("assessment_reports")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false,
    })
    .limit(1);
  if (error) {
    console.error("Evaluation status error:", error);
    return;
  }
  if (data && data.length) {
    updateEvaluationOverlay(data[0]);
    renderStats();
    renderOverviewProgress();
    await renderLiveResults();
  }
}

/* ========================================================
   INITIAL EVALUATION CHECK
======================================================== */

setTimeout(async () => {
  if (!currentUser) return;
  await checkEvaluationStatus();
}, 1000);

/* ========================================================
   CONTINUOUS EVALUATION CHECK
======================================================== */

setInterval(async () => {
  if (!currentUser) return;
  const latest = latestReport();
  if (latest && latest.evaluation_status === "evaluating") {
    await checkEvaluationStatus();
  }
}, 5000);