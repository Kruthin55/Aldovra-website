/* Jobs value layer (5 Nov 2026): fills the "How your jobs reach you" strip from jobs_trust_stats(),
   shows the "Why verify" card, and handles the verify buttons on job cards. */
(function () {
  "use strict";
  var trust = document.getElementById("aldvTrust");
  if (!trust || typeof db === "undefined") return;

  var fmt = function (n) { return Number(n || 0).toLocaleString("en-IN"); };
  function ago(iso) {
    var t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return "";
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    return h + (h === 1 ? " hour ago" : " hours ago");
  }
  function countUp(el, to) {
    if (!el) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !to) { el.textContent = fmt(to); return; }
    var start = performance.now(), dur = 900;
    (function step(now) {
      var p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(to * e));
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }
  function set(key, val) {
    trust.querySelectorAll('[data-aldv="' + key + '"]').forEach(function (el) { el.textContent = val; });
  }

  var stats = null, shown = false;
  function paint() {
    if (!stats || !shown) return;
    trust.querySelectorAll("[data-aldv-count]").forEach(function (el) {
      countUp(el, Number(stats[el.getAttribute("data-aldv-count")] || 0));
    });
    var last = ago(stats.last_link_check);
    set("last-check", last ? "Links checked " + last : "Live");
  }
  function loadStats() {
    db.rpc("jobs_trust_stats").then(function (r) {
      if (r.error || !r.data) { console.warn("jobs_trust_stats unavailable", r.error); return; }
      stats = r.data;
      paint();
    });
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        trust.classList.add("is-in"); shown = true; paint(); io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(trust);
  } else { trust.classList.add("is-in"); shown = true; }
  loadStats();
  setInterval(loadStats, 10 * 60 * 1000);

  /* ---------- Why verify card ---------- */
  var card = document.getElementById("aldvVerify");
  function goAssessments() {
    var nav = document.querySelector('.sidebar .nav-item[data-section="assessments"]');
    if (nav) nav.click();
    else { var s = document.getElementById("assessmentsSection"); if (s) s.scrollIntoView({ behavior: "smooth" }); }
  }
  function goVerifiedTab() {
    var t = document.querySelector('[data-ald-job-tab="verified"]');
    if (t && !t.disabled) { t.click(); t.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
  function renderCard(verified, ready) {
    if (!card) return;
    var h = card.querySelector("h3"), perks = card.querySelector(".aldv-perks"),
      btn = card.querySelector(".aldv-btn"), note = card.querySelector(".aldv-cta small");
    if (verified > 0) {
      card.classList.add("is-done");
      h.innerHTML = "You have " + verified + " verified skill" + (verified === 1 ? "" : "s") + ". <em>Nice work.</em>";
      perks.innerHTML = "<li>Verified matches unlocked</li><li>Higher match score on jobs</li><li>Shown to recruiters on Aldovra</li>";
      btn.textContent = "See verified matches";
      btn.onclick = goVerifiedTab;
      note.textContent = ready > 0 ? ready + " more skill" + (ready === 1 ? "" : "s") + " ready to verify" : "Add skills to your resume to verify more";
    } else {
      card.classList.remove("is-done");
      h.innerHTML = "Verified skills get you <em>noticed first.</em>";
      perks.innerHTML = "<li>Proof link for LinkedIn and your resume</li><li>A resume we prepare for you</li><li>Shown to recruiters on Aldovra</li><li>Unlock the Verified matches tab</li>";
      btn.textContent = ready > 0 ? "Start free assessment" : "See assessments";
      btn.onclick = goAssessments;
      note.textContent = ready > 0 ? ready + " skill" + (ready === 1 ? "" : "s") + " from your resume ready" : "Upload your resume to get skill tests";
    }
    card.hidden = false;
  }
  var tries = 0;
  (function waitForProfile() {
    var uid = window.currentUser && window.currentUser.id;
    var names = window.__aldovraVerifiedSkillNames;
    if ((!uid || !names) && tries++ < 40) { setTimeout(waitForProfile, 500); return; }
    var verified = Array.isArray(names) ? names.length : 0;
    if (!uid) { renderCard(verified, 0); return; }
    db.from("assessment_requests").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "approved")
      .then(function (r) { renderCard(verified, r.error ? 0 : (r.count || 0)); });
  })();

  /* ---------- Verify buttons on job cards ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-aldv-verify]");
    if (!b) return;
    e.preventDefault();
    goAssessments();
  });
})();
