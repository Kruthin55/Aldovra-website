/* Aldovra student dashboard — premium overview layer (28 Oct 2026).
   Personal hero, verification journey, skill-vs-benchmark bars and a score trend line.
   Reads the dashboard's own data (profile, reports, attempts, assessmentRequests, evidence) and
   re-renders whenever the dashboard refreshes them (wraps renderOverviewProgress / renderPerformanceVisual).
   Old markup stays in the page (other scripts write to it) but is visually replaced. */
(function () {
  "use strict";
  var BENCH = 75;
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  function g(name) { try { return eval(name); } catch (e) { return undefined; } } // dashboard globals are top-level `let`s
  function arr(name) { var v = g(name); return Array.isArray(v) ? v : []; }
  var certs = null, isPublic = false;

  function skillName(t) { return String(t || "Skill").replace(/\s+(Fundamentals\s+)?Assessment$/i, "").trim() || "Skill"; }
  function dt(v) { var d = new Date(v); return isNaN(d) ? null : d; }

  /* ---------- data model ---------- */
  function model() {
    var requests = arr("assessmentRequests"), reports = arr("reports"), attempts = arr("attempts"), ev = arr("evidence");
    var reqById = {};
    requests.forEach(function (r) { if (r && r.id) reqById[String(r.id)] = r; });
    function requestFor(rep) {
      if (rep.request_id && reqById[String(rep.request_id)]) return reqById[String(rep.request_id)];
      var a = attempts.find(function (x) {
        return (rep.attempt_id && String(x.id) === String(rep.attempt_id)) || (rep.session_id && String(x.session_id || "") === String(rep.session_id));
      });
      return a ? reqById[String(a.request_id || "")] || null : null;
    }
    var done = reports.filter(function (r) { return r && r.evaluation_status === "completed" && isFinite(Number(r.percentage)); });
    var bySkill = {};
    var points = [];
    done.forEach(function (r) {
      var req = requestFor(r);
      var name = skillName((req && req.assessment_name) || r.assessment_name || r.skill_name);
      var key = req ? "r" + req.id : name;
      var score = Number(r.percentage);
      var hasVideo = ev.some(function (e) { return String(e.session_id || "") === String(r.session_id || "") && String(e.environment_video_url || "").trim(); });
      var s = bySkill[key] || (bySkill[key] = { name: name, best: -1, attempts: 0, video: false, last: null, requestId: req && req.id });
      s.attempts++;
      if (score > s.best) s.best = score;
      if (score >= BENCH && hasVideo) s.video = true;
      var when = dt(r.created_at);
      if (when && (!s.last || when > s.last)) s.last = when;
      if (when) points.push({ name: name, score: score, when: when });
    });
    var skills = Object.keys(bySkill).map(function (k) { return bySkill[k]; }).sort(function (a, b) { return b.best - a.best; });
    points.sort(function (a, b) { return a.when - b.when; });
    var best = skills.length ? skills[0].best : null;
    var avg = skills.length ? skills.reduce(function (t, s) { return t + s.best; }, 0) / skills.length : null;
    var verifiedNames = (certs || []).map(function (c) { return String(c.skill || "").toLowerCase(); });
    skills.forEach(function (s) { s.verified = verifiedNames.indexOf(s.name.toLowerCase()) > -1; });
    var p = g("profile") || {};
    return {
      first: String((p && p.full_name) || "").trim().split(/\s+/)[0] || "",
      requests: requests, skills: skills, points: points, best: best, avg: avg,
      attemptsTotal: done.length,
      anyPass: skills.some(function (s) { return s.best >= BENCH; }),
      anyVideo: skills.some(function (s) { return s.video; }),
      certCount: (certs || []).length,
      isPublic: isPublic
    };
  }

  /* ---------- journey ---------- */
  function journey(m) {
    var steps = [
      { k: "resume", t: "Resume analysed", d: "We found the skills to verify", done: m.requests.length > 0 },
      { k: "exam", t: "Take an assessment", d: "Proctored, 20–30 minutes", done: m.attemptsTotal > 0 },
      { k: "pass", t: "Score 75% or more", d: m.best != null ? "Your best: " + Math.round(m.best) + "%" : "The verification benchmark", done: m.anyPass },
      { k: "video", t: "Submit environment video", d: "A short YouTube (unlisted) link", done: m.anyVideo },
      { k: "review", t: "Aldovra review", d: "Our team checks your exam setup", done: m.certCount > 0 },
      { k: "share", t: "Share your proof", d: "Public profile + certificate", done: m.certCount > 0 && m.isPublic }
    ];
    var idx = steps.findIndex(function (s) { return !s.done; });
    var actions = {
      resume: { text: "Upload your resume", go: "profile" },
      exam: { text: "Start your assessment", go: "assessments" },
      pass: { text: m.best != null ? "Reattempt to reach 75%" : "Start your assessment", go: "assessments" },
      video: { text: "Submit your environment video", go: "assessments" },
      review: { text: "View your results", go: "assessments" },
      share: { text: "Share your verified profile", go: "verified-profile" }
    };
    var next = idx === -1 ? { text: "Share your certificate", go: "verified-profile" } : actions[steps[idx].k];
    var msg = idx === -1 ? "You're verified and visible. Keep adding skills to climb the Arena." :
      steps[idx].k === "review" ? "Your video is with our team. You'll get your certificate as soon as it's approved." :
      steps[idx].k === "pass" && m.best != null ? "You're " + Math.max(1, Math.ceil(BENCH - m.best)) + "% away from your first verified skill." :
      (steps.length - idx) + " steps to your first verified skill.";
    return { steps: steps, idx: idx, next: next, msg: msg };
  }
  function go(target) {
    var nav = document.querySelector('.sidebar .nav-item[data-section="' + target + '"]');
    if (nav) nav.click();
  }

  /* ---------- hero ---------- */
  function renderHero(m, j) {
    var hero = document.querySelector(".overview-hero");
    if (!hero) return;
    hero.classList.add("aldx-on");
    var box = hero.querySelector(".aldx-hero");
    if (!box) { box = document.createElement("div"); box.className = "aldx aldx-hero"; hero.appendChild(box); }
    var h = new Date().getHours();
    var greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    var best = m.best != null ? Math.round(m.best) : 0;
    box.innerHTML =
      '<div class="aldx-hero-text">' +
        '<div class="aldx-kicker">Skills verified · Better hiring</div>' +
        "<h2>" + esc(greet) + (m.first ? ", <em>" + esc(m.first) + ".</em>" : ".") + "</h2>" +
        "<p>" + esc(j.msg) + "</p>" +
        '<div class="aldx-hero-stats">' +
          "<div><b data-count=\"" + m.certCount + "\">0</b><span>Verified skills</span></div>" +
          "<div><b data-count=\"" + best + "\" data-suffix=\"%\">0%</b><span>Best score</span></div>" +
          "<div><b data-count=\"" + m.attemptsTotal + "\">0</b><span>Attempts</span></div>" +
        "</div>" +
        '<button type="button" class="aldx-hero-btn" data-go="' + j.next.go + '">' + esc(j.next.text) + " →</button>" +
      "</div>" +
      '<div class="aldx-ring" style="--p:' + Math.min(100, best) + '" role="img" aria-label="Best score ' + best + "% of the 75% benchmark\">" +
        '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="trk"/><circle cx="60" cy="60" r="52" class="val" pathLength="100"/>' +
        '<line class="tick" x1="60" y1="2" x2="60" y2="18"/></svg>' +
        '<div class="aldx-ring-c"><b>' + best + '%</b><span>best score</span><small>75% to verify</small></div></div>';
    box.querySelector("[data-go]").onclick = function () { go(this.getAttribute("data-go")); };
    countUp(box);
  }

  /* ---------- journey card ---------- */
  function renderJourney(m, j) {
    var card = document.querySelector(".overview-progress-card");
    if (!card) return;
    card.classList.add("aldx-on");
    var box = card.querySelector(".aldx-journey");
    if (!box) { box = document.createElement("div"); box.className = "aldx aldx-journey"; card.appendChild(box); }
    var doneCount = j.steps.filter(function (s) { return s.done; }).length;
    box.innerHTML =
      '<div class="aldx-head"><div><div class="aldx-kicker">Your verification journey</div><h3>' +
        (j.idx === -1 ? "You're <em>verified.</em>" : "Step " + (j.idx + 1) + " of 6: <em>" + esc(j.steps[j.idx].t) + "</em>") + "</h3></div>" +
        '<div class="aldx-progress-num"><b>' + doneCount + "</b>/6 done</div></div>" +
      '<ol class="aldx-steps">' + j.steps.map(function (s, i) {
        var cls = s.done ? "done" : i === j.idx ? "now" : "";
        return '<li class="' + cls + '"><span class="dot" aria-hidden="true">' + (s.done ? "✓" : i + 1) + "</span><b>" + esc(s.t) + "</b><small>" + esc(s.d) + "</small>" +
          (i === j.idx ? '<button type="button" data-go="' + j.next.go + '">' + esc(j.next.text) + " →</button>" : "") + "</li>";
      }).join("") + "</ol>";
    box.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { go(b.getAttribute("data-go")); }; });
  }

  /* ---------- performance: bars vs benchmark + trend ---------- */
  var tip;
  function tooltip(html, x, y) {
    if (!tip) { tip = document.createElement("div"); tip.className = "aldx-tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); }
    if (!html) { tip.classList.remove("on"); return; }
    tip.innerHTML = html; tip.classList.add("on");
    var r = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, x - r.width / 2)) + "px";
    tip.style.top = Math.max(8, y - r.height - 12) + "px";
  }
  function status(s) {
    if (s.verified) return { cls: "good", label: "Verified", icon: "✓" };
    if (s.best >= BENCH) return { cls: "good", label: s.video ? "In review" : "Passed · send video", icon: "✓" };
    if (s.best >= 65) return { cls: "warn", label: Math.ceil(BENCH - s.best) + "% to go", icon: "▲" };
    return { cls: "crit", label: "Needs practice", icon: "●" };
  }
  function renderPerformance(m) {
    var sec = document.querySelector(".overview-performance");
    if (!sec) return;
    sec.classList.add("aldx-on");
    var box = sec.querySelector(".aldx-perf");
    if (!box) { box = document.createElement("div"); box.className = "aldx aldx-perf"; sec.appendChild(box); }
    if (!m.skills.length) {
      box.innerHTML = '<div class="aldx-head"><div><div class="aldx-kicker">Performance insight</div><h3>Your scores <em>vs. 75%</em></h3></div></div>' +
        '<div class="aldx-empty">Finish your first assessment to see how each skill compares with the 75% verification benchmark.</div>';
      return;
    }
    var rows = m.skills.map(function (s, i) {
      var st = status(s), w = Math.max(1.5, Math.min(100, s.best));
      return '<div class="aldx-bar" data-i="' + i + '" tabindex="0">' +
        '<div class="aldx-bar-name"><b>' + esc(s.name) + "</b><small>" + s.attempts + " attempt" + (s.attempts > 1 ? "s" : "") + "</small></div>" +
        '<div class="aldx-bar-track"><i class="' + st.cls + '" style="--w:' + w + '%"></i></div>' +
        '<div class="aldx-bar-val"><b>' + Math.round(s.best) + '%</b><span class="aldx-st ' + st.cls + '">' + st.icon + " " + esc(st.label) + "</span></div></div>";
    }).join("");
    box.innerHTML =
      '<div class="aldx-head"><div><div class="aldx-kicker">Performance insight</div><h3>Your best scores <em>vs. 75%</em></h3>' +
        '<p>Best score per skill. Reach the dashed line to become eligible for verification.</p></div>' +
        '<div class="aldx-avg"><b>' + Math.round(m.avg) + '%</b><span>average best</span></div></div>' +
      '<div class="aldx-bars"><div class="aldx-bench" aria-hidden="true"><span>75% benchmark</span></div>' + rows + "</div>" +
      (m.points.length >= 2 ? '<div class="aldx-trend"><div class="aldx-sub">Score trend <span>' + m.points.length + " attempts</span></div>" + trendSvg(m.points, Math.max(280, (box.clientWidth || sec.clientWidth || 640) - 4)) + "</div>" : "") +
      '<table class="aldx-sr"><caption>Best score per skill</caption><tr><th>Skill</th><th>Best score</th><th>Attempts</th><th>Status</th></tr>' +
        m.skills.map(function (s) { return "<tr><td>" + esc(s.name) + "</td><td>" + Math.round(s.best) + "%</td><td>" + s.attempts + "</td><td>" + esc(status(s).label) + "</td></tr>"; }).join("") + "</table>";
    box.querySelectorAll(".aldx-bar").forEach(function (row) {
      var s = m.skills[+row.getAttribute("data-i")];
      var show = function (x, y) { tooltip("<b>" + esc(s.name) + "</b><br>Best " + Math.round(s.best) + "% · " + s.attempts + " attempt" + (s.attempts > 1 ? "s" : "") + (s.last ? "<br><span>Last: " + esc(s.last.toLocaleDateString("en-IN", { day: "numeric", month: "short" })) + "</span>" : ""), x, y); };
      row.addEventListener("mousemove", function (e) { show(e.clientX, e.clientY); });
      row.addEventListener("mouseleave", function () { tooltip(null); });
      row.addEventListener("focus", function () { var r = row.getBoundingClientRect(); show(r.left + r.width / 2, r.top); });
      row.addEventListener("blur", function () { tooltip(null); });
    });
    var svg = box.querySelector(".aldx-trend svg");
    if (svg) bindTrend(svg, m.points);
    animateIn(box);
  }
  function trendSvg(pts, W) {
    var H = 200, L = 34, R = 12, T = 18, B = 26;
    var t0 = pts[0].when.getTime(), t1 = pts[pts.length - 1].when.getTime(), span = Math.max(1, t1 - t0);
    var x = function (p, i) { return pts.length === 1 ? (L + W - R) / 2 : L + (span > 3600e3 ? (p.when.getTime() - t0) / span : i / (pts.length - 1)) * (W - L - R); };
    var y = function (v) { return T + (1 - v / 100) * (H - T - B); };
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + x(p, i).toFixed(1) + " " + y(p.score).toFixed(1); }).join(" ");
    var grid = [0, 25, 50, 100].map(function (v) { return '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>"; }).join("");
    var first = pts[0].when.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), last = pts[pts.length - 1].when.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Score trend across ' + pts.length + ' attempts">' + grid +
      '<line class="bench" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(BENCH) + '" y2="' + y(BENCH) + '"/><text class="benchl" x="' + (W - R) + '" y="' + (y(BENCH) - 6) + '" text-anchor="end">75% benchmark</text>' +
      '<path class="area" d="' + d + " L" + x(pts[pts.length - 1], pts.length - 1).toFixed(1) + " " + y(0) + " L" + x(pts[0], 0).toFixed(1) + " " + y(0) + ' Z"/>' +
      '<path class="line" d="' + d + '" pathLength="100"/>' +
      pts.map(function (p, i) { return '<circle class="pt" data-i="' + i + '" cx="' + x(p, i).toFixed(1) + '" cy="' + y(p.score).toFixed(1) + '" r="4.5"/>'; }).join("") +
      '<text class="ax" x="' + L + '" y="' + (H - 6) + '">' + esc(first) + '</text><text class="ax" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(last) + "</text>" +
      '<rect class="hit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '"/></svg>';
  }
  function bindTrend(svg, pts) {
    var circles = svg.querySelectorAll(".pt");
    var hit = svg.querySelector(".hit");
    hit.addEventListener("mousemove", function (e) {
      var best = null, bd = Infinity;
      circles.forEach(function (c) { var r = c.getBoundingClientRect(), dx = Math.abs(r.left + r.width / 2 - e.clientX); if (dx < bd) { bd = dx; best = c; } });
      circles.forEach(function (c) { c.classList.toggle("on", c === best); });
      if (!best) return;
      var p = pts[+best.getAttribute("data-i")], r = best.getBoundingClientRect();
      tooltip("<b>" + esc(p.name) + "</b> · " + Math.round(p.score) + "%<br><span>" + esc(p.when.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })) + "</span>", r.left + r.width / 2, r.top);
    });
    hit.addEventListener("mouseleave", function () { circles.forEach(function (c) { c.classList.remove("on"); }); tooltip(null); });
  }

  /* ---------- motion ---------- */
  function animateIn(root) {
    if (reduce || !("IntersectionObserver" in window)) { root.classList.add("aldx-in"); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { root.classList.add("aldx-in"); io.disconnect(); } });
    }, { threshold: 0.2 });
    io.observe(root);
  }
  function countUp(root) {
    root.querySelectorAll("[data-count]").forEach(function (el) {
      var to = Number(el.getAttribute("data-count")) || 0, suf = el.getAttribute("data-suffix") || "";
      if (reduce || !to) { el.textContent = to + suf; return; }
      var t0 = performance.now(), dur = 900;
      (function step(t) {
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(to * e) + suf;
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }

  /* ---------- empty "verification plan" card ---------- */
  function tidyPlan() {
    var list = document.getElementById("recommendedAssessmentsList");
    var card = list && list.closest(".recommended-assessments-card");
    if (!card) return;
    var hasItems = !!list.querySelector(".recommended-assessment-item");
    card.classList.toggle("aldx-hide", !hasItems);
  }

  /* ---------- profile modal: strength ring + missing-field chips ---------- */
  var PROFILE_FIELDS = [
    ["profileName", "Add your name"], ["profileCity", "Add city"], ["profileCollege", "Add college"],
    ["profileDegree", "Add degree"], ["profileGraduationYear", "Add graduation year"], ["targetCareer", "Pick a career track"],
    ["profileBio", "Write a short bio"], ["profileLinkedin", "Add LinkedIn"], ["profileGithub", "Add GitHub"]
  ];
  function renderStrength() {
    var hero = document.querySelector("#profileDetailsModal .profile-hero");
    if (!hero) return;
    var missing = [], total = PROFILE_FIELDS.length + 2;
    PROFILE_FIELDS.forEach(function (f) {
      var el = document.getElementById(f[0]);
      if (el && !String(el.value || "").trim()) missing.push(f);
    });
    var img = document.getElementById("profilePhotoImage");
    var hasPhoto = img && img.style.display !== "none" && img.getAttribute("src");
    if (!hasPhoto) missing.push(["profilePhotoInput", "Add a photo"]);
    var rs = document.getElementById("resumeStatus");
    var hasResume = rs && /upload|analy/i.test(rs.textContent || "") && !/not\s+upload|no resume/i.test(rs.textContent || "");
    if (!hasResume) missing.push(["resumeFileInput", "Upload resume"]);
    var pct = Math.round(100 * (total - missing.length) / total);
    var wrap = hero.querySelector(".profile-photo-wrap");
    if (wrap) wrap.style.setProperty("--pc", pct);
    var box = hero.querySelector(".aldx-strength");
    if (!box) { box = document.createElement("div"); box.className = "aldx-strength"; hero.appendChild(box); }
    box.innerHTML = '<div class="aldx-strength-top"><span>Profile strength</span><b>' + pct + "%</b></div>" +
      '<div class="aldx-strength-bar"><i style="width:' + pct + '%"></i></div>' +
      (missing.length
        ? '<div class="aldx-strength-chips">' + missing.slice(0, 5).map(function (f) { return '<button type="button" data-fill="' + f[0] + '">+ ' + esc(f[1]) + "</button>"; }).join("") +
          (missing.length > 5 ? "<span>+" + (missing.length - 5) + " more</span>" : "") + "</div>"
        : '<p class="aldx-strength-ok">✓ Complete. Recruiters see a full profile.</p>');
    box.querySelectorAll("[data-fill]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-fill"), el = document.getElementById(id);
        if (id === "profilePhotoInput" || id === "resumeFileInput") { if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.click(); } return; }
        var edit = document.getElementById("editProfileBtn");
        if (el && el.readOnly && edit && edit.style.display !== "none") edit.click();
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(function () { el.focus(); }, 350); }
      };
    });
  }
  (function watchProfile() {
    var modal = document.getElementById("profileDetailsModal");
    if (!modal || !("MutationObserver" in window)) return;
    new MutationObserver(function () { if (modal.classList.contains("show")) setTimeout(renderStrength, 60); })
      .observe(modal, { attributes: true, attributeFilter: ["class"] });
    modal.addEventListener("input", function () { clearTimeout(watchProfile.t); watchProfile.t = setTimeout(renderStrength, 250); });
    modal.addEventListener("change", function () { setTimeout(renderStrength, 250); });
  })();

  /* ---------- wiring ---------- */
  var queued = false;
  function renderAll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      try {
        var m = model(), j = journey(m);
        renderHero(m, j); renderJourney(m, j); renderPerformance(m); tidyPlan();
      } catch (e) { console.error("Aldovra insights", e); }
    });
  }
  function loadCerts() {
    if (!window.db || !window.db.rpc) return;
    window.db.rpc("get_my_public_profile").then(function (r) {
      if (r && !r.error && r.data && r.data.certificates) { certs = r.data.certificates; isPublic = !!r.data.is_public; renderAll(); }
    }, function () {});
  }
  ["renderOverviewProgress", "renderPerformanceVisual"].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig !== "function") return;
    window[fn] = function () { var out = orig.apply(this, arguments); renderAll(); return out; };
  });
  var list = document.getElementById("recommendedAssessmentsList");
  if (list && "MutationObserver" in window) new MutationObserver(tidyPlan).observe(list, { childList: true, subtree: true });
  var tries = 0;
  (function wait() {
    if (window.currentUser || g("currentUser")) { loadCerts(); renderAll(); return; }
    if (++tries < 60) setTimeout(wait, 500);
  })();
  renderAll();
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") loadCerts(); });
  var rz; addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(renderAll, 200); });
  window.AldovraInsights = { refresh: function () { loadCerts(); renderAll(); } };
})();
