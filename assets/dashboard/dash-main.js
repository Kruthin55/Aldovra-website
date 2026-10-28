  // Keep the profile dialog attached to the document root so fixed positioning
  // is measured against the viewport, never a dashboard/sidebar layout container.
  const profileModalRoot = document.getElementById("profileDetailsModal");
  if (profileModalRoot && profileModalRoot.parentElement !== document.body) {
    document.body.appendChild(profileModalRoot);
  }

  // Jobs & Opportunities is a normal section at the bottom of the dashboard.
  // Keep all dashboard content mounted and scroll to the section like other nav items.
  document.addEventListener("click", function (event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const jobsNav = target?.closest("[data-ald-jobs-nav]");
    if (!jobsNav) return;

    event.preventDefault();
    const jobsSection = document.getElementById("aldovraJobsSection");
    if (!jobsSection) return;

    const modal = document.getElementById("profileDetailsModal");
    if (modal) {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
      // Do not leave an inline display:none that prevents Profile reopening.
      modal.style.removeProperty("display");
    }
    window.__aldovraOnboardingProfileStep = false;
    window.__aldovraPreviewMode = false;
    document.querySelector(".sidebar")?.classList.remove("mobile-open");
    // Every sidebar item participates in the same single-selection state.
    document.querySelectorAll(".sidebar .nav-item").forEach(item => {
      item.classList.remove("active");
    });
    jobsNav.classList.add("active");
    jobsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* =====================================================
     SUPABASE
  ====================================================== */

  const SUPABASE_URL =
    "https://lgefwfrjzweayfxahogs.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_f4DHvfDfjqLyugXm6iq6JQ__Q72vK9i";

  const {
    createClient
  } = supabase;

  var db =
    createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );
  /* =====================================================
   RAZORPAY CHECKOUT LOADER
===================================================== */

function loadRazorpayCheckout(){

  return new Promise(
    (resolve, reject) => {

      if(
        window.Razorpay
      ){
        resolve();
        return;
      }

      const script =
        document.createElement("script");

      script.src =
        "https://checkout.razorpay.com/v1/checkout.js";

      script.onload =
        () => resolve();

      script.onerror =
        () =>
          reject(
            new Error(
              "Razorpay Checkout failed to load."
            )
          );

      document.head.appendChild(
        script
      );

    }
  );

}
  /* =====================================================
   START PAID REATTEMPT PAYMENT
===================================================== */

/*
 * Keep this false until Aldovra chooses and verifies a payment provider.
 * Re-enable only after the backend payment flow is implemented and tested.
 */
// Payments go live when platform_settings.reattempt_payments_live is true (read via RPC on load).
window.ALDOVRA_PAYMENTS_LIVE = (function(){ try { return localStorage.getItem("aldovra-payments-live") === "1"; } catch (e) { return false; } })();
(async function loadPaymentsLiveFlag(){
  try {
    if (typeof db === "undefined" || !db.rpc) return;
    const { data, error } = await db.rpc("reattempt_payments_live");
    if (error) return;
    const live = data === true;
    try { localStorage.setItem("aldovra-payments-live", live ? "1" : "0"); } catch (e) {}
    if (live !== window.ALDOVRA_PAYMENTS_LIVE) {
      window.ALDOVRA_PAYMENTS_LIVE = live;
      if (typeof renderAssessments === "function") { try { renderAssessments(); } catch (e) {} }
    }
  } catch (e) {}
})();

/* Generic PayU hosted checkout: the server decides the amount and signs the request. */
async function aldovraStartPayU(requestId, button){
  const original = button ? button.textContent : "";
  if (button) { button.disabled = true; button.textContent = "Opening payment…"; }
  try {
    const { data: sessionData } = await db.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error("Please log in again before making a payment.");
    const { data: payData, error: payError } = await db.functions.invoke("create-payu-payment", {
      body: { request_id: Number(requestId) },
      headers: { Authorization: "Bearer " + accessToken }
    });
    if (payError) {
      let message = payError.message || "Unable to start payment.";
      try { const b = await payError.context.json(); if (b && b.error) message = b.error; } catch (e) {}
      throw new Error(message);
    }
    if (!payData || !payData.action || !payData.fields) throw new Error("Unable to start payment. Please try again.");
    if (button) button.textContent = "Redirecting to PayU…";
    const form = document.createElement("form");
    form.method = "POST"; form.action = payData.action; form.style.display = "none";
    Object.keys(payData.fields).forEach(function(name){
      const input = document.createElement("input");
      input.type = "hidden"; input.name = name; input.value = String(payData.fields[name]);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  } catch (error) {
    console.error("PayU start error:", error);
    alert(error.message || "Unable to start payment.");
    if (button) { button.disabled = false; button.textContent = original; }
  }
}
document.addEventListener("click", function(event){
  const btn = event.target.closest && event.target.closest("[data-pay-new-skill]");
  if (!btn) return;
  event.preventDefault();
  aldovraStartPayU(btn.getAttribute("data-pay-new-skill"), btn);
});

async function startRazorpayReattemptPayment(
  requestId,
  fee
){

  if (!window.ALDOVRA_PAYMENTS_LIVE) {
    alert(
      "Paid reattempts are temporarily unavailable while Aldovra finalizes its payment setup. Your assessment results remain available."
    );
    return;
  }

  const amount =
    Number(fee);

  if(
    !Number.isFinite(amount) ||
    amount <= 0
  ){

    alert(
      "Invalid reattempt amount."
    );

    return;

  }


  /*
   * Avoid collecting a reattempt fee while the assessment is still
   * inside the cooldown or has reached the rolling monthly cap.
   * assessment.html repeats this check before opening the exam; the
   * Edge Functions must enforce it too for security.
   */
  const requestAttemptHistory = (attempts || [])
    .filter(attempt =>
      String(attempt.request_id || "") === String(requestId)
    );

  const now = Date.now();
  const latestRequestAttempt = requestAttemptHistory
    .slice()
    .sort((a, b) =>
      new Date(b.submitted_at || b.created_at || 0) -
      new Date(a.submitted_at || a.created_at || 0)
    )[0];

  if (latestRequestAttempt) {
    const lastAttemptAt = new Date(
      latestRequestAttempt.submitted_at ||
      latestRequestAttempt.created_at ||
      0
    ).getTime();

    const cooldownMs = 24 * 60 * 60 * 1000;
    const remainingMs = cooldownMs - (now - lastAttemptAt);

    if (Number.isFinite(lastAttemptAt) && lastAttemptAt > 0 && remainingMs > 0) {
      const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
      alert(`You can pay for and start your reattempt in about ${remainingHours} hour(s).`);
      return;
    }
  }

  const rollingMonthMs = 30 * 24 * 60 * 60 * 1000;
  const attemptsInRollingMonth = requestAttemptHistory.filter(attempt => {
    const timestamp = new Date(
      attempt.submitted_at || attempt.created_at || 0
    ).getTime();

    return Number.isFinite(timestamp) &&
      timestamp > 0 &&
      now - timestamp < rollingMonthMs;
  }).length;

  if (attemptsInRollingMonth >= 4) {
    alert("You have reached the maximum of 4 attempts for this assessment in the last 30 days.");
    return;
  }

  const button =
    document.querySelector(
      `[data-reattempt-request="${requestId}"]`
    );


  if(button){

    button.disabled = true;

    button.dataset.originalText =
      button.textContent;

    button.textContent =
      "Opening payment...";

  }


  try{

    /* -----------------------------------------
       PAYU HOSTED CHECKOUT
       The server decides the fee from your latest score and signs the request.
    ----------------------------------------- */

    const { data: sessionData } = await db.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new Error("Please log in again before making a payment.");
    }

    const { data: payData, error: payError } = await db.functions.invoke(
      "create-payu-payment",
      {
        body: { request_id: requestId },
        headers: { Authorization: "Bearer " + accessToken }
      }
    );

    if (payError) {
      let message = payError.message || "Unable to start payment.";
      try {
        const ctx = payError.context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          if (body && body.error) message = body.error;
        }
      } catch (e) {}
      throw new Error(message);
    }

    if (!payData || !payData.action || !payData.fields) {
      throw new Error("Unable to start payment. Please try again.");
    }

    if (button) {
      button.textContent = "Redirecting to PayU…";
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = payData.action;
    form.style.display = "none";
    Object.keys(payData.fields).forEach(function(name){
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = String(payData.fields[name]);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();

  }catch(error){

    console.error(
      "Reattempt payment error:",
      error
    );


    alert(
      error.message ||
      "Unable to start payment."
    );


    if(button){

      button.disabled =
        false;

      button.textContent =
        button.dataset.originalText ||
        `Reattempt ₹${amount} →`;

    }

  }

}
  /* =====================================================
   LOAD SKILLS FROM SUPABASE
===================================================== */
function updateSelectedSkillsCount(selectedMap) {
  const countElement =
    document.getElementById("selectedSkillsCount");

  if (!countElement) return;

  const count = selectedMap.size;

  countElement.textContent =
    `${count} ${count === 1 ? "skill" : "skills"} selected`;
}
  /* =====================================================
   BATCH 6 — SKILL ASSESSMENT POPUP CONTROLLER
===================================================== */
let selectedAssessmentSkillId = null;
function openSkillAssessmentModal(skill) {

  const modal =
    document.getElementById(
      "skillAssessmentModal"
    );

  const skillName =
    document.getElementById(
      "skillAssessmentName"
    );

  const title =
    document.getElementById(
      "skillAssessmentTitle"
    );

  if (!modal) return;
selectedAssessmentSkillId =
  skill.id;
  if (skillName) {
    skillName.textContent =
      skill.name;
  }

  if (title) {
    title.textContent =
      `${skill.name} Assessment`;
  }

  modal.classList.remove(
    "hidden"
  );

  modal.setAttribute(
    "aria-hidden",
    "false"
  );
}


function closeSkillAssessmentModal() {

  const modal =
    document.getElementById(
      "skillAssessmentModal"
    );

  if (!modal) return;

  modal.classList.add(
    "hidden"
  );

  modal.setAttribute(
    "aria-hidden",
    "true"
  );
}


/* ---------- CLOSE BUTTONS ---------- */

document
  .getElementById(
    "closeSkillAssessmentBtn"
  )
  ?.addEventListener(
    "click",
    closeSkillAssessmentModal
  );

/* =====================================================
   BATCH 6 — START SELECTED SKILL ASSESSMENT
===================================================== */

document
  .getElementById(
    "startSkillAssessmentBtn"
  )
  ?.addEventListener(
    "click",
    async () => {

      if (
        !selectedAssessmentSkillId
      ) {

        alert(
          "Please select a skill first."
        );

        return;
      }


      const button =
        document.getElementById(
          "startSkillAssessmentBtn"
        );


      if (button) {

        button.disabled =
          true;

        button.textContent =
          "Preparing Assessment...";

      }


      try {

        const {
          data,
          error
        } =
          await db.functions.invoke(
            "create-assessment-request",
            {
              body: {
                skill_id:
                  selectedAssessmentSkillId
              }
            }
          );


     if (error) {

  console.error(
    "Assessment request error:",
    error
  );

  let message =
    "Unable to start this assessment.";

  try {

    if (error.context) {

      const errorBody =
        await error.context.json();

      if (errorBody?.error) {
        message =
          errorBody.error;
      }

    }

  } catch (parseError) {

    console.warn(
      "Could not parse assessment error:",
      parseError
    );

  }

  alert(message);

  return;
}


        if (
          !data ||
          !data.request_id
        ) {

          console.error(
            "Invalid assessment response:",
            data
          );

          alert(
            "Assessment request could not be created."
          );

          return;
        }


        closeSkillAssessmentModal();

        if (data.payment_required) {
          const basis = Number(data.based_on_score);
          const why = Number.isFinite(basis)
            ? " (based on your latest score of " + Math.round(basis) + "%)"
            : "";
          const ok = confirm(
            "Your first assessment was free. Verifying this skill costs ₹" + data.amount + why +
            ".\n\nContinue to secure payment with PayU?"
          );
          if (typeof loadAssessmentRequests === "function") { try { loadAssessmentRequests(); } catch (e) {} }
          if (ok) { aldovraStartPayU(data.request_id, button); }
          return;
        }


        openAssessment({
          id:
            data.request_id,

          assessment_id:
            data.assessment_id,

          status:
            data.status
        });


      } catch (error) {

        console.error(
          "Start assessment error:",
          error
        );

        alert(
          "Something went wrong while starting the assessment."
        );

      } finally {

        if (button) {

          button.disabled =
            false;

          button.textContent =
            "Start Assessment";

        }

      }

    }
  );

document
  .getElementById(
    "cancelSkillAssessmentBtn"
  )
  ?.addEventListener(
    "click",
    closeSkillAssessmentModal
  );


/* ---------- CLICK OUTSIDE ---------- */

document
  .getElementById(
    "skillAssessmentModal"
  )
  ?.addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "skillAssessmentModal"
      ) {

        closeSkillAssessmentModal();

      }

    }
  );
async function loadSkills() {

  const skillsGrid =
    document.getElementById("skillsGrid");

  if (!skillsGrid) return;

  const {
    data: {
      user
    }
  } = await db.auth.getUser();

 if (!user) {
  skillsGrid.innerHTML =
    "<div class=\"skills-empty\">Please log in to view your skills.</div>";
  return;
}

  const {
    data: skills,
    error: skillsError
  } = await db
    .from("skills")
    .select("id, name, category")
    .order("category")
    .order("name");

if (skillsError) {
  console.error("Skills loading error:", skillsError);

  skillsGrid.innerHTML =
    "<div class=\"skills-empty\">Unable to load skills right now. Please try again.</div>";

  return;
}

  const {
    data: selectedSkills,
    error: selectedError
  } = await db
    .from("student_skills")
    .select("skill_id, status")
    .eq("user_id", user.id);

 if (selectedError) {
  console.error("Selected skills loading error:", selectedError);

  skillsGrid.innerHTML =
    "<div class=\"skills-empty\">Unable to load your selected skills. Please try again.</div>";

  return;
}
  const selectedMap =
    new Map(
      selectedSkills.map(skill => [
        skill.skill_id,
        skill.status
      ])
    );
  updateSelectedSkillsCount(selectedMap);
const skillVerificationStatus =
  new Map();
  

const skillIds =
  skills
    .map(skill => skill.id)
    .filter(Boolean);

if(skillIds.length){

  const {
    data: skillAssessments,
    error: skillAssessmentsError
  } = await db
    .from("assessments")
    .select("id,skill_id")
    .in("skill_id", skillIds);

  if(skillAssessmentsError){

    console.error(
      "Skill assessments loading error:",
      skillAssessmentsError
    );

  }else{

    (skillAssessments || []).forEach(
      assessment => {

        const relatedAttempts =
          attempts.filter(
            attempt =>
              String(
                attempt.assessment_id
              ) ===
              String(
                assessment.id
              )
          );

        if(!relatedAttempts.length){
          return;
        }

        const hasPassed =
          relatedAttempts.some(
            attempt =>
              attempt.passed === true &&
              (
                attempt.percentage === null ||
                attempt.percentage === undefined ||
                Number(attempt.percentage) >= 75
              )
          );

        const skillId =
          String(
            assessment.skill_id
          );

        if(hasPassed){

          skillVerificationStatus.set(
            skillId,
            "verified"
          );

        }else if(
          !skillVerificationStatus.has(
            skillId
          )
        ){

          skillVerificationStatus.set(
            skillId,
            "reattempt"
          );

        }

      }
    );

  }

}
  
  /* ---------- Only skills found in the student's analyzed resume ---------- */
  let resumeSkillState = "ok";
  try {
    const { data: latestResume } = await db
      .from("student_resumes")
      .select("parsed_data,status")
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestResume?.status !== "analyzed" || !latestResume?.parsed_data || !window.AldovraResumeSkills) {
      resumeSkillState = "no-resume";
    } else {
      const resumeMatched = window.AldovraResumeSkills.match(latestResume.parsed_data, skills);
      const keep = skills.filter(skill =>
        resumeMatched.has(String(skill.id)) ||
        skillVerificationStatus.has(String(skill.id))
      );
      if (!keep.length) resumeSkillState = "no-match";
      skills.splice(0, skills.length, ...keep);
    }
  } catch (resumeSkillError) {
    console.error("Resume skill filter error:", resumeSkillError);
    resumeSkillState = "no-resume";
  }
  if (resumeSkillState !== "ok") {
    skillsGrid.innerHTML = resumeSkillState === "no-resume"
      ? `<div class="skills-empty"><strong>Upload your resume first 📄</strong><br>Once Aldovra analyzes it, the skills from your resume will appear here for verification.</div>`
      : `<div class="skills-empty"><strong>No verifiable skills found in your resume yet.</strong><br>Add the tools, languages and technologies you know (for example Python, SQL, Power BI, React) to your resume and upload it again.</div>`;
    return;
  }

  skillsGrid.innerHTML = "";
  if (skills.length === 0) {
  skillsGrid.innerHTML =
    `<div class="skills-empty">
      No skills are available right now.
    </div>`;

  return;
}

   /* =========================================
     BATCH 5 — CATEGORY GROUPING
  ========================================= */

  const categories = {};

  skills.forEach(skill => {

    const category =
      skill.category || "Other";

    if (!categories[category]) {
      categories[category] = [];
    }

    categories[category].push(skill);

  });

const categoryOrder = [
  "Programming",
  "Data & Analytics",
  "Database",
  "Cloud",
  "AI / ML",
  "Tools",
  "Communication"
];

const orderedCategories = Object.keys(categories).sort(
  (a, b) => {

    const indexA =
      categoryOrder.indexOf(a);

    const indexB =
      categoryOrder.indexOf(b);

    if (indexA === -1 && indexB === -1) {
      return a.localeCompare(b);
    }

    if (indexA === -1) return 1;

    if (indexB === -1) return -1;

    return indexA - indexB;
  }
);
 orderedCategories.forEach(
  categoryName => {

    const categorySkills =
      categories[categoryName];
      const categoryBox =
        document.createElement("div");

      categoryBox.className =
        "skill-category";


      /* ---------- HEADER ---------- */

      const header =
        document.createElement("button");

      header.type = "button";

      header.className =
        "skill-category-header";


      const title =
        document.createElement("div");

      title.className =
        "skill-category-title";

      title.innerHTML = `
        <span>${categoryName}</span>
        <span class="skill-category-count">
          ${categorySkills.length} skills
        </span>
      `;


      const arrow =
        document.createElement("span");

      arrow.className =
        "skill-category-arrow";

      arrow.textContent = "▼";


      header.appendChild(title);
      header.appendChild(arrow);


      /* ---------- SKILLS BODY ---------- */

      const body =
        document.createElement("div");

      body.className =
        "skill-category-body";


      categorySkills.forEach(skill => {

        const chip =
          document.createElement("div");

        chip.className =
          "skill-chip";

        chip.style.cursor =
          "pointer";


        const name =
          document.createElement("span");

        name.textContent =
          skill.name;


        const status =
          document.createElement("small");

const isSelected =
  selectedMap.has(skill.id);

const verificationState =
  skillVerificationStatus.get(
    String(skill.id)
  ) || "not-verified";

if(verificationState === "verified"){

  status.textContent =
    "✓ Verified";

}else if(
  verificationState === "reattempt"
){

  status.textContent =
    "↻ Reattempt Required";

}else if(isSelected){

  status.textContent =
    "Selected";

}else{

  status.textContent =
    "Not Verified";

}

chip.classList.toggle(
  "selected",
  isSelected
);

chip.classList.toggle(
  "verified",
  verificationState === "verified"
);

chip.classList.toggle(
  "reattempt",
  verificationState === "reattempt"
);

chip.classList.toggle(
  "not-verified",
  verificationState === "not-verified"
);

        chip.appendChild(name);
        chip.appendChild(status);


        /* ---------- EXISTING SAVE LOGIC ---------- */

        chip.addEventListener(
          "click",
          async () => {

            chip.style.opacity =
              "0.6";


            if (
              selectedMap.has(
                skill.id
              )
            ) {

              const {
                error
              } = await db
                .from(
                  "student_skills"
                )
                .delete()
                .eq(
                  "user_id",
                  user.id
                )
                .eq(
                  "skill_id",
                  skill.id
                );


              if (error) {

                console.error(
                  error
                );

                chip.style.opacity =
                  "1";

                return;

              }


              selectedMap.delete(
                skill.id
              );


              status.textContent =
                "Available";


              updateSelectedSkillsCount(
                selectedMap
              );


              chip.classList.remove(
                "selected"
              );


              await loadCareerTracks();


            } else {

              const {
                error
              } = await db
                .from(
                  "student_skills"
                )
                .insert({
                  user_id:
                    user.id,

                  skill_id:
                    skill.id,

                  status:
                    "selected"
                });


              if (error) {

                console.error(
                  error
                );

                chip.style.opacity =
                  "1";

                return;

              }


              selectedMap.set(
                skill.id,
                "selected"
              );


              status.textContent =
                "Selected";


              updateSelectedSkillsCount(
                selectedMap
              );


              chip.classList.add(
                "selected"
              );

openSkillAssessmentModal(
  skill
);
              await loadCareerTracks();

            }


            chip.style.opacity =
              "1";

          }
        );


        body.appendChild(
          chip
        );

      });


      /* ---------- OPEN / CLOSE ---------- */

      header.addEventListener(
        "click",
        () => {

          categoryBox.classList.toggle(
            "open"
          );

        }
      );


      categoryBox.appendChild(
        header
      );

      categoryBox.appendChild(
        body
      );

      skillsGrid.appendChild(
        categoryBox
      );

    }
  );
}
  /* =====================================================
   MY SKILLS — SEARCH
===================================================== */

