/* ========================================================
   DYNAMIC SUBJECT PERFORMANCE VISUAL
======================================================== */
(function () {
  const palette = [
    "#6d28d9",
    "#4f46e5",
    "#16a34a",
    "#ea580c",
    "#dc2626",
    "#0891b2",
    "#7c3aed",
    "#ca8a04",
    "#db2777",
    "#475569",
  ];
  function renderPerformanceVisual() {
    const donut = document.getElementById("performanceDonut");
    const legend = document.getElementById("performanceLegend");
    const overall = document.getElementById("overallScore");
    const overallCenter = document.getElementById("performanceScoreCenter");
    if (!donut || !legend) {
      return;
    }

    /*
    ========================================================
    BUILD UNIQUE COMPLETED ASSESSMENT RESULTS

    If the same assessment/request has multiple attempts,
    keep the BEST completed score.

    This prevents a later failed reattempt from
    reducing the student's previous performance.
  ========================================================
  */
    const assignedRequests = Array.isArray(assessmentRequests)
      ? assessmentRequests.filter((request) => request && request.id && request.assessment_id)
      : [];
    const requestForReport = (report) => {
      if (report.request_id) {
        return assignedRequests.find((request) => String(request.id) === String(report.request_id)) || null;
      }
      const linkedAttempt = attempts.find(
        (item) =>
          (report.attempt_id && String(item.id) === String(report.attempt_id)) ||
          (report.session_id && String(item.session_id || "") === String(report.session_id)),
      );
      return linkedAttempt
        ? assignedRequests.find((request) => String(request.id) === String(linkedAttempt.request_id || "")) ||
            null
        : null;
    };
    const bestReports = new Map();
    reports
      .filter(
        (report) =>
          report &&
          requestForReport(report) &&
          report.evaluation_status === "completed" &&
          Number.isFinite(Number(report.percentage)),
      )
      .forEach((report) => {
        const linkedRequest = requestForReport(report);
        const key = linkedRequest ? String(linkedRequest.id) : String(report.id);
        const score = Number(report.percentage);
        const existing = bestReports.get(key);
        if (!existing || score > Number(existing.percentage)) {
          bestReports.set(key, report);
        }
      });
    const completedReports = [...bestReports.values()];

    /*
    ========================================================
    NO COMPLETED RESULTS
  ========================================================
  */
    if (!completedReports.length) {
      donut.style.background = "conic-gradient(var(--border) 0deg 360deg)";
      if (overall) {
        overall.textContent = "—";
      }
      if (overallCenter) {
        overallCenter.textContent = "—";
      }
      legend.innerHTML = `
      <div class="performance-empty">
        <div class="performance-empty-icon">
          📊
        </div>

        <div>
          <strong>
            Your performance will appear here
          </strong>

          <span>
            Complete an assessment to unlock
            detailed performance insights.
          </span>
        </div>
      </div>
    `;
      return;
    }

    /*
    ========================================================
    OVERALL PERFORMANCE

    Average of the BEST score from each unique
    completed assessment.
  ========================================================
  */
    const totalScore = completedReports.reduce((sum, report) => sum + Number(report.percentage), 0);
    const overallScore = totalScore / completedReports.length;
    if (overall) {
      overall.textContent = Math.round(overallScore) + "%";
    }
    if (overallCenter) {
      overallCenter.textContent = Math.round(overallScore) + "%";
    }

    /*
    ========================================================
    SUBJECT / CATEGORY PERFORMANCE

    Show only the exams assigned to this student.
  ========================================================
  */
    const categoryEntries = completedReports.map((report) => {
      const request = requestForReport(report);
      return [
        request?.assessment_name || report.assessment_name || report.skill_name || "Assigned Assessment",
        Number(report.percentage),
      ];
    });

    /*
    ========================================================
    DONUT
  ========================================================
  */
    if (!categoryEntries.length) {
      donut.style.background = "conic-gradient(var(--primary) 0deg 360deg)";
      legend.innerHTML = `
      <div class="performance-empty">
        <div class="performance-empty-icon">
          📊
        </div>

        <div>
          <strong>
            Overall performance available
          </strong>

          <span>
            Subject-wise scores are not available
            for these results.
          </span>
        </div>
      </div>
    `;
      return;
    }
    const totalCategoryScore =
      categoryEntries.reduce((sum, [, value]) => sum + Math.max(0, Number(value)), 0) || 1;
    let angle = 0;
    const stops = [];
    categoryEntries.forEach(([name, value], index) => {
      const score = Math.max(0, Number(value));
      const span = (score / totalCategoryScore) * 360;
      const start = angle;
      angle += span;
      stops.push(`${palette[index % palette.length]} ${start}deg ${angle}deg`);
    });
    donut.style.background = `conic-gradient(${stops.join(",")})`;

    /*
    ========================================================
    CATEGORY LEGEND
  ========================================================
  */
    legend.innerHTML = categoryEntries
      .map(
        ([name, value], index) => `

          <div class="legend-row">

            <div class="legend-left">

              <span
                class="legend-dot"
                style="
                  background:
                  ${palette[index % palette.length]}
                "
              ></span>

              <span>
                ${escapeHtml(String(name))}
              </span>

            </div>

            <strong>
              ${Number(value).toFixed(1).replace(/\.0$/, "")}%
            </strong>

          </div>

        `,
      )
      .join("");
  }
  window.renderPerformanceVisual = renderPerformanceVisual;

  /* =====================================================
     PROFILE PHOTO PREVIEW
  ====================================================== */
  const profilePhotoInput = document.getElementById("profilePhotoInput");
  const profilePhotoImage = document.getElementById("profilePhotoImage");
  const profilePhotoInitial = document.getElementById("profilePhotoInitial");
  let pendingProfilePhoto = null;
  if (profilePhotoInput) {
    profilePhotoInput.addEventListener(
      "click",
      (event) => {
        if (window.__aldovraPreviewMode) {
          aldovraPreviewGuard(event);
        }
      },
      true,
    );
  }
  if (profilePhotoInput) {
    profilePhotoInput.addEventListener("change", () => {
      const file = profilePhotoInput.files?.[0];
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        profileMessage.textContent = "Please choose a JPG, PNG or WEBP image.";
        profilePhotoInput.value = "";
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        profileMessage.textContent = "Profile photo must be 5 MB or smaller.";
        profilePhotoInput.value = "";
        return;
      }
      pendingProfilePhoto = file;
      const reader = new FileReader();
      reader.onload = (event) => {
        if (profilePhotoImage) {
          profilePhotoImage.src = event.target.result;
          profilePhotoImage.style.display = "block";
        }
        if (profilePhotoInitial) {
          profilePhotoInitial.style.display = "none";
        }
      };
      reader.readAsDataURL(file);
      if (!profileEditing) {
        takeProfileSnapshot();
        setProfileEditing(true);
      }
      if (profileMessage) {
        profileMessage.textContent = "Photo selected. Click Save Profile to continue.";
      }
    });
  }

  /* =====================================================
     PROFILE PHOTO PERSISTENCE
  ====================================================== */
  async function loadProfilePhoto() {
    if (!currentUser) return;
    const folder = `${currentUser.id}/`;
    const { data, error } = await db.storage.from("profile-avatars").list(folder, {
      limit: 20,
      sortBy: { column: "updated_at", order: "desc" },
    });
    if (error) {
      console.warn("Profile photo load warning:", error.message);
      return;
    }
    const photo = (data || []).find((file) => /\.(jpg|jpeg|png|webp)$/i.test(file.name));
    if (!photo) return;
    const path = `${folder}${photo.name}`;
    const { data: signed, error: signedError } = await db.storage
      .from("profile-avatars")
      .createSignedUrl(path, 60 * 60);
    if (signedError || !signed?.signedUrl) {
      console.warn("Profile photo URL warning:", signedError?.message || "Could not create signed URL");
      return;
    }
    window.__aldovraProfilePhotoUrl = signed.signedUrl;
    applyProfilePhoto(signed.signedUrl);
  }
  async function uploadProfilePhoto() {
    if (!currentUser || !pendingProfilePhoto) {
      return { ok: true };
    }
    const file = pendingProfilePhoto;
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${currentUser.id}/avatar.${extension}`;
    const { error } = await db.storage.from("profile-avatars").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });
    if (error) {
      console.error("Profile photo upload error:", error);
      return { ok: false, message: error.message };
    }
    window.__aldovraProfilePhotoUrl = null;
    await loadProfilePhoto();
    return { ok: true };
  }
  window.loadProfilePhoto = loadProfilePhoto;
  window.uploadProfilePhoto = uploadProfilePhoto;

  /* =====================================================
     PROFILE MODAL / EDIT MODE
  ====================================================== */
  const profileModal = document.getElementById("profileDetailsModal");
  const editProfileBtn = document.getElementById("editProfileBtn");
  const cancelProfileEditBtn = document.getElementById("cancelProfileEditBtn");
  const profileFields = [
    profileName,
    profileCity,
    profileCollege,
    profileDegree,
    profileGraduationYear,
    profileBio,
    profileGithub,
    profileLinkedin,
  ];
  const targetCareerField = document.getElementById("targetCareer");
  let profileEditing = false;
  let profileSnapshot = null;
  /* =====================================================
   8B — LOAD PROFILE RESUME SNAPSHOT
===================================================== */
  async function loadProfileResumeSnapshot() {
    const grid = document.getElementById("profileResumeSnapshotGrid");
    const emptyState = document.getElementById("profileResumeSnapshotEmpty");
    const sourceBadge = document.getElementById("profileResumeSourceBadge");
    if (!grid || !emptyState) {
      return;
    }
    grid.innerHTML = "";
    emptyState.style.display = "none";
    if (sourceBadge) {
      sourceBadge.textContent = "Resume";
    }
    if (!currentUser) {
      emptyState.textContent = "Resume information is unavailable right now.";
      emptyState.style.display = "block";
      return;
    }
    try {
      const { data: resume, error } = await db
        .from("student_resumes")
        .select("parsed_data,status")
        .eq("user_id", currentUser.id)
        .order("uploaded_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (resume?.status !== "analyzed" || !resume?.parsed_data || typeof resume.parsed_data !== "object") {
        emptyState.textContent = "Analyze your resume to show additional profile information here.";
        emptyState.style.display = "block";
        return;
      }
      const parsedData = resume.parsed_data;
      const sections = [
        {
          title: "Education",
          key: "education",
        },
        {
          title: "Experience",
          key: "experience",
        },
        {
          title: "Projects",
          key: "projects",
        },
        {
          title: "Certifications",
          key: "certifications",
        },
      ];
      const cards = [];
      sections.forEach((section) => {
        const value = Array.isArray(parsedData[section.key]) ? parsedData[section.key] : [];
        if (!value.length) {
          return;
        }
        const items = value
          .map((item) => {
            if (typeof item === "string") {
              return item;
            }
            if (item && typeof item === "object") {
              return Object.entries(item)
                .filter(([key, value]) => value !== null && value !== undefined && value !== "")
                .map(
                  ([key, value]) =>
                    `${key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}: ${value}`,
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
        <div class="profile-resume-snapshot-card">

          <div class="profile-resume-snapshot-card-title">
            ${escapeHtml(section.title)}
          </div>

          <div class="profile-resume-snapshot-list">

            ${items
              .map(
                (item) => `
                  <span class="profile-resume-snapshot-item">
                    ${escapeHtml(String(item))}
                  </span>
                `,
              )
              .join("")}

          </div>

        </div>
      `);
      });
      if (!cards.length) {
        emptyState.textContent = "No additional structured information was extracted from your resume.";
        emptyState.style.display = "block";
        return;
      }
      grid.innerHTML = cards.join("");
    } catch (error) {
      console.error("Profile resume snapshot error:", error);
      emptyState.textContent = "Unable to load resume information right now.";
      emptyState.style.display = "block";
    }
  }
  function openProfileModal() {
    if (!profileModal) return;

    // Clear any legacy inline display override before showing the profile dialog.
    profileModal.style.removeProperty("display");
    profileModal.classList.add("show");
    profileModal.setAttribute("aria-hidden", "false");
    const backToPreviewBtn = document.getElementById("backToPreviewBtn");
    if (backToPreviewBtn) {
      const completion = updateProfileCompletion();
      backToPreviewBtn.style.display =
        completion < 100 && (window.__aldovraPreviewMode || window.__aldovraOnboardingProfileStep)
          ? "inline-flex"
          : "none";
    }
    setProfileEditing(profileEditing);
    loadProfileResumeSnapshot();
    window.loadProfilePhoto?.();
  }

  /* =====================================================
   BACK TO PREVIEW FROM PROFILE
====================================================== */
  const backToPreviewBtn = document.getElementById("backToPreviewBtn");
  if (backToPreviewBtn) {
    backToPreviewBtn.addEventListener("click", (event) => {
      if (!window.__aldovraPreviewMode && !window.__aldovraOnboardingProfileStep) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeProfileModal();
      window.__aldovraOnboardingProfileStep = false;
      window.__aldovraPreviewMode = true;
      document.body.classList.add("aldovra-preview-mode");
      const previewBanner = document.getElementById("aldovraPreviewBanner");
      if (previewBanner) {
        previewBanner.style.display = "block";
      }
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }
  function closeProfileModal() {
    if (!profileModal) return;
    profileModal.style.removeProperty("display");
    profileModal.classList.remove("show");
    profileModal.setAttribute("aria-hidden", "true");
    setProfileEditing(false);
    // Profile is a modal, not a page section; restore the active scroll section.
    window.__aldovraSyncDashboardSidebar?.();
  }
  function setProfileEditing(enabled) {
    profileEditing = enabled;
    profileFields.forEach((field) => {
      if (field) field.readOnly = !enabled;
    });
    if (targetCareerField) {
      targetCareerField.disabled = !enabled;
    }
    if (editProfileBtn) {
      editProfileBtn.style.display = enabled ? "none" : "inline-flex";
    }
    if (cancelProfileEditBtn) {
      cancelProfileEditBtn.style.display = enabled ? "inline-flex" : "none";
    }
    const saveButton = document.getElementById("saveProfileBtn");
    if (saveButton) {
      saveButton.style.display = enabled ? "inline-flex" : "none";
    }
    if (profileMessage && !enabled) {
      profileMessage.textContent = "";
    }
  }
  function takeProfileSnapshot() {
    profileSnapshot = {
      name: profileName?.value || "",
      city: profileCity?.value || "",
      college: profileCollege?.value || "",
      degree: profileDegree?.value || "",
      graduationYear: profileGraduationYear?.value || "",
      bio: profileBio?.value || "",
      github: profileGithub?.value || "",
      linkedin: profileLinkedin?.value || "",
      career: targetCareerField?.value || "",
    };
  }
  function restoreProfileSnapshot() {
    if (!profileSnapshot) return;
    if (profileName) profileName.value = profileSnapshot.name;
    if (profileCity) profileCity.value = profileSnapshot.city;
    if (profileCollege) profileCollege.value = profileSnapshot.college;
    if (profileDegree) profileDegree.value = profileSnapshot.degree;
    if (profileGraduationYear) profileGraduationYear.value = profileSnapshot.graduationYear;
    if (profileBio) profileBio.value = profileSnapshot.bio;
    if (profileGithub) profileGithub.value = profileSnapshot.github;
    if (profileLinkedin) profileLinkedin.value = profileSnapshot.linkedin;
    if (targetCareerField) targetCareerField.value = profileSnapshot.career;
    updateProfileCompletion();
    updateProfileDisplay();
  }
  function applyProfilePhoto(url) {
    const modalImage = document.getElementById("profilePhotoImage");
    const modalInitial = document.getElementById("profilePhotoInitial");
    if (url) {
      if (modalImage) {
        modalImage.src = url;
        modalImage.style.display = "block";
      }
      if (modalInitial) {
        modalInitial.style.display = "none";
      }
      if (topAvatar) {
        topAvatar.innerHTML = "";
        const img = document.createElement("img");
        img.className = "top-avatar-photo";
        img.src = url;
        img.alt = "Profile photo";
        topAvatar.appendChild(img);
      }
      if (candidateAvatar) {
        candidateAvatar.innerHTML = "";
        const img = document.createElement("img");
        img.className = "top-avatar-photo";
        img.src = url;
        img.alt = "Profile photo";
        candidateAvatar.appendChild(img);
      }
      return;
    }
    if (modalImage) {
      modalImage.removeAttribute("src");
      modalImage.style.display = "none";
    }
    if (modalInitial) {
      modalInitial.style.display = "block";
    }
  }
  function updateProfileDisplay() {
    const name = profileName?.value.trim() || "Student";
    const email = profileEmail?.value || "—";
    const college = profileCollege?.value.trim() || "College not added";
    const role = profileRole?.value || "Student";
    const displayName = document.getElementById("profileDisplayName");
    const displayEmail = document.getElementById("profileDisplayEmail");
    const displayRole = document.getElementById("profileDisplayRole");
    const displayCollege = document.getElementById("profileDisplayCollege");
    if (displayName) displayName.textContent = name;
    if (displayEmail) displayEmail.textContent = email;
    if (displayRole) displayRole.textContent = role;
    if (displayCollege) displayCollege.textContent = college;
    const initial = name.trim().charAt(0).toUpperCase() || "A";
    const photoInitial = document.getElementById("profilePhotoInitial");
    if (photoInitial) photoInitial.textContent = initial;
    if (topAvatar && !window.__aldovraProfilePhotoUrl) {
      topAvatar.textContent = initial;
    }
  }
  if (editProfileBtn) {
    editProfileBtn.addEventListener("click", (event) => {
      if (window.__aldovraPreviewMode) {
        aldovraPreviewGuard(event);
        return;
      }
      takeProfileSnapshot();
      setProfileEditing(true);
    });
  }
  if (cancelProfileEditBtn) {
    cancelProfileEditBtn.addEventListener("click", () => {
      restoreProfileSnapshot();
      pendingProfilePhoto = null;
      if (profilePhotoInput) profilePhotoInput.value = "";
      setProfileEditing(false);
    });
  }
  if (topAvatar) {
    topAvatar.addEventListener("click", openProfileModal);
  }

  /* Update profile completion immediately when Target Career changes. */
  if (targetCareerField) {
    targetCareerField.addEventListener("change", updateProfileCompletion);
    targetCareerField.addEventListener("input", updateProfileCompletion);
  }

  /* =====================================================
   ONBOARDING — BLOCK PROFILE EXIT UNTIL COMPLETE
====================================================== */
  if (document.getElementById("closeProfileDetailsBtn")) {
    document.getElementById("closeProfileDetailsBtn").addEventListener("click", (event) => {
      if (window.__aldovraPreviewMode) {
        event.preventDefault();
        event.stopPropagation();
        closeProfileModal();
        return;
      }
      const completion = updateProfileCompletion();
      if (completion < 100) {
        event.preventDefault();
        alert("Please complete your profile before leaving this step.");
        return;
      }
      closeProfileModal();
    });
  }

  /* =====================================================
   ONBOARDING — BLOCK BACKDROP EXIT
====================================================== */
  if (profileModal) {
    profileModal.addEventListener("click", (event) => {
      if (event.target !== profileModal) {
        return;
      }
      if (window.__aldovraPreviewMode) {
        closeProfileModal();
        return;
      }
      const completion = updateProfileCompletion();
      if (completion < 100) {
        alert("Please complete your profile before leaving this step.");
        return;
      }
      closeProfileModal();
    });
  }

  /* =====================================================
   ONBOARDING — BLOCK ESCAPE EXIT
====================================================== */
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!profileModal?.classList.contains("show")) {
      return;
    }
    if (window.__aldovraPreviewMode) {
      event.preventDefault();
      closeProfileModal();
      return;
    }
    const completion = updateProfileCompletion();
    if (completion < 100) {
      event.preventDefault();
      alert("Please complete your profile before leaving this step.");
      return;
    }
    closeProfileModal();
  });
  window.openProfileModal = openProfileModal;
  window.takeProfileSnapshot = takeProfileSnapshot;
  window.setProfileEditing = setProfileEditing;
  window.updateProfileDisplay = updateProfileDisplay;
  function updateProfileSummary() {
    updateProfileDisplay();
  }
  window.updateProfileSummary = updateProfileSummary;
  setTimeout(updateProfileSummary, 1200);
  setInterval(updateProfileSummary, 5000);
})();