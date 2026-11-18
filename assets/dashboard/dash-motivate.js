/* Aldovra dashboard: honest nudges that make the next skill test feel worth taking.
   - AldDemand.get(names): live job counts per skill from RPC skill_job_demand() (cached 10 min).
   - Assessment rows: "You were X% away from verified" bar for scores under 75%,
     "N live jobs mention <skill>" chip (only real counts, only when 3+), "No fee" chip on unlocked tests.
   - Recommended test cards get the same demand chip.
   Loads right before dash-mission.js (the mission card uses AldDemand); watches the lists, so load order vs dash-assessment.js does not matter. */
(function () {
  "use strict";
  if (typeof db === "undefined") return;

  var cache = {}, pending = {}, TTL = 6e5;
  function get(names) {
    var now = Date.now(), want = [];
    (names || []).forEach(function (n) {
      n = String(n || "").trim();
      if (n && !(cache[n] && now - cache[n].t < TTL) && !pending[n] && want.indexOf(n) < 0) want.push(n);
    });
    var waitFor = Object.keys(pending).map(function (k) { return pending[k]; });
    if (want.length) {
      var p = db.rpc("skill_job_demand", { p_names: want }).then(function (r) {
        var m = (r && r.data) || {};
        want.forEach(function (n) { cache[n] = { t: Date.now(), v: Number(m[n]) || 0 }; delete pending[n]; });
      }, function () { want.forEach(function (n) { cache[n] = { t: Date.now(), v: 0 }; delete pending[n]; }); });
      want.forEach(function (n) { pending[n] = p; });
      waitFor.push(p);
    }
    return Promise.all(waitFor).then(function () {
      var out = {};
      (names || []).forEach(function (n) { n = String(n || "").trim(); if (cache[n]) out[n] = cache[n].v; });
      return out;
    });
  }
  window.AldDemand = { get: get };

  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>';
  var demandChip = function (n, skill) {
    return '<span class="aldmo-demand" title="Live job posts on Aldovra that mention ' + esc(skill) + '">' + ICON + "<b>" + n + "</b> live jobs mention " + esc(skill) + "</span>";
  };

  function decorateRows(list) {
    var rows = [].slice.call(list.querySelectorAll(".assessment-row:not([data-aldmo])"));
    if (!rows.length) return;
    var names = [];
    rows.forEach(function (row) {
      row.setAttribute("data-aldmo", "1");
      var info = row.querySelector(".assessment-info");
      var name = ((row.querySelector("h4") || {}).textContent || "").trim();
      if (!info || !name) return;
      row.__aldmoName = name;
      names.push(name);
      var box = document.createElement("div");
      box.className = "aldmo";
      var scoreEl = row.querySelector(".am-score");
      var score = scoreEl ? parseFloat(scoreEl.textContent) : NaN;
      var html = "";
      if (Number.isFinite(score) && score < 75) {
        var gap = Math.max(1, Math.round(75 - score));
        html += '<div class="aldmo-gap" role="img" aria-label="Score ' + Math.round(score) + "%, verified at 75%\">" +
          '<div class="aldmo-gap-txt">' + (gap <= 15 ? "Only <b>" + gap + "%</b> away from verified" : "<b>" + gap + "%</b> to go for verified") + "</div>" +
          '<div class="aldmo-bar"><i style="width:' + Math.max(2, Math.min(100, score)) + '%"></i><s style="left:75%"></s></div></div>';
      }
      var openBtn = row.querySelector("[data-open-assessment],[data-open-reattempt]");
      var paid = openBtn && /paid/i.test(openBtn.textContent || "");
      var payBtn = row.querySelector("[data-pay-new-skill],[data-pay-reattempt],[data-reattempt-pay]") || [].slice.call(row.querySelectorAll("button")).filter(function (x) { return /₹\s*\d/.test(x.textContent || ""); })[0];
      html += '<div class="aldmo-chips">' + (openBtn ? '<span class="aldmo-free">' + (paid ? "Paid, ready to start" : "No fee for this attempt") + "</span>" : "") +
        (payBtn ? '<span class="aldmo-free">₹49 · about the price of one masala dosa</span>' : "") + "</div>";
      box.innerHTML = html;
      info.appendChild(box);
    });
    get(names).then(function (m) {
      rows.forEach(function (row) {
        var n = m[row.__aldmoName], chips = row.querySelector(".aldmo-chips");
        if (chips && n >= 3) chips.insertAdjacentHTML("afterbegin", demandChip(n, row.__aldmoName));
      });
    });
  }

  function decorateRecommended(list) {
    var items = [].slice.call(list.querySelectorAll(".recommended-assessment-item:not([data-aldmo])"));
    if (!items.length) return;
    var names = items.map(function (it) {
      it.setAttribute("data-aldmo", "1");
      return (it.__aldmoName = ((it.querySelector("h3") || {}).textContent || "").trim());
    });
    get(names).then(function (m) {
      items.forEach(function (it) {
        var n = m[it.__aldmoName], meta = it.querySelector(".recommended-assessment-meta");
        if (meta && n >= 3) meta.insertAdjacentHTML("beforebegin", '<div class="aldmo-chips">' + demandChip(n, it.__aldmoName) + "</div>");
      });
    });
  }

  /* ---- Resume bundle card (17 Nov 2026): every locked skill in one payment, about 15% off ---- */
  var FEE = 49;
  function bundlePrice(n) { return Math.max(FEE, Math.floor((n * FEE * 0.85 + 1) / 10) * 10 - 1); }
  var bundleBusy = false;
  async function renderBundle() {
    var uid = window.currentUser && window.currentUser.id;
    var hero = document.querySelector(".assessments-page-hero");
    if (!uid || !hero || bundleBusy) return;
    bundleBusy = true;
    try {
      var r = await db.from("assessment_requests").select("id,assessment_id,status").eq("user_id", uid).eq("status", "payment_pending").not("assessment_id", "is", null);
      var rows = (r && r.data) || [];
      var old = document.getElementById("aldBundle");
      if (rows.length < 2) { if (old) old.remove(); return; }
      var ids = rows.map(function (x) { return x.assessment_id; });
      var a = await db.from("assessments").select("id,title").in("id", ids);
      var names = ((a && a.data) || []).map(function (x) { return String(x.title || "").replace(/\s+(?:Fundamentals\s+)?(?:Skill\s+)?Assessment$/i, "").trim(); }).filter(Boolean);
      var n = rows.length, full = n * FEE, price = bundlePrice(n);
      var el = old || document.createElement("section");
      el.id = "aldBundle";
      el.className = "aldmo-bundle";
      el.innerHTML =
        '<div><span class="aldmo-bk">Resume bundle</span><h3>Verify all ' + n + " skills from your resume</h3>" +
        "<p>" + esc(names.slice(0, 6).join(", ")) + (names.length > 6 ? " and more" : "") + ". One payment unlocks every test; take them whenever you are ready.</p></div>" +
        '<div class="aldmo-bp"><s>₹' + full + "</s><b>₹" + price + "</b><small>You save ₹" + (full - price) + "</small>" +
        '<button type="button" class="aldmo-btn" data-ald-bundle>Unlock all ' + n + " for ₹" + price + "</button></div>";
      if (!old) hero.parentNode.insertBefore(el, hero.nextSibling);
      var btn = el.querySelector("[data-ald-bundle]");
      btn.onclick = function () {
        if (typeof window.aldovraStartBundle === "function") window.aldovraStartBundle(btn, n, price, names.join(", "));
      };
    } catch (e) { /* the card is optional */ } finally { bundleBusy = false; }
  }

  /* ---- Free resume card on Overview (17 Nov 2026): the benefit students get after 2 verified skills ---- */
  async function renderResumeCard() {
    var uid = window.currentUser && window.currentUser.id;
    var anchor = document.querySelector(".aldm") || document.querySelector(".overview-hero");
    if (!uid || !anchor || document.getElementById("aldResumeCard")) return;
    var certs = 0;
    try {
      var c = await db.from("skill_certificates").select("id", { count: "exact", head: true }).eq("user_id", uid).is("revoked_at", null);
      certs = (c && c.count) || 0;
    } catch (e) {}
    if (document.getElementById("aldResumeCard")) return;
    var el = document.createElement("section");
    el.id = "aldResumeCard";
    el.className = "aldmo-resume";
    /* 17 Nov 2026: the free resume needs 2 verified skills (one free + at least one paid test). */
    var NEED = 2, left = Math.max(0, NEED - certs);
    var kicker = left ? "Free when you verify " + NEED + " skills" : "Your free resume";
    var title = left === 0 ? "We are preparing your resume" : left === 1 ? "One more verified skill. <em>Then we build your resume.</em>" : "Prove your skills. <em>We build your resume.</em>";
    var text = left === 0
      ? "You have " + certs + " verified skills. Our team is preparing a professional resume with your skill proof added, and will email it to you."
      : left === 1
        ? "You have 1 verified skill. Verify one more and our team prepares a professional, ATS-friendly resume with your skill proof added (score, level and credential link for each skill), and emails it to you."
        : "Verify 2 skills (75% or more with an approved video). Our team then prepares a professional, ATS-friendly resume with your skill proof added, and emails it to you. No extra cost.";
    el.innerHTML =
      '<div class="aldmo-rtext"><span class="aldmo-bk">' + kicker + "</span><h3>" + title + "</h3><p>" + text + "</p>" +
      '<div class="aldmo-ract">' + (left ? '<button type="button" class="aldmo-btn" data-ald-go="assessments">Go to my tests</button>' : "") +
      '<a class="aldmo-btn2" href="/assets/sample-resume.webp?v=20261118d" target="_blank" rel="noopener">See a sample resume</a></div>' +
      (left ? '<ol class="aldmo-rsteps" aria-label="Resume progress">' + [0, 1].map(function (i) { return '<li class="' + (i < certs ? "done" : "") + '">Skill ' + (i + 1) + (i < certs ? " verified" : "") + "</li>"; }).join("") + '<li class="' + (left ? "" : "done") + '">Resume</li></ol>' : "") +
      "</div>" +
      '<a class="aldmo-rimg" href="/assets/sample-resume.webp?v=20261118d" target="_blank" rel="noopener" aria-label="See how your skill proof looks"><img src="/assets/sample-resume.webp?v=20261118d" alt="" loading="lazy" width="720" height="760"></a>';
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
    var go = el.querySelector("[data-ald-go]");
    if (go) go.onclick = function () { var nav = document.querySelector('.sidebar .nav-item[data-section="assessments"]'); if (nav) nav.click(); };
  }
  document.addEventListener("aldovra:profile-loaded", function () {
    setTimeout(renderResumeCard, 900);
    setTimeout(renderBundle, 1200);
  });
  /* The profile event can fire before this script runs; poll briefly as a fallback. */
  (function waitUser(n) {
    if (window.currentUser && window.currentUser.id) { setTimeout(renderResumeCard, 600); setTimeout(renderBundle, 900); return; }
    if (n < 20) setTimeout(function () { waitUser(n + 1); }, 500);
  })(0);
  window.AldMotivate = { renderResumeCard: renderResumeCard, renderBundle: renderBundle };
  document.addEventListener("click", function (e) {
    var nav = e.target.closest && e.target.closest('.sidebar .nav-item[data-section="assessments"]');
    if (nav) setTimeout(renderBundle, 300);
  });

  function scan() {
    ["assessmentList", "assessmentResultList"].forEach(function (id) { var el = document.getElementById(id); if (el) decorateRows(el); });
    var rec = document.getElementById("recommendedAssessmentsList");
    if (rec) decorateRecommended(rec);
  }
  var queued = false;
  var mo = new MutationObserver(function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; scan(); });
  });
  function start() {
    ["assessmentList", "assessmentResultList", "recommendedAssessmentsList"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) mo.observe(el, { childList: true, subtree: true });
    });
    scan();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