function setupSkillsSearch(){

  const input =
    document.getElementById(
      "skillsSearchInput"
    );

  const clearButton =
    document.getElementById(
      "clearSkillsSearch"
    );

  const skillsGrid =
    document.getElementById(
      "skillsGrid"
    );

  if(
    !input ||
    !clearButton ||
    !skillsGrid
  ){
    return;
  }

  input.addEventListener(
    "input",
    () => {

      const query =
        input.value
          .trim()
          .toLowerCase();

      clearButton.style.display =
        query
          ? "flex"
          : "none";

      const categories =
        skillsGrid.querySelectorAll(
          ".skill-category"
        );

      categories.forEach(
        category => {

          const chips =
            category.querySelectorAll(
              ".skill-chip"
            );

          let visibleCount = 0;

          chips.forEach(
            chip => {

              const skillName =
                chip
                  .querySelector("span")
                  ?.textContent
                  ?.toLowerCase() || "";

              const matches =
                !query ||
                skillName.includes(query);

              chip.style.display =
                matches
                  ? ""
                  : "none";

              if(matches){
                visibleCount++;
              }

            }
          );

          category.style.display =
            visibleCount > 0
              ? ""
              : "none";

        }
      );

    }
  );

  clearButton.addEventListener(
    "click",
    () => {

      input.value = "";

      clearButton.style.display =
        "none";

      input.dispatchEvent(
        new Event("input")
      );

      input.focus();

    }
  );

}
/* =====================================================
   PHASE 7C-1 — HTML SAFETY HELPER
===================================================== */

function escapeHtml(value){

  return String(value).replace(
    /[&<>"]/g,
    character => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;"
    }[character])
  );

}

/* =====================================================
   PHASE 7B-3 — EXPLORE STUDENT CARD DATA
===================================================== */

function renderExploreStudentCard(student){
  if(!student) return "";
  const name = student.full_name || "Student";
  const verified = student.verified === true;
  const rank = student.rank !== null && student.rank !== undefined ? student.rank : "—";
  const id = escapeHtml(String(student.student_id || ""));
  return `
    <article class="explore-student-row" data-student-id="${id}">
      <span class="explore-student-row-rank">${rank === "—" ? "Unranked" : "#" + escapeHtml(String(rank))}</span>
      <div class="explore-student-row-main">
        <strong class="explore-student-row-name">${escapeHtml(String(name))}</strong>
        ${verified ? '<span class="explore-student-row-verified">✓ Verified</span>' : ""}
      </div>
      <button type="button" class="explore-student-action explore-student-row-action" data-student-id="${id}">View Profile</button>
    </article>
  `;
}

/* =====================================================
   PHASE 7B-2 — LOAD EXPLORE STUDENTS
===================================================== */
/* =====================================================
   PHASE 7B-5A — EXPLORE FILTER STATE
===================================================== */

let exploreStudentsCache = [];
  let exploreStudentsLoadError = null;

let exploreActiveFilter = "all";

let exploreActiveRole = "";

let exploreActiveSkill = "";

let exploreActiveCollege = "";
  /* =====================================================
   PHASE 7B-5D — EXPLORE FILTER ENGINE
===================================================== */

