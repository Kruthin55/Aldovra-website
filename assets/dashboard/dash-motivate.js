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
      html += '<div class="aldmo-chips">' + (openBtn ? '<span class="aldmo-free">' + (paid ? "Paid, ready to start" : "No fee for this attempt") + "</span>" : "") + "</div>";
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
