/* 60-second welcome (5 Nov 2026). Replaces the old "complete your profile" wall.
   Shown once after sign-up when name, target career, graduation year or city is missing.
   Saves through save_student_profile() and never blocks the dashboard: "Later" hides it for this visit. */
(function () {
  "use strict";
  if (typeof db === "undefined") return;

  var CAREERS = [
    ["Software Engineer", "code"], ["Data Analyst", "chart"], ["Data Scientist", "flask"],
    ["AI / ML Engineer", "spark"], ["Cloud / DevOps", "cloud"], ["Cybersecurity", "shield"],
    ["QA / Test Engineer", "check"], ["Business Analyst", "brief"], ["UI / UX Designer", "pen"],
    ["Product / Project Management", "flag"], ["Finance / Accounting", "rupee"], ["Sales / Marketing", "mega"],
    ["HR / Recruiting", "users"], ["Operations / Support", "headset"],
    ["Core Engineering (Mech / Civil / ECE)", "gear"], ["Not sure yet", "compass"]
  ];
  var CITIES = ["Hyderabad", "Bengaluru", "Chennai", "Pune", "Mumbai", "Delhi NCR", "Kolkata", "Vijayawada",
    "Visakhapatnam", "Warangal", "Tirupati", "Nellore", "Mahabubnagar", "Coimbatore", "Kochi", "Ahmedabad", "Jaipur"];
  var ICON = {
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19 11a3.5 3.5 0 0 1-.5 7Z"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6Z"/>', check: '<path d="m5 12 4 4 10-10"/>',
    brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2"/>',
    pen: '<path d="m4 20 4-1 11-11-3-3L5 16Z"/>', flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    rupee: '<path d="M7 5h10M7 9h10M10 5c4.5 0 4.5 8 0 8H7l7 6"/>', mega: '<path d="M4 10v4h3l7 4V6L7 10Z"/><path d="M18 9a4 4 0 0 1 0 6"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0-1-5.8M21 20a5 5 0 0 0-4-4.9"/>',
    headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>'
  };
  var svg = function (k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICON[k] || "") + "</svg>"; };
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var SKIP_KEY = "aldovra-welcome-later";


  /* Friendly, non-blocking toast. Dashboard alert() calls are routed here so students never see browser popups. */
  var toastEl = null, toastTimer = null;
  function toast(msg, kind) {
    msg = String(msg == null ? "" : msg).replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\uFE0F?\s*/u, "");
    if (!msg) return;
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "ald-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = "ald-toast show" + (kind ? " " + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = "ald-toast"; }, Math.min(9000, 3200 + msg.length * 40));
  }
  window.AldToast = toast;
  window.alert = function (m) { toast(m); };

  var state = { step: 0, name: "", career: "", year: "", city: "" };
  var root = null;

  function thisYear() { return new Date().getFullYear(); }
  function yearOptions() { var y = thisYear(), out = []; for (var i = y - 2; i <= y + 4; i++) out.push(i); return out; }

  function needsWelcome(p) {
    p = p || {};
    return !String(p.full_name || "").trim() || !String(p.career_track || "").trim() || !p.graduation_year || !String(p.city || "").trim();
  }

  function build() {
    root = document.createElement("div");
    root.className = "aldw";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "aldwTitle");
    root.innerHTML =
      '<div class="aldw-card">' +
        '<div class="aldw-top"><div class="aldw-dots" aria-hidden="true"><i></i><i></i><i></i></div>' +
        '<button type="button" class="aldw-later" data-aldw-later>Do this later</button></div>' +
        '<div class="aldw-body" aria-live="polite"></div>' +
        '<div class="aldw-foot"><button type="button" class="aldw-back" data-aldw-back>Back</button>' +
        '<button type="button" class="aldw-next" data-aldw-next>Continue</button></div>' +
        '<p class="aldw-err" role="alert"></p>' +
      "</div>";
    document.body.appendChild(root);
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); next(); }
      if (e.key === "Escape") later();
    });
  }

  function render() {
    var body = root.querySelector(".aldw-body"), dots = root.querySelectorAll(".aldw-dots i");
    dots.forEach(function (d, i) { d.className = i < state.step ? "done" : i === state.step ? "on" : ""; });
    root.querySelector(".aldw-err").textContent = "";
    root.querySelector("[data-aldw-back]").style.visibility = state.step > 0 && state.step < 3 ? "visible" : "hidden";
    var nextBtn = root.querySelector("[data-aldw-next]");
    nextBtn.textContent = state.step === 2 ? "Finish" : "Continue";
    root.querySelector(".aldw-foot").style.display = state.step === 3 ? "none" : "";
    root.querySelector("[data-aldw-later]").style.visibility = state.step === 3 ? "hidden" : "visible";

    if (state.step === 0) {
      body.innerHTML =
        '<div class="aldw-kicker">Welcome to Aldovra</div>' +
        '<h2 id="aldwTitle">Namaste! Let’s set you up <em>in 60 seconds.</em></h2>' +
        '<p class="aldw-sub">Three quick questions so we can match you with the right fresher jobs and skill tests.</p>' +
        '<label class="aldw-label" for="aldwName">What should we call you?</label>' +
        '<input id="aldwName" class="aldw-input" type="text" autocomplete="name" maxlength="80" placeholder="Your full name" value="' + esc(state.name) + '">';
      setTimeout(function () { var i = $("aldwName"); if (i) { i.focus(); i.select(); } }, 60);
    } else if (state.step === 1) {
      body.innerHTML =
        '<div class="aldw-kicker">Step 2 of 3</div>' +
        '<h2 id="aldwTitle">Which role are you <em>aiming for?</em></h2>' +
        '<p class="aldw-sub">Pick the closest one. You can change it anytime from your profile.</p>' +
        '<div class="aldw-chips" role="radiogroup" aria-label="Target career">' +
        CAREERS.map(function (c) {
          var on = state.career === c[0];
          return '<button type="button" role="radio" aria-checked="' + on + '" class="aldw-chip' + (on ? " on" : "") + '" data-aldw-career="' + esc(c[0]) + '">' + svg(c[1]) + "<span>" + esc(c[0]) + "</span></button>";
        }).join("") + "</div>";
    } else if (state.step === 2) {
      body.innerHTML =
        '<div class="aldw-kicker">Step 3 of 3</div>' +
        '<h2 id="aldwTitle">When do you graduate, <em>and where are you?</em></h2>' +
        '<p class="aldw-sub">We use this to show jobs near you and roles that fit your batch.</p>' +
        '<span class="aldw-label">Graduation year</span>' +
        '<div class="aldw-years" role="radiogroup" aria-label="Graduation year">' +
        yearOptions().map(function (y) {
          var on = String(state.year) === String(y);
          return '<button type="button" role="radio" aria-checked="' + on + '" class="aldw-year' + (on ? " on" : "") + '" data-aldw-year="' + y + '">' + y + "</button>";
        }).join("") + "</div>" +
        '<label class="aldw-label" for="aldwCity">Your city</label>' +
        '<input id="aldwCity" class="aldw-input" type="text" list="aldwCities" autocomplete="address-level2" maxlength="60" placeholder="e.g. Hyderabad" value="' + esc(state.city) + '">' +
        '<datalist id="aldwCities">' + CITIES.map(function (c) { return '<option value="' + c + '">'; }).join("") + "</datalist>";
    } else {
      var jobs = document.querySelector('[data-aldv-count="live_jobs"]');
      var n = jobs && /\d/.test(jobs.textContent) ? jobs.textContent : "";
      body.innerHTML =
        '<div class="aldw-done-badge" aria-hidden="true">' + svg("check") + "</div>" +
        '<div class="aldw-kicker">You’re all set</div>' +
        '<h2 id="aldwTitle">Welcome aboard, <em>' + esc(state.name.split(" ")[0]) + "!</em></h2>" +
        '<p class="aldw-sub">' + (n ? n + " live fresher jobs" : "Live fresher jobs") + " are waiting for you. Upload your resume next to unlock free skill tests and better matches.</p>" +
        '<div class="aldw-final"><button type="button" class="aldw-next" data-aldw-go="jobs">See my jobs</button>' +
        '<button type="button" class="aldw-ghost" data-aldw-go="resume">Upload resume</button></div>';
      setTimeout(function () { var b = root.querySelector('[data-aldw-go="jobs"]'); if (b) b.focus(); }, 60);
    }
  }

  function error(msg) { root.querySelector(".aldw-err").textContent = msg; }

  function onInput(e) {
    if (e.target.id === "aldwName") state.name = e.target.value;
    if (e.target.id === "aldwCity") state.city = e.target.value;
    root.querySelector(".aldw-err").textContent = "";
  }

  function onClick(e) {
    var t = e.target.closest("button");
    if (!t) return;
    if (t.hasAttribute("data-aldw-later")) return later();
    if (t.hasAttribute("data-aldw-back")) { state.step = Math.max(0, state.step - 1); return render(); }
    if (t.hasAttribute("data-aldw-next")) return next();
    if (t.hasAttribute("data-aldw-career")) { state.career = t.getAttribute("data-aldw-career"); render(); return; }
    if (t.hasAttribute("data-aldw-year")) { state.year = t.getAttribute("data-aldw-year"); render(); return; }
    if (t.hasAttribute("data-aldw-go")) return go(t.getAttribute("data-aldw-go"));
  }

  function next() {
    if (state.step === 0) {
      state.name = String(state.name || "").trim().replace(/\s+/g, " ");
      if (state.name.length < 2) return error("Enter your name to continue.");
    } else if (state.step === 1) {
      if (!state.career) return error("Pick the role you’re aiming for.");
    } else if (state.step === 2) {
      state.city = String(state.city || "").trim();
      if (!state.year) return error("Pick your graduation year.");
      if (state.city.length < 2) return error("Enter your city.");
      return save();
    }
    state.step++;
    render();
  }

  function setVal(id, v) { var el = $(id); if (el) el.value = v; }
  function val(id) { var el = $(id); return el ? String(el.value || "").trim() : ""; }

  function save() {
    var btn = root.querySelector("[data-aldw-next]");
    btn.disabled = true; btn.textContent = "Saving…";
    setVal("profileName", state.name);
    setVal("targetCareer", state.career);
    setVal("profileGraduationYear", state.year);
    setVal("profileCity", state.city);
    var completion = typeof window.updateProfileCompletion === "function" ? window.updateProfileCompletion() : 0;
    db.rpc("save_student_profile", {
      p_full_name: state.name, p_city: state.city, p_college: val("profileCollege"), p_degree: val("profileDegree"),
      p_graduation_year: Number(state.year) || null, p_bio: val("profileBio"), p_github_url: val("profileGithub"),
      p_linkedin_url: val("profileLinkedin"), p_career_track: state.career, p_profile_completion: completion
    }).then(function (r) {
      btn.disabled = false; btn.textContent = "Finish";
      if (r.error) { console.error("Welcome save error", r.error); return error("Couldn’t save right now. Check your internet and try again."); }
      try { localStorage.removeItem(SKIP_KEY); } catch (e) {}
      var first = state.name.split(" ")[0];
      ["welcomeName"].forEach(function (id) { var el = $(id); if (el) el.textContent = first; });
      var cn = $("candidateName"); if (cn) cn.textContent = state.name;
      if (typeof window.updateProfileDisplay === "function") window.updateProfileDisplay();
      document.dispatchEvent(new CustomEvent("aldovra:welcome-done", { detail: { career: state.career } }));
      state.step = 3; render();
      if (window.AldoMascot && typeof window.AldoMascot.dance === "function") { try { window.AldoMascot.dance(1600); } catch (e) {} }
    });
  }

  function close() {
    if (!root) return;
    root.classList.remove("show");
    document.documentElement.classList.remove("aldw-open");
    setTimeout(function () { if (root) { root.remove(); root = null; } }, 260);
  }
  function later() {
    try { sessionStorage.setItem(SKIP_KEY, "1"); } catch (e) {}
    close();
  }
  function go(where) {
    close();
    if (where === "jobs") {
      var nav = document.querySelector(".sidebar [data-ald-jobs-nav]");
      if (nav) nav.click(); else { var s = $("aldovraJobsSection"); if (s) s.scrollIntoView({ behavior: "smooth" }); }
    } else if (where === "resume") {
      if (typeof window.openProfileModal === "function") window.openProfileModal();
      setTimeout(function () {
        var input = $("resumeFileInput"), box = input && input.closest(".resume-upload-box");
        if (box) { box.scrollIntoView({ behavior: "smooth", block: "center" }); box.classList.add("aldovra-resume-next-step"); setTimeout(function () { box.classList.remove("aldovra-resume-next-step"); }, 3000); }
      }, 300);
    }
  }

  function show(profile, user) {
    var skipped = false;
    try { skipped = sessionStorage.getItem(SKIP_KEY) === "1"; } catch (e) {}
    if (skipped || root || !needsWelcome(profile)) return;
    var meta = (user && user.user_metadata) || {};
    state.name = (profile && profile.full_name) || meta.full_name || meta.name || "";
    state.career = (profile && profile.career_track) || "";
    state.year = (profile && profile.graduation_year) ? String(profile.graduation_year) : "";
    state.city = (profile && profile.city) || "";
    state.step = 0;
    build();
    render();
    document.documentElement.classList.add("aldw-open");
    requestAnimationFrame(function () { if (root) root.classList.add("show"); });
  }

  document.addEventListener("aldovra:profile-loaded", function (e) {
    var d = e.detail || {};
    show(d.profile, d.user);
  });
  window.AldWelcome = { show: show, needsWelcome: needsWelcome };
})();