function applyExploreFilters(
  students
){

  let filtered =
    [...students];

  /* =========================
     VERIFIED FILTER
  ========================== */

  if(
    exploreActiveFilter ===
    "verified"
  ){

    filtered =
      filtered.filter(
        student =>
          student.verified === true
      );

  }

  /* =========================
     ROLE FILTER
  ========================== */

  if(
    exploreActiveRole
  ){

    filtered =
      filtered.filter(
        student =>
          String(
            student.role || ""
          ).toLowerCase() ===
          String(
            exploreActiveRole
          ).toLowerCase()
      );

  }

  /* =========================
     COLLEGE FILTER
  ========================== */

  if(
    exploreActiveCollege
  ){

    filtered =
      filtered.filter(
        student =>
          String(
            student.college || ""
          ).toLowerCase() ===
          String(
            exploreActiveCollege
          ).toLowerCase()
      );

  }

  /* =========================
     SKILL FILTER
  ========================== */

  if(
    exploreActiveSkill
  ){

    filtered =
      filtered.filter(
        student => {

          const skills =
            Array.isArray(
              student.verified_skills
            )
              ? student.verified_skills
              : [];

          return skills.some(
            skill =>
              String(
                skill?.name || ""
              ).toLowerCase() ===
              String(
                exploreActiveSkill
              ).toLowerCase()
          );

        }
      );

  }

  return filtered;

}
  /* =====================================================
   PHASE 7B-5E — POPULATE EXPLORE FILTERS
===================================================== */

function populateExploreFilters(){

  const roleFilter =
    document.getElementById(
      "exploreRoleFilter"
    );

  const skillFilter =
    document.getElementById(
      "exploreSkillFilter"
    );

  const collegeFilter =
    document.getElementById(
      "exploreCollegeFilter"
    );

  if(
    !roleFilter ||
    !skillFilter ||
    !collegeFilter
  ){
    return;
  }

  /* =========================
     ROLES
  ========================== */

  const roles =
    [
      ...new Set(
        exploreStudentsCache
          .map(
            student =>
              String(
                student.role || ""
              ).trim()
          )
          .filter(Boolean)
      )
    ]
    .sort();

  roleFilter.innerHTML =
    `
      <option value="">
        All Roles
      </option>
      ${
        roles
          .map(
            role => `
             <option value="${escapeHtml(role)}">
  ${escapeHtml(role)}
</option>
            `
          )
          .join("")
      }
    `;

  /* =========================
     SKILLS
  ========================== */

  const skills =
    [
      ...new Set(
        exploreStudentsCache
          .flatMap(
            student =>
              Array.isArray(
                student.verified_skills
              )
                ? student.verified_skills
                : []
          )
          .map(
            skill =>
              String(
                skill?.name || ""
              ).trim()
          )
          .filter(Boolean)
      )
    ]
    .sort();

  skillFilter.innerHTML =
    `
      <option value="">
        All Skills
      </option>
      ${
        skills
          .map(
            skill => `
           <option value="${escapeHtml(skill)}">
  ${escapeHtml(skill)}
</option>
            `
          )
          .join("")
      }
    `;

  /* =========================
     COLLEGES
  ========================== */

  const colleges =
    [
      ...new Set(
        exploreStudentsCache
          .map(
            student =>
              String(
                student.college || ""
              ).trim()
          )
          .filter(Boolean)
      )
    ]
    .sort();

  collegeFilter.innerHTML =
    `
      <option value="">
        All Colleges
      </option>
      ${
        colleges
          .map(
            college => `
            <option value="${escapeHtml(college)}">
  ${escapeHtml(college)}
</option>
            `
          )
          .join("")
      }
    `;

}
  /* =====================================================
   PHASE 7B-5F — EXPLORE DROPDOWN FILTER EVENTS
===================================================== */

function setupExploreFilterEvents(){

  const roleFilter =
    document.getElementById(
      "exploreRoleFilter"
    );

  const skillFilter =
    document.getElementById(
      "exploreSkillFilter"
    );

  const collegeFilter =
    document.getElementById(
      "exploreCollegeFilter"
    );

  if(roleFilter){

    roleFilter.addEventListener(
      "change",
      event => {

        exploreActiveRole =
          event.target.value;

        renderExploreStudents();

      }
    );

  }

  if(skillFilter){

    skillFilter.addEventListener(
      "change",
      event => {

        exploreActiveSkill =
          event.target.value;

        renderExploreStudents();

      }
    );

  }

  if(collegeFilter){

    collegeFilter.addEventListener(
      "change",
      event => {

        exploreActiveCollege =
          event.target.value;

        renderExploreStudents();

      }
    );

  }

}
  /* =====================================================
   PHASE 7C-2D — EXPLORE RETRY
===================================================== */

document.addEventListener(
  "click",
  event => {

    const retryButton =
      event.target.closest(
        "#exploreRetryBtn"
      );

    if(!retryButton){
      return;
    }

    renderExploreStudents();

  }
);
async function loadExploreStudents(){

  const {
    data,
    error
  } = await db
    .rpc(
      "get_explore_students"
    );
if(error){

  console.error(
    "Explore students loading error:",
    error
  );

  exploreStudentsLoadError =
    error;

  exploreStudentsCache =
    [];

  return [];

}
  exploreStudentsLoadError = null;
exploreStudentsCache =
  data || [];

return exploreStudentsCache;

}
  /* =====================================================
   PHASE 7B-8A — MY RANK
===================================================== */

async function updateExploreMyRank(){

  const rankElement =
    document.getElementById(
      "exploreMyRank"
    );

  if(!rankElement){
    return;
  }

  const {
    data: {
      user
    }
  } = await db.auth.getUser();

  if(!user){

    rankElement.textContent =
      "My Rank";

    return;

  }

  const currentStudent =
    exploreStudentsCache.find(
      student =>
        String(
          student.student_id
        ) ===
        String(
          user.id
        )
    );

  if(
    !currentStudent ||
    currentStudent.rank === null ||
    currentStudent.rank === undefined
  ){

    rankElement.textContent =
      "Not Ranked";

    return;

  }

  rankElement.textContent =
    `My Rank #${currentStudent.rank}`;

}
  /* =====================================================
   PHASE 7B-4 — RENDER EXPLORE STUDENTS
===================================================== */

async function renderExploreStudents(){

  const grid =
    document.getElementById(
      "exploreStudentsGrid"
    );

  const emptyState =
    document.getElementById(
      "exploreEmpty"
    );

  if(!grid){
    return;
  }

  grid.innerHTML = `
    <div class="skills-empty">
      Loading students...
    </div>
  `;

  const students =
    await loadExploreStudents();
  if(exploreStudentsLoadError){

  grid.innerHTML = `
    <div
      class="explore-load-error"
    >

      <strong>
        Unable to load students
      </strong>

      <span>
        Something went wrong while
        loading the Aldovra community.
      </span>

      <button
        type="button"
        id="exploreRetryBtn"
        class="explore-retry-btn"
      >
        Try Again
      </button>

    </div>
  `;

  if(emptyState){
    emptyState.style.display =
      "none";
  }

  return;

}
  
await updateExploreMyRank();
  
  /* =====================================================
   PHASE 7B-5B — APPLY EXPLORE FILTER
===================================================== */

const filteredStudents =
  applyExploreFilters(
    exploreStudentsCache
  );

if(!filteredStudents.length){

    grid.innerHTML = "";

    if(emptyState){
      emptyState.style.display = "";
    }

    return;
  }

  if(emptyState){
    emptyState.style.display = "none";
  }

const cards =
  filteredStudents.map(
    student =>
      renderExploreStudentCard(
        student
      )
  );

  grid.innerHTML =
    cards.join("");

}
  /* =====================================================
   PHASE 7B-5C — EXPLORE TAB FILTER
===================================================== */

document.addEventListener(
  "click",
  event => {

    const tab =
      event.target.closest(
        ".explore-tab"
      );

    if(!tab){
      return;
    }

    const filter =
     tab.dataset.exploreFilter;

    if(
      filter !== "all" &&
      filter !== "verified"
    ){
      return;
    }

    exploreActiveFilter =
      filter;

    document
      .querySelectorAll(
        ".explore-tab"
      )
      .forEach(
        item => {

          item.classList.toggle(
            "active",
            item === tab
          );

        }
      );

    renderExploreStudents();

  }
);
  /* =====================================================
   PHASE 7B-7D — PUBLIC ASSESSMENT STATS LOADER
===================================================== */

async function loadPublicStudentAssessmentStats(
  studentId
){

  const {
    data,
    error
  } = await db
    .rpc(
      "get_public_student_assessment_stats",
      {
        target_student_id:
          studentId
      }
    );

  if(error){

    console.error(
      "Public assessment stats loading error:",
      error
    );

    return null;

  }

  return (
    Array.isArray(data)
      ? data[0]
      : data
  ) || null;

}
  /* =====================================================
   PHASE 7B-6C — PUBLIC STUDENT PROFILE
===================================================== */
async function openExploreStudentProfile(
  studentId
){

  const student =
    exploreStudentsCache.find(
      item =>
        String(item.student_id) ===
        String(studentId)
    );

  if(!student){
    return;
  }
    const assessmentStats =
    await loadPublicStudentAssessmentStats(
      studentId
    );

  const modal =
    document.getElementById(
      "exploreStudentProfileModal"
    );

  if(!modal){
    return;
  }

  const name =
    student.full_name ||
    "Student";

  const role =
    student.role ||
    "Student";

  const college =
    student.college ||
    "";

  const verified =
    student.verified === true;

  const score =
    student.overall_score !== null &&
    student.overall_score !== undefined
      ? Number(student.overall_score)
      : null;

  const rank =
    student.rank !== null &&
    student.rank !== undefined
      ? student.rank
      : null;

  const skills =
    Array.isArray(
      student.verified_skills
    )
      ? student.verified_skills
      : [];

  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0,2)
      .map(
        part =>
          part
            .charAt(0)
            .toUpperCase()
      )
      .join("") ||
    "S";

  const nameElement =
    document.getElementById(
      "exploreStudentProfileName"
    );

  const roleElement =
    document.getElementById(
      "exploreStudentProfileRole"
    );

  const collegeElement =
    document.getElementById(
      "exploreStudentProfileCollege"
    );

  const avatarElement =
    document.getElementById(
      "exploreProfileAvatar"
    );

  const verifiedElement =
    document.getElementById(
      "exploreStudentProfileVerified"
    );

  const rankElement =
    document.getElementById(
      "exploreStudentProfileRank"
    );

  const scoreElement =
    document.getElementById(
      "exploreStudentProfileScore"
    );

  const skillCountElement =
    document.getElementById(
      "exploreStudentProfileSkillCount"
    );

  const statusElement =
    document.getElementById(
      "exploreStudentProfileStatus"
    );

  const skillsElement =
    document.getElementById(
      "exploreStudentProfileSkills"
    );

  const aboutElement =
    document.getElementById(
      "exploreStudentProfileAbout"
    );
  const assessmentCountElement =
    document.getElementById(
      "exploreProfileAssessmentCount"
    );

  const passedCountElement =
    document.getElementById(
      "exploreProfilePassedCount"
    );

  const averageScoreElement =
    document.getElementById(
      "exploreProfileAverageScore"
    );

  const bestScoreElement =
    document.getElementById(
      "exploreProfileBestScore"
    );

  const skillPerformanceElement =
    document.getElementById(
      "exploreProfileSkillPerformance"
    );
  if(nameElement){
    nameElement.textContent = name;
  }

  if(roleElement){
    roleElement.textContent = role;
  }

  if(collegeElement){
    collegeElement.textContent =
      college;
  }

  if(avatarElement){
    avatarElement.textContent =
      initials;
  }

  if(verifiedElement){
    verifiedElement.style.display =
      verified
        ? "inline-flex"
        : "none";
  }

  if(rankElement){
    rankElement.textContent =
      rank !== null
        ? `#${rank}`
        : "—";
  }

  if(scoreElement){
    scoreElement.textContent =
      score !== null
        ? `${score}%`
        : "—";
  }

  if(skillCountElement){
    skillCountElement.textContent =
      String(skills.length);
  }

  if(statusElement){
    statusElement.textContent =
      verified
        ? "Verified"
        : "Not Verified";
  }

  if(skillsElement){

    if(!skills.length){

      skillsElement.innerHTML = `
        <span class="explore-profile-about">
          No verified skills yet.
        </span>
      `;

    }else{

      skillsElement.innerHTML =
        skills
          .map(
            skill => `
              <span
                class="explore-profile-skill"
              >
                ✓ ${escapeHtml(
  String(
    skill?.name || ""
  )
)}
              </span>
            `
          )
          .join("");

    }

  }

  if(aboutElement){

    aboutElement.textContent =
      verified
        ? "This student has completed Aldovra skill verification and is discoverable through the Aldovra talent community."
        : "This student is registered on Aldovra and is currently building their verified skill profile.";

  }
    /* =====================================================
     PHASE 7B-7D — RENDER PUBLIC ASSESSMENT STATS
  ===================================================== */

  const totalAssessments =
    Number(
      assessmentStats?.total_assessments || 0
    );

  const passedAssessments =
    Number(
      assessmentStats?.passed_assessments || 0
    );

  const averageScore =
    assessmentStats?.average_score !== null &&
    assessmentStats?.average_score !== undefined
      ? Number(
          assessmentStats.average_score
        )
      : null;

  const bestScore =
    assessmentStats?.best_score !== null &&
    assessmentStats?.best_score !== undefined
      ? Number(
          assessmentStats.best_score
        )
      : null;


  if(assessmentCountElement){

    assessmentCountElement.textContent =
      String(
        totalAssessments
      );

  }


  if(passedCountElement){

    passedCountElement.textContent =
      String(
        passedAssessments
      );

  }


  if(averageScoreElement){

    averageScoreElement.textContent =
      averageScore !== null
        ? `${averageScore}%`
        : "—";

  }


  if(bestScoreElement){

    bestScoreElement.textContent =
      bestScore !== null
        ? `${bestScore}%`
        : "—";

  }


  if(skillPerformanceElement){

    const skillPerformance =
      Array.isArray(
        assessmentStats?.skill_performance
      )
        ? assessmentStats.skill_performance
        : [];


    if(!skillPerformance.length){

      skillPerformanceElement.innerHTML = `
        <div
          class="explore-profile-performance-empty"
        >
          No verified assessment performance
          available yet.
        </div>
      `;

    }else{

      skillPerformanceElement.innerHTML =
        skillPerformance
          .map(
            skill => {

              const score =
                Number(
                  skill?.score || 0
                );

              const safeScore =
                Math.max(
                  0,
                  Math.min(
                    100,
                    score
                  )
                );

              return `
                <div
                  class="explore-profile-skill-performance-row"
                >

                  <div
                    class="explore-profile-skill-performance-info"
                  >

                    <div
                      class="explore-profile-skill-performance-name"
                    >
                      ${skill?.name || "Skill"}
                    </div>

                    <div
                      class="explore-profile-skill-performance-bar"
                    >

                      <div
                        class="explore-profile-skill-performance-fill"
                        style="width:${safeScore}%"
                      ></div>

                    </div>

                  </div>

                  <span
                    class="explore-profile-skill-performance-score"
                  >
                    ${safeScore}%
                  </span>

                </div>
              `;

            }
          )
          .join("");

    }

  }

  modal.classList.remove(
    "hidden"
  );

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

}
  /* =====================================================
   PHASE 7B-6C — VIEW PROFILE BUTTON
===================================================== */

document.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        ".explore-student-action"
      );

    if(!button){
      return;
    }

    const studentId =
      button.dataset.studentId;

    if(!studentId){
      return;
    }

    openExploreStudentProfile(
      studentId
    );

  }
);
  /* =====================================================
   PHASE 7B-6C — CLOSE PUBLIC PROFILE
===================================================== */

function closeExploreStudentProfile(){
  document.activeElement?.blur();
  const modal =
    document.getElementById(
      "exploreStudentProfileModal"
    );

  if(!modal){
    return;
  }

  modal.classList.add(
    "hidden"
  );

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

}

document.addEventListener(
  "click",
  event => {

    if(
      event.target.closest(
        "#closeExploreStudentProfileBtn"
      ) ||
      event.target.closest(
        "#closeExploreStudentProfileActionBtn"
      )
    ){

      closeExploreStudentProfile();

    }

  }
);
  /* =====================================================
   PHASE 7B-6C — PROFILE MODAL EXIT
===================================================== */

document.addEventListener(
  "click",
  event => {

    const modal =
      document.getElementById(
        "exploreStudentProfileModal"
      );

    if(
      modal &&
      event.target === modal
    ){

      closeExploreStudentProfile();

    }

  }
);

document.addEventListener(
  "keydown",
  event => {

    if(
      event.key !== "Escape"
    ){
      return;
    }

    const modal =
      document.getElementById(
        "exploreStudentProfileModal"
      );

    if(
      modal &&
      !modal.classList.contains(
        "hidden"
      )
    ){

      closeExploreStudentProfile();

    }

  }
);
async function loadCareerTracks() {

  const tracksGrid =
    document.getElementById("careerTracksGrid");

  if (!tracksGrid) return;


  /* =========================
     LOADING
  ========================== */

  tracksGrid.innerHTML =
    `
      <div class="skills-empty">
        Loading career tracks...
      </div>
    `;


  /* =========================
     CURRENT USER
  ========================== */

  const {
    data: {
      user
    }
  } = await db.auth.getUser();


  if (!user) {

    tracksGrid.innerHTML =
      `
        <div class="skills-empty">
          Please log in to view career tracks.
        </div>
      `;

    return;
  }


  /* =========================
     CAREER TRACKS
  ========================== */

  const {
    data: tracks,
    error: tracksError
  } = await db
    .from("career_tracks")
    .select(
      "id, name, slug, description"
    )
    .eq("active", true)
    .order("name");


  if (tracksError) {

    console.error(
      "Career tracks loading error:",
      tracksError
    );

    tracksGrid.innerHTML =
      `
        <div class="skills-empty">
          Unable to load career tracks right now.
        </div>
      `;

    return;
  }


  if (!tracks || tracks.length === 0) {

    tracksGrid.innerHTML =
      `
        <div class="skills-empty">
          No career tracks are available right now.
        </div>
      `;

    return;
  }


  /* =========================
     STUDENT SELECTED SKILLS
  ========================== */

  const {
    data: selectedSkills,
    error: selectedError
  } = await db
    .from("student_skills")
    .select("skill_id")
    .eq("user_id", user.id);


  if (selectedError) {

    console.error(
      "Career track selected skills error:",
      selectedError
    );

    tracksGrid.innerHTML =
      `
        <div class="skills-empty">
          Unable to load your career track progress.
        </div>
      `;

    return;
  }


  const selectedSkillIds =
    new Set(
      (selectedSkills || []).map(
        skill => skill.skill_id
      )
    );


  /* =========================
     TRACK → SKILL MAPPINGS
  ========================== */

const {
  data: trackSkills,
  error: trackSkillsError
} = await db
  .from("career_track_skills")
  .select(`
    track_id,
    skill_id,
    roadmap_order,
    roadmap_stage
  `)
  .order("roadmap_order", {
    ascending: true
  });
if (trackSkillsError) {
  console.error(
    "Career track skills loading error:",
    trackSkillsError
  );

  tracksGrid.innerHTML =
    "<div class=\"skills-empty\">Unable to load career track skills right now.</div>";

  return;
}

const roadmapByTrack = {};

(trackSkills || []).forEach(item => {
  if (!roadmapByTrack[item.track_id]) {
    roadmapByTrack[item.track_id] = [];
  }

  roadmapByTrack[item.track_id].push({
    skill_id: item.skill_id,
    roadmap_order: item.roadmap_order,
    roadmap_stage: item.roadmap_stage
  });
});

Object.keys(roadmapByTrack).forEach(trackId => {
  roadmapByTrack[trackId].sort(
    (a, b) =>
      (a.roadmap_order ?? 999) -
      (b.roadmap_order ?? 999)
  );
});
  

 


  /* =========================
     RENDER TRACKS
  ========================== */

  tracksGrid.innerHTML = "";


  tracks.forEach(track => {

  const requiredSkills =
  roadmapByTrack[track.id] || [];

    const matchedSkills =
      requiredSkills.filter(
        mapping =>
          selectedSkillIds.has(
            mapping.skill_id
          )
      );


    const totalSkills =
      requiredSkills.length;


    const matchedCount =
      matchedSkills.length;


    const percentage =
      totalSkills === 0
        ? 0
        : Math.round(
            (
              matchedCount /
              totalSkills
            ) * 100
          );


    /* =========================
       CARD
    ========================== */

    const trackElement =
      document.createElement("div");


    trackElement.className =
      "career-track-card";

trackElement.dataset.trackId =
  track.id;

trackElement.setAttribute(
  "role",
  "button"
);

trackElement.setAttribute(
  "tabindex",
  "0"
);
    trackElement.innerHTML = `

      <div class="career-track-card-head">

        <div class="career-track-card-name">
          ${track.name}
        </div>

        <div class="career-track-percent">
          ${percentage}% match
        </div>

      </div>


      <div class="career-track-card-desc">
        ${
          track.description ||
          "Build the skills required for this career path."
        }
      </div>


      <div class="career-track-match">

        <span>
          Skill readiness
        </span>

        <strong>
          ${matchedCount}/${totalSkills}
        </strong>

      </div>


      <div class="career-track-progress">

        <span
          style="width:${percentage}%"
        ></span>

      </div>


      <div class="career-track-skills">

        <span>
          ${
            matchedCount === totalSkills &&
            totalSkills > 0
              ? "✓ All required skills matched"
              : `${matchedCount} of ${totalSkills} required skills matched`
          }
        </span>

        <span>
          ${
            percentage >= 80
              ? "Strong match"
              : percentage >= 50
                ? "Good progress"
                : percentage > 0
                  ? "Keep building"
                  : "Start building"
          }
        </span>

      </div>

    `;


    tracksGrid.appendChild(
      trackElement
    );

  });

}
  /* =====================================================
   BATCH 9 — CAREER TRACK DETAILS
===================================================== */

async function openCareerTrackDetails(
  trackId
) {

  const modal =
    document.getElementById(
      "careerTrackDetailModal"
    );

  const body =
    document.getElementById(
      "careerTrackDetailBody"
    );

  if (!modal || !body) return;


  /* =========================
     OPEN
  ========================== */

  modal.classList.remove(
    "hidden"
  );

  modal.setAttribute(
    "aria-hidden",
    "false"
  );


  body.innerHTML = `
    <div class="career-track-detail-loading">
      Loading career track...
    </div>
  `;

  

  /* =========================
     TRACK
  ========================== */

  const {
    data: track,
    error: trackError
  } = await db
    .from("career_tracks")
    .select(
      "id, name, slug, description"
    )
    .eq(
      "id",
      trackId
    )
    .maybeSingle();


  if (
    trackError ||
    !track
  ) {

    console.error(
      "Career track detail error:",
      trackError
    );

    body.innerHTML = `
      <div class="career-track-detail-empty">
        Unable to load this career track.
      </div>
    `;

    return;
  }


  /* =========================
     CURRENT USER
  ========================== */

  const {
    data: {
      user
    }
  } = await db.auth.getUser();


  if (!user) {

    body.innerHTML = `
      <div class="career-track-detail-empty">
        Please log in to view this career track.
      </div>
    `;

    return;
  }


  /* =========================
     TRACK → SKILLS
  ========================== */

const {
  data: mappings,
  error: mappingsError
} = await db
  .from("career_track_skills")
  .select(`
    track_id,
    skill_id,
    roadmap_order,
    roadmap_stage
  `)
   .eq(
    "track_id",
    trackId
  )
  .order("roadmap_order", {
    ascending: true
  });


  if (mappingsError) {

    console.error(
      "Career track skill mapping error:",
      mappingsError
    );

    body.innerHTML = `
      <div class="career-track-detail-empty">
        Unable to load the required skills.
      </div>
    `;

    return;
  }
/* =====================================================
   BATCH 2 — ORGANIZE CAREER ROADMAP DATA
===================================================== */

const roadmapByTrack = {};

(mappings || []).forEach(item => {

  if (!roadmapByTrack[item.track_id]) {

    roadmapByTrack[item.track_id] = [];

  }

  roadmapByTrack[item.track_id].push({

    skill_id:
      item.skill_id,

    roadmap_order:
      item.roadmap_order,

    roadmap_stage:
      item.roadmap_stage

  });

});


Object.keys(roadmapByTrack).forEach(
  trackId => {

    roadmapByTrack[trackId].sort(
      (a, b) =>
        (a.roadmap_order ?? 999) -
        (b.roadmap_order ?? 999)
    );

  }
);

  const skillIds =
    (mappings || [])
      .map(
        item =>
          item.skill_id
      );


  /* =========================
     SKILL DATA
  ========================== */

  let skills = [];


  if (skillIds.length) {

    const {
      data,
      error
    } = await db
      .from("skills")
      .select(
        "id, name, category"
      )
      .in(
        "id",
        skillIds
      );


    if (error) {

      console.error(
        "Career track skills error:",
        error
      );

      body.innerHTML = `
        <div class="career-track-detail-empty">
          Unable to load skill information.
        </div>
      `;

      return;
    }


    skills =
      data || [];
  }


  /* =========================
     STUDENT SKILLS
  ========================== */

  const {
    data: selectedSkills,
    error: selectedError
  } = await db
    .from("student_skills")
    .select(
      "skill_id"
    )
    .eq(
      "user_id",
      user.id
    );


  if (selectedError) {

    console.error(
      "Student skills error:",
      selectedError
    );

    body.innerHTML = `
      <div class="career-track-detail-empty">
        Unable to load your selected skills.
      </div>
    `;

    return;
  }


  const selectedSkillIds =
    new Set(
      (selectedSkills || [])
        .map(
          item =>
            item.skill_id
        )
    );


  /* =========================
     MATCHING
  ========================== */

  const matchedSkills =
    skills.filter(
      skill =>
        selectedSkillIds.has(
          skill.id
        )
    );


  const missingSkills =
    skills.filter(
      skill =>
        !selectedSkillIds.has(
          skill.id
        )
    );


  const totalSkills =
    skills.length;


  const matchedCount =
    matchedSkills.length;


  const missingCount =
    missingSkills.length;


  const percentage =
    totalSkills === 0
      ? 0
      : Math.round(
          (
            matchedCount /
            totalSkills
          ) * 100
        );


  const scoreAngle =
    Math.round(
      percentage * 3.6
    );


  /* =========================
     SKILL ROW BUILDER
  ========================== */

  const createSkillRow =
    (
      skill,
      matched
    ) => {

      return `
        <div
          class="career-track-detail-skill"
        >

          <div
            class="career-track-detail-skill-left"
          >

            <div
              class="
                career-track-detail-skill-icon
                ${matched ? "matched" : "missing"}
              "
            >
              ${matched ? "✓" : "!"}
            </div>

            <div>

              <div
                class="career-track-detail-skill-name"
              >
                ${esc(skill.name)}
              </div>

              <div
                style="
                  margin-top:3px;
                  color:var(--muted);
                  font-size:11px;
                "
              >
                ${esc(skill.category || "Skill")}
              </div>

            </div>

          </div>


         ${
  matched

    ? `
      <span
        class="
          career-track-detail-status
          matched
        "
      >
        Matched
      </span>
    `

    : `
      <button
        type="button"
        class="career-track-detail-build-btn"
        data-build-skill-id="${esc(skill.id)}"
        data-build-skill-name="${esc(skill.name)}"
        data-build-skill-category="${esc(skill.category || "Skill")}"
      >
        Build this skill →
      </button>
    `
}

        </div>
      `;
    };







  /* =========================
     CAREER ROADMAP
  ========================== */

  const roadmapItems =
    roadmapByTrack[track.id] || [];


  const roadmapSkillMap =
    new Map(
      skills.map(
        skill => [
          skill.id,
          skill
        ]
      )
    );


  const roadmapStages = [
    {
      key: "foundation",
      title: "Foundation",
      description:
        "Build the essential fundamentals first."
    },
    {
      key: "core",
      title: "Core",
      description:
        "Develop the main skills required for this career path."
    },
    {
      key: "advanced",
      title: "Advanced",
      description:
        "Build advanced capabilities and become career ready."
    }
  ];


  const roadmapHTML =
    roadmapStages
      .map(stage => {

        const stageItems =
          roadmapItems.filter(
            item =>
              item.roadmap_stage ===
              stage.key
          );


        if (!stageItems.length) {
          return "";
        }


        const stageRows =
          stageItems
            .map(item => {

              const skill =
                roadmapSkillMap.get(
                  item.skill_id
                );


              if (!skill) {
                return "";
              }


              const matched =
                selectedSkillIds.has(
                  skill.id
                );


              return `
                <div
                  class="career-track-roadmap-item"
                  style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:14px;
                    padding:13px 14px;
                    border:1px solid var(--border);
                    border-radius:12px;
                    background:#fff;
                    margin-top:8px;
                  "
                >

                  <div
                    style="
                      display:flex;
                      align-items:center;
                      gap:11px;
                      min-width:0;
                    "
                  >

                    <div
                      style="
                        width:30px;
                        height:30px;
                        border-radius:9px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        flex:0 0 30px;
                        font-weight:900;
                        background:${
                          matched
                            ? "rgba(22,163,74,.10)"
                            : "rgba(79,70,229,.08)"
                        };
                        color:${
                          matched
                            ? "var(--green)"
                            : "var(--primary)"
                        };
                      "
                    >
                      ${
                        matched
                          ? "✓"
                          : item.roadmap_order
                      }
                    </div>


                    <div
                      style="
                        min-width:0;
                      "
                    >

                      <div
                        style="
                          font-size:12px;
                          font-weight:850;
                          color:var(--text);
                        "
                      >
                        ${esc(skill.name)}
                      </div>

                      <div
                        style="
                          margin-top:3px;
                          font-size:11px;
                          color:var(--muted);
                        "
                      >
                        ${esc(
                          skill.category ||
                          "Skill"
                        )}
                      </div>

                    </div>

                  </div>


                  ${
                    matched

                      ? `
                        <span
                          style="
                            flex:0 0 auto;
                            padding:5px 8px;
                            border-radius:999px;
                            background:rgba(22,163,74,.10);
                            color:var(--green);
                            font-size:11px;
                            font-weight:850;
                          "
                        >
                          Completed
                        </span>
                      `

                      : `
                        <button
                          type="button"
                          class="career-track-detail-build-btn"
                          data-build-skill-id="${esc(skill.id)}"
                          data-build-skill-name="${esc(skill.name)}"
                          data-build-skill-category="${esc(skill.category || "Skill")}"
                        >
                          Build →
                        </button>
                      `
                  }

                </div>
              `;

            })
            .join("");


        return `
          <div
            class="career-track-roadmap-stage"
            style="
              margin-top:18px;
            "
          >

            <div
              style="
                display:flex;
                align-items:center;
                gap:9px;
              "
            >

              <div
                style="
                  width:8px;
                  height:8px;
                  border-radius:50%;
                  background:var(--primary);
                  flex:0 0 8px;
                "
              ></div>

              <div>

                <div
                  style="
                    font-size:12px;
                    font-weight:900;
                    color:var(--text);
                    text-transform:uppercase;
                    letter-spacing:.04em;
                  "
                >
                  ${stage.title}
                </div>

                <div
                  style="
                    margin-top:3px;
                    font-size:11px;
                    color:var(--muted);
                  "
                >
                  ${stage.description}
                </div>

              </div>

            </div>


            <div>
              ${stageRows}
            </div>

          </div>
        `;

      })
      .join("");


  const careerRoadmapSection =
    roadmapItems.length
      ? `
        <div
          class="career-track-detail-section"
          style="
            margin-top:22px;
          "
        >

          <div
            style="
              margin-bottom:12px;
            "
          >

            <div
              style="
                font-size:15px;
                font-weight:900;
                color:var(--text);
              "
            >
              Career Roadmap
            </div>

            <div
              style="
                margin-top:4px;
                font-size:11.5px;
                color:var(--muted);
              "
            >
              Follow the skill progression from
              foundation to advanced level.
            </div>

          </div>

          ${roadmapHTML}

        </div>
      `
      : "";

  /* =========================
     RENDER
  ========================== */

  body.innerHTML = `
   

    <div class="career-track-detail-kicker">
      ALDOVRA CAREER PATH
    </div>


    <h2
      id="careerTrackDetailTitle"
      class="career-track-detail-title"
    >
      ${esc(track.name)}
    </h2>


    <p
      class="career-track-detail-description"
    >
      ${
        esc(
          track.description ||
          "Build the skills required for this career path."
        )
      }
    </p>


    <!-- READINESS -->

    <div
      class="career-track-detail-readiness"
    >

      <div
        class="career-track-detail-score"
        style="
          --track-score-angle:
          ${scoreAngle}deg;
        "
      >

        <div
          class="
            career-track-detail-score-inner
          "
        >

          <strong>
            ${percentage}%
          </strong>

          <span>
           Assessment progress
          </span>

        </div>

      </div>


      <div>

        <div
          class="
            career-track-detail-summary
          "
        >

          <div
            class="
              career-track-detail-stat
              matched
            "
          >

            <small>
              Matched
            </small>

            <strong>
              ${matchedCount}
            </strong>

          </div>


          <div
            class="
              career-track-detail-stat
              missing
            "
          >

            <small>
              Missing
            </small>

            <strong>
              ${missingCount}
            </strong>

          </div>


          <div
            class="career-track-detail-stat"
          >

            <small>
              Required
            </small>

            <strong>
              ${totalSkills}
            </strong>
          </div>
        </div>
      </div>
    </div>
 ${careerRoadmapSection}
        

  `;
}
/* =====================================================
   CLOSE
===================================================== */

function closeCareerTrackDetails() {

  const modal =
    document.getElementById(
      "careerTrackDetailModal"
    );

  if (!modal) return;

  modal.classList.add(
    "hidden"
  );

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

}


/* =====================================================
   CARD CLICK
===================================================== */

document
  .getElementById(
    "careerTracksGrid"
  )
  ?.addEventListener(
    "click",
    event => {

      const card =
        event.target.closest(
          ".career-track-card"
        );

      if (!card) return;


      const trackId =
        card.dataset.trackId;


      if (!trackId) return;


      openCareerTrackDetails(
        trackId
      );

    }
  );


/* =====================================================
   KEYBOARD
===================================================== */

document
  .getElementById(
    "careerTracksGrid"
  )
  ?.addEventListener(
    "keydown",
    event => {

      if (
        event.key !== "Enter" &&
        event.key !== " "
      ) {
        return;
      }


      const card =
        event.target.closest(
          ".career-track-card"
        );


      if (!card) return;


      event.preventDefault();


      const trackId =
        card.dataset.trackId;


      if (!trackId) return;


      openCareerTrackDetails(
        trackId
      );

    }
  );


/* =====================================================
   CLOSE BUTTON
===================================================== */

document
  .getElementById(
    "closeCareerTrackDetailBtn"
  )
  ?.addEventListener(
    "click",
    closeCareerTrackDetails
  );


/* =====================================================
   CLICK OUTSIDE
===================================================== */

document
  .getElementById(
    "careerTrackDetailModal"
  )
  ?.addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "careerTrackDetailModal"
      ) {

        closeCareerTrackDetails();

      }

    }
  );


/* =====================================================
   ESCAPE
===================================================== */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape"
    ) {

      const modal =
        document.getElementById(
          "careerTrackDetailModal"
        );

      if (
        modal &&
        !modal.classList.contains(
          "hidden"
        )
      ) {

        closeCareerTrackDetails();

      }

    }

  }
);
  /* =====================================================
   BATCH 10 — BUILD MISSING SKILL
===================================================== */

document
  .getElementById(
    "careerTrackDetailModal"
  )
  ?.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          "[data-build-skill-id]"
        );

      if (!button) return;


      const skill = {

        id:
          button.dataset
            .buildSkillId,

        name:
          button.dataset
            .buildSkillName,

        category:
          button.dataset
            .buildSkillCategory

      };


      /*
       * Close career-track detail modal
       * before opening the existing
       * Aldovra skill assessment popup.
       */

      closeCareerTrackDetails();


      /*
       * Reuse existing Batch 6
       * assessment controller.
       */

      openSkillAssessmentModal(
        skill
      );

    }
  );
  loadCareerTracks();

  setupSkillsSearch();
/* =====================================================
     ELEMENTS
  ====================================================== */

  const welcomeName =
    document.getElementById("welcomeName");

  const candidateName =
    document.getElementById("candidateName");

  const candidateAvatar =
    document.getElementById("candidateAvatar");

  const topAvatar =
    document.getElementById("topAvatar");

  const profileName =
    document.getElementById("profileName");
  const profileEmail =
  document.getElementById("profileEmail");
  const profileCompletionPercent =
  document.getElementById("profileCompletionPercent");

const profileCompletionBar =
  document.getElementById("profileCompletionBar");

const profileCompletionText =
  document.getElementById("profileCompletionText");
function updateProfileCompletion() {

  /* Target Career is a required field and contributes to completion. */
  const fields = [
    {
      label: "Full Name",
      value: profileName.value.trim()
    },
    {
      label: "City",
      value: profileCity.value.trim()
    },
    {
      label: "College / University",
      value: profileCollege.value.trim()
    },
    {
      label: "Degree",
      value: profileDegree.value.trim()
    },
    {
      label: "Graduation Year",
      value: profileGraduationYear.value
    },
    {
      label: "About You",
      value: profileBio.value.trim()
    },
    {
      label: "GitHub Profile",
      value: profileGithub.value.trim()
    },
    {
      label: "LinkedIn Profile",
      value: profileLinkedin.value.trim()
    },
    {
      label: "Target Career",
      value: targetCareer.value
    }
  ];

  const missingFields =
    fields.filter(
      field =>
        field.value === null ||
        field.value === ""
    );

  const completed =
    fields.length - missingFields.length;

  const percentage =
    Math.round(
      (completed / fields.length) * 100
    );

  /* Percentage */
  if (profileCompletionPercent) {
    profileCompletionPercent.textContent =
      `${percentage}%`;
  }

  /* Progress bar */
  if (profileCompletionBar) {
    profileCompletionBar.style.width =
      `${percentage}%`;
  }

  /* Completion message */
  if (profileCompletionText) {

    if (percentage === 100) {

      profileCompletionText.textContent =
        "Your Aldovra student profile is complete.";

    } else {

      const remaining =
        missingFields.length;

      const fieldNames =
        missingFields
          .map(field => field.label)
          .join(", ");

      profileCompletionText.textContent =
        `${remaining} profile ${
          remaining === 1
            ? "field"
            : "fields"
        } remaining: ${fieldNames}.`;
    }
  }

  return percentage;
}

  const profileRole =
    document.getElementById("profileRole");

  const profileCity =
    document.getElementById("profileCity");
  const targetCareer =
  document.getElementById("targetCareer");
  const profileCollege =
  document.getElementById("profileCollege");

const profileDegree =
  document.getElementById("profileDegree");

const profileGraduationYear =
  document.getElementById("profileGraduationYear");

const profileBio =
  document.getElementById("profileBio");

const profileGithub =
  document.getElementById("profileGithub");

const profileLinkedin =
  document.getElementById("profileLinkedin");

  const profileMessage =
    document.getElementById("profileMessage");


  /* =====================================================
     THEME
  ====================================================== */

  const themeBtn =
    document.getElementById("themeBtn");

  const savedTheme =
    localStorage.getItem("aldovra-dashboard-theme");

  if (savedTheme === "dark") {
    document.body.classList.add("dark");
    themeBtn.textContent = "🌙";
  }

  themeBtn.addEventListener("click", () => {

    document.body.classList.toggle("dark");

    const isDark =
      document.body.classList.contains("dark");

    localStorage.setItem(
      "aldovra-dashboard-theme",
      isDark ? "dark" : "light"
    );

    themeBtn.textContent =
      isDark ? "🌙" : "☀️";

    updateChartTheme();

  });


  /* =====================================================
     HOME
  ====================================================== */

  document
    .getElementById("homeBtn")
    .addEventListener("click", () => {

      window.location.href = "/";

    });

  /* =====================================================
   PROFILE AVATAR
====================================================== */




  /* =====================================================
     LOAD USER
  ====================================================== */

  async function loadUser() {

    const {
      data: {
        user
      }
    } = await db.auth.getUser();


    if (!user) {
      window.location.href =
        "/login.html";
      return;
    }
    currentUser = user;

    if (profileEmail) {
      profileEmail.value =
        user.email || "";
    }

    const authRole =
      user.user_metadata?.role || "student";

    if (profileRole) {
      profileRole.value =
        authRole.charAt(0).toUpperCase() +
        authRole.slice(1);
    }
    
    const metadata =
      user.user_metadata || {};

    const fallbackName =
      metadata.full_name ||
      user.email?.split("@")[0] ||
      "Student";

    const fallbackRole =
      metadata.role ||
      "student";


    let profile = null;


    try {

      const {
        data,
        error
      } = await db
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();


  if (error) {
  console.error("Profile load error:", error);
} else {
  profile = data;
}
    } catch (error) {

      console.log(
        "Profile fetch fallback:",
        error
      );

    }


    const name =
      profile?.full_name ||
      fallbackName;

    const role =
      profile?.role ||
      fallbackRole;

    const city =
      profile?.city ||
      "";

if (welcomeName) {
  welcomeName.textContent =
    name.split(" ")[0];
}

if (candidateName) {
  candidateName.textContent =
    name;
}
profileName.value =
  name;
    profileCity.value =
      city;
    targetCareer.value =
  profile?.career_track || "";
    
    profileCollege.value =
      profile?.college || "";

    profileDegree.value =
      profile?.degree || "";

    profileGraduationYear.value =
      profile?.graduation_year || "";

    profileBio.value =
      profile?.bio || "";

    profileGithub.value =
      profile?.github_url || "";

    profileLinkedin.value =
      profile?.linkedin_url || "";
    updateProfileCompletion();
    /* =====================================================
   FIRST TIME ONBOARDING — SHOW AFTER PROFILE LOAD
===================================================== */

const onboardingModal =
  document.getElementById("firstTimeOnboarding");

if (onboardingModal) {
  const completion = updateProfileCompletion();

  if (completion < 100) {
    onboardingModal.style.display = "flex";
  }
}
    window.loadProfilePhoto?.();
    window.updateProfileDisplay?.();

    const firstLetter =
      name
        .trim()
        .charAt(0)
        .toUpperCase() ||
      "A";

    if (topAvatar) {
      topAvatar.textContent =
        firstLetter;
    }

    if (candidateAvatar) {
      candidateAvatar.textContent =
        firstLetter;
    }

  }


  loadUser();
/* =====================================================
   FIRST TIME ONBOARDING — COMPLETE PROFILE BUTTON
====================================================== */

const startOnboardingBtn =
  document.getElementById("startOnboardingBtn");

if (startOnboardingBtn) {

  startOnboardingBtn.addEventListener(
    "click",
    () => {

      const onboardingModal =
        document.getElementById(
          "firstTimeOnboarding"
        );

      /* Close onboarding popup */
      if (onboardingModal) {
        onboardingModal.style.display = "none";
      }
      /* Mark onboarding profile step */
window.__aldovraOnboardingProfileStep = true;

      /* Open existing profile modal */
   window.openProfileModal?.();

      /* Immediately enable editing */
   window.takeProfileSnapshot?.();
window.setProfileEditing?.(true);
    }
  );

}
  /* =====================================================
   ONBOARDING — PREVIEW DASHBOARD
====================================================== */

const previewDashboardBtn =
  document.getElementById("previewDashboardBtn");

if (previewDashboardBtn) {

  previewDashboardBtn.addEventListener(
    "click",
    () => {

      const onboardingModal =
        document.getElementById(
          "firstTimeOnboarding"
        );

      /* Close onboarding popup */
      if (onboardingModal) {
        onboardingModal.style.display = "none";
      }

      /* Enable preview mode */
      document.body.classList.add(
        "aldovra-preview-mode"
      );

      window.__aldovraPreviewMode = true;
      const previewBanner =
  document.getElementById(
    "aldovraPreviewBanner"
  );

if (previewBanner) {
  previewBanner.style.display = "block";
}

      /* Scroll dashboard to top */
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

    }
  );

}
    /* =====================================================
     ALDOVRA — PREVIEW MODE ACTION LOCK
  ====================================================== */

  function aldovraPreviewGuard(event) {

    if (!window.__aldovraPreviewMode) {
      return false;
    }

    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    alert(
      "🔒 Complete your profile to unlock this feature."
    );

    return true;
  }
  /* =====================================================
   PREVIEW — BLOCK ASSESSMENT ACTIONS
====================================================== */

document.addEventListener(
  "click",
  event => {

    const assessmentButton =
      event.target.closest(
        "[data-recommended-assessment]"
      );

    if (!assessmentButton) {
      return;
    }

    if (
      window.__aldovraPreviewMode
    ) {

      aldovraPreviewGuard(event);

    }

  },
  true
);

/* =====================================================
   SAVE PROFILE
====================================================== */

var currentUser = null;

document
  .getElementById("saveProfileBtn")
  .addEventListener("click", async () => {

    const name =
      profileName.value.trim();

    const city =
      profileCity.value.trim();

    const college =
      profileCollege.value.trim();

    const degree =
      profileDegree.value.trim();

    const graduationYear =
      profileGraduationYear.value
        ? Number(profileGraduationYear.value)
        : null;

    const bio =
      profileBio.value.trim();

    const githubUrl =
      profileGithub.value.trim();

    const linkedinUrl =
      profileLinkedin.value.trim();

    const profileCompletion =
      updateProfileCompletion();

    if (!name) {
      if (profileMessage) {
        profileMessage.textContent =
          "Please enter your name.";
      }
      return;
    }

    if (!currentUser) {
      if (profileMessage) {
        profileMessage.textContent =
          "Please wait for your profile to finish loading.";
      }
      return;
    }

    if (profileMessage) {
      profileMessage.textContent =
        "Saving...";
    }

    try {

      const { error } = await db.rpc(
        "save_student_profile",
        {
          p_full_name: name,
          p_city: city,
          p_college: college,
          p_degree: degree,
          p_graduation_year: graduationYear,
          p_bio: bio,
          p_github_url: githubUrl,
          p_linkedin_url: linkedinUrl,
          p_career_track: targetCareer.value,
          p_profile_completion: profileCompletion
        }
      );

      if (error) {
        console.error(
          "Profile save error:",
          error
        );

        if (profileMessage) {
          profileMessage.textContent =
            "Profile could not be saved. Please try again.";
        }

        return;
      }

     

      const firstLetter =
        name
          .trim()
          .charAt(0)
          .toUpperCase();

     if (welcomeName) {
  welcomeName.textContent =
    name.split(" ")[0];
}

if (candidateName) {
  candidateName.textContent =
    name;
}

if (topAvatar) {
  topAvatar.textContent =
    firstLetter;
}

if (candidateAvatar) {
  candidateAvatar.textContent =
    firstLetter;
}

      /* Keep the in-memory profile aligned with the saved source of truth. */
      profile = {
        ...(profile || {}),
        full_name: name,
        city,
        college,
        degree,
        graduation_year: graduationYear,
        bio,
        github_url: githubUrl,
        linkedin_url: linkedinUrl,
        career_track: targetCareer.value,
        profile_completion: profileCompletion
      };

      updateProfileCompletion();
      window.updateProfileDisplay?.();

      const photoResult =
        await window.uploadProfilePhoto?.();

      if (photoResult && !photoResult.ok) {
        if (profileMessage) {
          profileMessage.textContent =
            "Profile saved, but photo upload failed: " +
            photoResult.message;
        }
        return;
      }

      if (profileMessage) {
        profileMessage.textContent =
          "✓ Profile updated successfully.";
      }

      window.setProfileEditing?.(false);
      /* =====================================================
   ONBOARDING — PROFILE → RESUME
===================================================== */

if (
  window.__aldovraOnboardingProfileStep &&
  updateProfileCompletion() >= 100
) {

  const resumeBox =
    document.querySelector(
      "#profileDetailsModal .resume-upload-box"
    );

  if (resumeBox) {

    setTimeout(() => {

      resumeBox.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      resumeBox.classList.add(
        "aldovra-resume-next-step"
      );

      setTimeout(() => {
        resumeBox.classList.remove(
          "aldovra-resume-next-step"
        );
      }, 3000);

    }, 350);

  }

}
      pendingProfilePhoto = null;

    } catch (error) {

      console.error(
        "Profile save exception:",
        error
      );

     profileMessage.textContent =
  "Error: " + (error?.message || "Unknown error");
    }

  });

  /* =====================================================
   BATCH 8A — RESUME UPLOAD
===================================================== */

const resumeFileInput =
  document.getElementById("resumeFileInput");

const uploadResumeBtn =
  document.getElementById("uploadResumeBtn");
  const viewResumeBtn =
  document.getElementById("viewResumeBtn");
  const analyzeResumeBtn =
  document.getElementById("analyzeResumeBtn");

const resumeMessage =
  document.getElementById("resumeMessage");

const resumeStatus =
  document.getElementById("resumeStatus");
  const resumeIntelligenceEmpty =
  document.getElementById(
    "resumeIntelligenceEmpty"
  );

const resumeIntelligenceGrid =
  document.getElementById(
    "resumeIntelligenceGrid"
  );


async function uploadStudentResume() {

  if (!currentUser) {
    if (resumeMessage) {
      resumeMessage.textContent =
        "Please wait for your profile to finish loading.";
    }
    return;
  }

  if (!resumeFileInput) {
    return;
  }

  const file =
    resumeFileInput.files?.[0];

  if (!file) {
    if (resumeMessage) {
      resumeMessage.textContent =
        "Please choose your resume first.";
    }
    return;
  }


  /* File type validation */

  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];

  const allowedExtensions = [
    ".pdf",
    ".doc",
    ".docx"
  ];

  const fileName =
    file.name.toLowerCase();

  const hasValidExtension =
    allowedExtensions.some(
      extension =>
        fileName.endsWith(extension)
    );

  if (
    !allowedTypes.includes(file.type) &&
    !hasValidExtension
  ) {

    if (resumeMessage) {
      resumeMessage.textContent =
        "Please upload a PDF, DOC or DOCX resume.";
    }

    return;
  }


  /* File size validation */

  const maxSize =
    10 * 1024 * 1024;

  if (file.size > maxSize) {

    if (resumeMessage) {
      resumeMessage.textContent =
        "Resume is too large. Please upload a file smaller than 10 MB.";
    }

    return;
  }

  if (file.size === 0) {

    if (resumeMessage) {
      resumeMessage.textContent =
        "The selected resume file is empty.";
    }

    return;
  }


  if (uploadResumeBtn) {
    uploadResumeBtn.disabled = true;
    uploadResumeBtn.textContent =
      "Uploading...";
  }

  if (resumeMessage) {
    resumeMessage.textContent =
      "Uploading your resume...";
  }


  try {

    /* Safe file name */

    const safeFileName =
      file.name
        .replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );

    const filePath =
      `${currentUser.id}/${Date.now()}_${safeFileName}`;


    /* Upload to private bucket */

    const {
      error: uploadError
    } =
      await db.storage
        .from("student-resumes")
        .upload(
          filePath,
          file,
          {
            contentType:
              file.type ||
              "application/octet-stream",
            upsert: false
          }
        );


    if (uploadError) {
      throw uploadError;
    }


    /* Save resume record */

    const {
      error: resumeError
    } =
      await db
        .from("student_resumes")
        .insert({
          user_id:
            currentUser.id,
          file_name:
            file.name,
          file_path:
            filePath,
          status:
            "uploaded"
        });


    if (resumeError) {

      /* Remove uploaded file if DB save fails */

      await db.storage
        .from("student-resumes")
        .remove([
          filePath
        ]);

      throw resumeError;
    }


    if (resumeStatus) {
      resumeStatus.textContent =
        "Uploaded";
    }
    if (viewResumeBtn) {
      viewResumeBtn.disabled = false;
    }
    if (analyzeResumeBtn) {
      analyzeResumeBtn.disabled = false;
    }

    /*
     * A newly uploaded resume supersedes the previous analysis snapshot.
     * Reloading intelligence ensures stale skills are not shown as if
     * they were extracted from this newly uploaded file.
     */
    await loadResumeIntelligence();

    if (resumeMessage) {
      resumeMessage.textContent =
        "✓ Resume uploaded successfully.";
    }

    resumeFileInput.value = "";


  } catch (error) {

    console.error(
      "Resume upload error:",
      error
    );

    if (resumeMessage) {
      resumeMessage.textContent =
        "Resume upload failed. Please try again.";
    }

  } finally {

    if (uploadResumeBtn) {
      uploadResumeBtn.disabled = false;
      uploadResumeBtn.textContent =
        "Upload Resume";
    }



    

  }

}
/* =====================================================
   VIEW RESUME
===================================================== */

async function viewStudentResume() {

  if (!currentUser) {

    if (resumeMessage) {
      resumeMessage.textContent =
        "Please wait for your profile to finish loading.";
    }

    return;
  }

  try {

    const {
      data: resume,
      error
    } = await db
      .from("student_resumes")
      .select(
        "file_name,file_path,uploaded_at"
      )
      .eq(
        "user_id",
        currentUser.id
      )
      .order(
        "uploaded_at",
        { ascending: false }
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!resume?.file_path) {

      if (resumeMessage) {
        resumeMessage.textContent =
          "No resume uploaded yet.";
      }

      return;
    }

    const {
      data: signedData,
      error: signedError
    } = await db.storage
      .from("student-resumes")
      .createSignedUrl(
        resume.file_path,
        300
      );

    if (signedError) {
      throw signedError;
    }

    if (!signedData?.signedUrl) {
      throw new Error(
        "Could not create resume preview URL."
      );
    }

    window.open(
      signedData.signedUrl,
      "_blank",
      "noopener,noreferrer"
    );

  } catch (error) {

    console.error(
      "View resume error:",
      error
    );

    if (resumeMessage) {
      resumeMessage.textContent =
        "Unable to open your resume. Please try again.";
    }

  }

}
  /* =====================================================
   ANALYZE RESUME
===================================================== */
/* =====================================================
   ALDOVRA — RESUME ANALYSIS LOADING MODAL
===================================================== */

function showResumeAnalysisLoading(){

  const modal =
    document.getElementById(
      "resumeAnalysisLoadingModal"
    );

  if(!modal) return;

  const icon =
    modal.querySelector(
      ".aldovra-analysis-icon"
    );

  const title =
    modal.querySelector("h3");

  const description =
    modal.querySelector("p");

  const processingText =
    modal.querySelector(
      ".aldovra-analysis-spinner"
    )?.nextElementSibling;

  modal.classList.remove(
    "aldovra-analysis-success"
  );

  if(icon){
    icon.textContent = "🧠";
  }

  if(title){
    title.textContent =
      "Analyzing your resume";
  }

  if(description){
    description.textContent =
      "Aldovra AI is reviewing your resume and identifying your skills, experience and relevant career areas.";
  }

  if(processingText){
    processingText.innerHTML =
      "<span>●</span>" +
      "<span>Processing your resume...</span>";
  }

  modal.style.display = "flex";
}


function hideResumeAnalysisLoading(){

  const modal =
    document.getElementById(
      "resumeAnalysisLoadingModal"
    );

  if(!modal) return;

  modal.style.display = "none";

  modal.classList.remove(
    "aldovra-analysis-success"
  );
}


async function showResumeAnalysisSuccess(){

  const modal =
    document.getElementById(
      "resumeAnalysisLoadingModal"
    );

  if(!modal) return;

  const icon =
    modal.querySelector(
      ".aldovra-analysis-icon"
    );

  const title =
    modal.querySelector("h3");

  const description =
    modal.querySelector("p");

  const processingText =
    modal.querySelector(
      ".aldovra-analysis-spinner"
    )?.nextElementSibling;

  modal.classList.add(
    "aldovra-analysis-success"
  );

  if(icon){
    icon.textContent = "✓";
  }

  if(title){
    title.textContent =
      "Resume analysis completed";
  }

  if(description){
    description.textContent =
      "Your skills have been identified successfully.";
  }

  if(processingText){
    processingText.innerHTML =
      "<span style=\"color:#16a34a;\">✓</span>" +
      "<span style=\"color:#16a34a;\">Analysis complete</span>";
  }

  await new Promise(resolve =>
    setTimeout(resolve, 1200)
  );

  hideResumeAnalysisLoading();
}
async function analyzeStudentResume() {

  if (!currentUser) {

    if (resumeMessage) {
      resumeMessage.textContent =
        "Please wait for your profile to finish loading.";
    }

    return;
  }

  if (analyzeResumeBtn) {
    analyzeResumeBtn.disabled = true;
    analyzeResumeBtn.textContent =
      "Analyzing...";
  }

  if (resumeMessage) {
    resumeMessage.textContent =
      "AI is analyzing your resume. Please wait...";
  }
  /* =====================================================
   SHOW RESUME ANALYSIS LOADING
===================================================== */

showResumeAnalysisLoading();

  try {

    const {
      data: resume,
      error: resumeError
    } = await db
      .from("student_resumes")
      .select(
        "id,file_name,status"
      )
      .eq(
        "user_id",
        currentUser.id
      )
      .order(
        "uploaded_at",
        {
          ascending: false
        }
      )
      .limit(1)
      .maybeSingle();

    if (resumeError) {
      throw resumeError;
    }

    if (!resume) {
      throw new Error(
        "No resume found. Please upload a resume first."
      );
    }

    const fileName =
      String(
        resume.file_name || ""
      ).toLowerCase();

    if (!fileName.endsWith(".pdf")) {
      throw new Error(
        "AI resume analysis currently supports PDF resumes. DOC/DOCX support will be added next."
      );
    }

    const {
      data,
      error
    } = await db.functions.invoke(
      "analyze-resume",
      {
        body: {
          resume_id:
            resume.id
        }
      }
    );

    if (error) {
      throw error;
    }

    if (
      !data ||
      !data.success
    ) {
      throw new Error(
        data?.error ||
        "Resume analysis failed."
      );
    }

    if (resumeStatus) {
      resumeStatus.textContent =
        "Analyzed";
    }
await loadResumeIntelligence();
try { await loadSkills(); } catch (skillsReloadError) { console.error(skillsReloadError); }
    if (resumeMessage) {
      resumeMessage.textContent =
        data?.parsed_data?.analysis_mode === "keyword_fallback"
          ? "✓ Resume read. Your skills are detected; detailed AI insights will be added automatically in a few minutes."
          : "✓ Resume analyzed successfully by AI.";
    }
    /* =====================================================
   SHOW ANALYSIS SUCCESS
===================================================== */

await showResumeAnalysisSuccess();
    /* =====================================================
   ONBOARDING — RESUME → REQUIRED ASSESSMENTS
===================================================== */

try {

  await loadAssessmentRequests();
  renderRecommendedAssessments();
  /* =====================================================
   ONBOARDING — ASSESSMENTS NEXT STEP
===================================================== */

if (
  window.__aldovraOnboardingProfileStep === true
) {

  const assessmentsSection =
    document.getElementById(
      "recommendedAssessmentsList"
    );

  if (assessmentsSection) {

    setTimeout(() => {

      assessmentsSection.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      assessmentsSection.classList.add(
        "aldovra-assessments-next-step"
      );

      setTimeout(() => {

        assessmentsSection.classList.remove(
          "aldovra-assessments-next-step"
        );

      }, 3500);

    }, 700);

  }

}

} catch (error) {

  console.error(
    "Failed to refresh assessment requests:",
    error
  );

}
    /* =====================================================
   ONBOARDING — SHOW REQUIRED ASSESSMENTS
===================================================== */

if (
  window.__aldovraOnboardingProfileStep === true
) {

  setTimeout(() => {

    const assessmentList =
      document.querySelector(
        "#recommendedAssessmentsList"
      );

    if (!assessmentList) return;

    assessmentList.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    assessmentList.classList.add(
      "aldovra-assessments-next-step"
    );

    setTimeout(() => {

      assessmentList.classList.remove(
        "aldovra-assessments-next-step"
      );

    }, 3500);

  }, 500);

}
    /* =====================================================
   ONBOARDING — RESUME ANALYZED → ASSESSMENTS
===================================================== */

if (
  window.__aldovraOnboardingProfileStep &&
  window.__aldovraOnboardingProfileStep === true
) {

  const intelligenceSection =
    document.querySelector(
      "#profileDetailsModal .resume-intelligence"
    );

  if (intelligenceSection) {

    setTimeout(() => {

      intelligenceSection.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      intelligenceSection.classList.add(
        "aldovra-analysis-complete"
      );

      setTimeout(() => {

        intelligenceSection.classList.remove(
          "aldovra-analysis-complete"
        );

      }, 3500);

    }, 500);

  }

}

  } catch (error) {

    console.error(
      "Resume analysis error:",
      error
    );

    if (resumeMessage) {
      resumeMessage.textContent =
        error?.message ||
        "Resume analysis failed. Please try again.";
    }
/* =====================================================
   HIDE ANALYSIS LOADING ON ERROR
===================================================== */

hideResumeAnalysisLoading();
  } finally {

    if (analyzeResumeBtn) {
      analyzeResumeBtn.disabled = false;
      analyzeResumeBtn.textContent =
        "Analyze Resume";
    }

  }

}
  /* =====================================================
   RESUME INTELLIGENCE
===================================================== */

function renderResumeIntelligence(parsedData) {

  if (
    !resumeIntelligenceGrid ||
    !resumeIntelligenceEmpty
  ) {
    return;
  }

  if (
    !parsedData ||
    typeof parsedData !== "object"
  ) {
    resumeIntelligenceGrid.innerHTML = "";
    resumeIntelligenceGrid.style.display =
      "none";

    resumeIntelligenceEmpty.textContent =
      "Analyze your resume to generate your Resume Intelligence.";

    resumeIntelligenceEmpty.style.display =
      "block";

    return;
  }

  const sections = [
    {
      title: "Skills",
      key: "skills"
    },
    {
      title: "Programming Languages",
      key: "programming_languages"
    },
    {
      title: "Technologies & Tools",
      key: "technologies_tools"
    },
    {
      title: "Projects",
      key: "projects"
    },
    {
      title: "Experience",
      key: "experience"
    },
    {
      title: "Education",
      key: "education"
    },
    {
      title: "Certifications",
      key: "certifications"
    },
    {
      title: "Technical Areas",
      key: "technical_areas"
    },
    {
      title: "Career Keywords",
      key: "career_keywords"
    }
  ];

  const cards = [];

  sections.forEach(section => {

    const value =
      Array.isArray(
        parsedData[section.key]
      )
        ? parsedData[section.key]
        : [];

    if (!value.length) {
      return;
    }

    const items =
      value
        .map(item => {

          if (
            typeof item === "string"
          ) {
            return item;
          }

         if (
  item &&
  typeof item === "object"
) {

  return Object.entries(item)
    .filter(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        value !== ""
    )
    .map(
      ([key, value]) =>
        `${key
          .replace(/_/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase())
        }: ${value}`
    )
    .join(" • ");

}

          return String(item);
        })
        .filter(Boolean);

    if (!items.length) {
      return;
    }

    cards.push(`
      <div class="resume-intelligence-card">

        <div class="resume-intelligence-card-title">
          ${section.title}
        </div>

        <div class="resume-intelligence-list">

          ${items.map(item => `
          <span class="resume-intelligence-chip">
  ${escapeHtml(String(item))}
</span>
          `).join("")}

        </div>

      </div>
    `);

  });

  if (!cards.length) {

    resumeIntelligenceGrid.innerHTML = "";
    resumeIntelligenceGrid.style.display =
      "none";

    resumeIntelligenceEmpty.textContent =
      "No structured resume information was extracted.";

    resumeIntelligenceEmpty.style.display =
      "block";

    return;
  }

  resumeIntelligenceGrid.innerHTML =
    cards.join("");

  resumeIntelligenceGrid.style.display =
    "grid";

  resumeIntelligenceEmpty.style.display =
    "none";
}


async function loadResumeIntelligence() {

  if (!currentUser) {
    return;
  }

  try {

    const {
      data: resume,
      error
    } = await db
      .from("student_resumes")
      .select(
        "parsed_data,status"
      )
      .eq(
        "user_id",
        currentUser.id
      )
      .order(
        "uploaded_at",
        {
          ascending: false
        }
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const resumeCompletionStatus =
      document.getElementById(
        "profileResumeCompletionStatus"
      );

    if (
      resume?.status === "analyzed" &&
      resume?.parsed_data
    ) {

      renderResumeIntelligence(
        resume.parsed_data
      );

      if (resumeCompletionStatus) {
        resumeCompletionStatus.textContent =
          "Resume Intelligence: Analyzed";
      }

    } else {

      renderResumeIntelligence(null);

      if (resumeCompletionStatus) {
        resumeCompletionStatus.textContent =
          "Resume Intelligence: Not analyzed";
      }

    }

  } catch (error) {

    console.error(
      "Resume intelligence error:",
      error
    );

    renderResumeIntelligence(null);

    const resumeCompletionStatus =
      document.getElementById(
        "profileResumeCompletionStatus"
      );

    if (resumeCompletionStatus) {
      resumeCompletionStatus.textContent =
        "Resume Intelligence: Unable to load";
    }

  }

}
/* =====================================================
   LOAD RESUME STATUS
===================================================== */

async function loadResumeStatus() {

  if (!currentUser) {
    return;
  }

  try {

    const {
      data: resume,
      error
    } = await db
      .from("student_resumes")
      .select(
        "id,file_name,file_path,uploaded_at,status"
      )
      .eq(
        "user_id",
        currentUser.id
      )
      .order(
        "uploaded_at",
        { ascending: false }
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (resume?.file_path) {

      const isAnalyzed = resume.status === "analyzed";

      if (resumeStatus) {
        resumeStatus.textContent =
          isAnalyzed ? "Analyzed" : "Uploaded";
      }

      if (viewResumeBtn) {
        viewResumeBtn.disabled = false;
      }

      /*
       * Restore the Analyze button after refresh when a resume exists.
       * It remains available for a new upload that has not been analyzed.
       */
      if (analyzeResumeBtn) {
        analyzeResumeBtn.disabled = false;
      }

    } else {

      if (resumeStatus) {
        resumeStatus.textContent =
          "Not uploaded";
      }

      if (viewResumeBtn) {
        viewResumeBtn.disabled = true;
      }

      if (analyzeResumeBtn) {
        analyzeResumeBtn.disabled = true;
      }

    }

    } catch (error) {

    console.error(
      "Resume status error:",
      error
    );

    if (resumeStatus) {
      resumeStatus.textContent =
        "Unable to load";
    }

    if (viewResumeBtn) {
      viewResumeBtn.disabled = true;
    }

  }

}
if (uploadResumeBtn) {

  uploadResumeBtn.addEventListener(
    "click",
    (event) => {

      if (window.__aldovraPreviewMode) {
        aldovraPreviewGuard(event);
        return;
      }

      uploadStudentResume();

    }
  );

}
 if (viewResumeBtn) {

  viewResumeBtn.addEventListener(
    "click",
    (event) => {

      if (window.__aldovraPreviewMode) {
        aldovraPreviewGuard(event);
        return;
      }

      viewStudentResume();

    }
  );

}
if (analyzeResumeBtn) {

  analyzeResumeBtn.addEventListener(
    "click",
    (event) => {

      if (window.__aldovraPreviewMode) {
        aldovraPreviewGuard(event);
        return;
      }

      analyzeStudentResume();

    }
  );

}
/* =====================================================
   MOBILE SIDEBAR
===================================================== */

const mobileSidebarBtn =
  document.getElementById("mobileSidebarBtn");

const sidebar =
  document.querySelector(".sidebar");

if (mobileSidebarBtn && sidebar) {

  mobileSidebarBtn.addEventListener("click", () => {

    sidebar.classList.toggle("mobile-open");

  });

}
  document
    .getElementById("logoutBtn")
    .addEventListener("click", async () => {

      await db.auth.signOut();

      window.location.href =
        "/login.html";

    });
/* =====================================================
   OVERVIEW ACTION BUTTONS
===================================================== */

const overviewActionButtons =
  document.querySelectorAll(
    "[data-open-section]"
  );

overviewActionButtons.forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        const section =
          button.dataset.openSection;

        if(
          section ===
          "assessments"
        ){

          document
            .getElementById(
              "assessmentsSection"
            )
            ?.scrollIntoView({
              behavior:"smooth"
            });

        }

      }
    );

  }
);

  /* =====================================================
     SIDEBAR NAVIGATION
  ====================================================== */

  const navItems =
    document.querySelectorAll(
      ".nav-item[data-section]"
    );


  navItems.forEach(item => {

    item.addEventListener("click", () => {

      // Clear all sidebar items, including Jobs (which has no data-section),
      // so two blue selections can never remain after switching sections.
      document.querySelectorAll(".sidebar .nav-item").forEach(nav => {
        nav.classList.remove("active");
      });

      item.classList.add("active");
      const sidebar =
  document.querySelector(".sidebar");

if (sidebar) {
  sidebar.classList.remove("mobile-open");
}


      const section =
        item.dataset.section;


      if (section === "overview") {

        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });

      }


      if (section === "skills") {

        document
          .getElementById("skillsSection")
          .scrollIntoView({
            behavior: "smooth"
          });

      }


      if (section === "assessments") {

        document
          .getElementById("assessmentsSection")
          .scrollIntoView({
            behavior: "smooth"
          });

      }


      if (section === "screening") {

        document
          .getElementById("screeningCallsSection")
          .scrollIntoView({
            behavior: "smooth"
          });

      }


      if (section === "tracks") {

        document
          .getElementById("tracksSection")
          .scrollIntoView({
            behavior: "smooth"
          });

      }
if (section === "explore") {

  document
    .getElementById("exploreSection")
    ?.scrollIntoView({
      behavior: "smooth"
    });

}

      if (section === "profile") {

        openProfileModal();

      }

      if (section === "premium-verified") {
        document.getElementById("premiumVerifiedSection")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }

    });

  });

  /* Keep the sidebar selection synchronized with the section currently
     occupying the dashboard viewport, including when the user scrolls manually. */
  (function initDashboardScrollSpy() {
    const sectionByNav = {
      skills: "skillsSection",
      assessments: "assessmentsSection",
      screening: "screeningCallsSection",
      tracks: "tracksSection",
      explore: "exploreSection",
      "premium-verified": "premiumVerifiedSection",
      jobs: "aldovraJobsSection"
    };
    const navBySection = new Map();
    Object.entries(sectionByNav).forEach(([key, id]) => {
      const nav = document.querySelector(
        key === "jobs"
          ? ".sidebar .nav-item[data-ald-jobs-nav]"
          : '.sidebar .nav-item[data-section="' + key + '"]'
      );
      const section = document.getElementById(id);
      // Ignore dashboard panels intentionally hidden by the current student layout.
      // Hidden sections have a top of 0 and can incorrectly steal the active highlight.
      if (nav && section && section.getClientRects().length > 0) {
        navBySection.set(section, nav);
      }
    });

    let scheduled = false;
    function syncActiveNav() {
      scheduled = false;

      // Profile is a modal, not a scroll section. Preserve its selection while open.
      const profileModal = document.getElementById("profileDetailsModal");
      if (profileModal?.classList.contains("show")) {
        const profileNav = document.querySelector('.sidebar .nav-item[data-section="profile"]');
        if (profileNav) {
          document.querySelectorAll(".sidebar .nav-item").forEach(item => {
            item.classList.toggle("active", item === profileNav);
          });
        }
        return;
      }

      const marker = window.scrollY + Math.min(150, window.innerHeight * 0.22);
      let activeNav = document.querySelector('.sidebar .nav-item[data-section="overview"]');
      let latestTop = -Infinity;

      navBySection.forEach((nav, section) => {
        const top = section.getBoundingClientRect().top + window.scrollY;
        if (top <= marker && top >= latestTop) {
          latestTop = top;
          activeNav = nav;
        }
      });

      // At the very top, Overview remains selected until another dashboard
      // section reaches the reading position.
      document.querySelectorAll(".sidebar .nav-item").forEach(item => {
        item.classList.toggle("active", item === activeNav);
      });
    }

    function requestSync() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(syncActiveNav);
    }

    window.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", requestSync);
    window.addEventListener("load", requestSync, { once: true });
    // Let modal close handlers restore the active section without waiting for scroll.
    window.__aldovraSyncDashboardSidebar = requestSync;
    requestSync();
  })();


  /* =====================================================
     OPTIONAL SKILL CHART
     Kept safe in case a chart canvas is added later.
  ====================================================== */

  const chartCanvas =
    document.getElementById("skillsChart");

  let skillsChart = null;

  function createChart() {
    if (!chartCanvas || typeof Chart === "undefined") {
      return;
    }

    if (skillsChart) {
      skillsChart.destroy();
    }

    const dark =
      document.body.classList.contains("dark");

    skillsChart =
      new Chart(
        chartCanvas.getContext("2d"),
        {
          type: "doughnut",
          data: {
            labels: [
              "Python",
              "SQL",
              "Data Analytics",
              "Statistics"
            ],
            datasets: [
              {
                data: [91, 86, 81, 74],
                borderWidth: 0,
                spacing: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            plugins: {
              legend: {
                position: "bottom",
                labels: {
                  color:
                    dark
                      ? "#f6f3fa"
                      : "#17131f",
                  usePointStyle: true,
                  padding: 18,
                  font: {
                    size: 11
                  }
                }
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return (
                      " " +
                      context.label +
                      ": " +
                      context.raw +
                      "%"
                    );
                  }
                }
              }
            }
          }
        }
      );
  }

  function updateChartTheme() {
    if (chartCanvas) {
      createChart();
    }
  }

  if (chartCanvas) {
    createChart();
  }
