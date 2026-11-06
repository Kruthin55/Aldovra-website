/* "Your next step" mission card (5 Nov 2026).
   One clear action on the Overview based on where the student is: upload resume → take test → finish verification.
   Adds a 3-question warm-up (get_practice_questions RPC), a "what to expect" list and calendar reminders. */
(function () {
  "use strict";
  if (typeof db === "undefined") return;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m) { (window.AldToast || window.alert)(m); };
  var I = {
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    test: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    badge: '<circle cx="12" cy="9" r="6"/><path d="m9 14.5-1.5 7L12 19l4.5 2.5-1.5-7"/>',
    check: '<path d="m5 12 4 4 10-10"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    play: '<path d="M8 5v14l11-7Z"/>', video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>'
  };
  var svg = function (k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (I[k] || "") + "</svg>"; };

  var card = null, data = null, loading = false;

  function cleanSkill(title) {
    return String(title || "").replace(/\s+(?:Fundamentals\s+)?(?:Skill\s+)?Assessment$/i, "").trim() || "Skill";
  }
  function goSection(s) {
    var nav = document.querySelector('.sidebar .nav-item[data-section="' + s + '"]');
    if (nav) nav.click();
  }

  /* ---------------- data ---------------- */
  async function load() {
    var uid = window.currentUser && window.currentUser.id;
    if (!uid || loading) return;
    loading = true;
    try {
      var res = await Promise.all([
        db.from("student_resumes").select("id,status,uploaded_at").eq("user_id", uid).order("uploaded_at", { ascending: false }).limit(1),
        db.from("assessment_requests").select("id,status,assessment_id,created_at").eq("user_id", uid).order("created_at", { ascending: true }),
        db.from("assessment_attempts").select("request_id,assessment_id,passed,percentage,submitted_at,session_id").eq("user_id", uid).order("submitted_at", { ascending: false }).limit(200),
        db.from("assessment_sessions").select("request_id,status,expires_at,skill_name").eq("user_id", uid).eq("status", "in_progress").limit(5),
        db.from("skill_certificates").select("id", { count: "exact", head: true }).eq("user_id", uid).is("revoked_at", null),
        db.from("assessment_evidence").select("session_id,environment_video_url").eq("user_id", uid).not("environment_video_url", "is", null).limit(200)
      ]);
      var reqs = (res[1].data || []);
      var ids = Array.from(new Set(reqs.map(function (r) { return r.assessment_id; }).filter(Boolean)));
      var asm = {}, det = {};
      var reqIds = reqs.map(function (r) { return r.id; });
      var extra = await Promise.all([
        ids.length ? db.from("assessments").select("id,title,skill_id,duration_minutes").in("id", ids) : Promise.resolve({ data: [] }),
        reqIds.length ? db.from("assessment_request_details").select("request_id,question_count,duration_minutes").in("request_id", reqIds) : Promise.resolve({ data: [] })
      ]);
      (extra[0].data || []).forEach(function (x) { asm[x.id] = x; });
      (extra[1].data || []).forEach(function (x) { det[x.request_id] = x; });
      data = {
        resume: (res[0].data || []).find(function (r) { return r.status !== "deleted"; }) || null,
        reqs: reqs.map(function (r) {
          var x = asm[r.assessment_id] || {}, dd = det[r.id] || {};
          return Object.assign({}, r, { skill: cleanSkill(x.title), skill_id: x.skill_id,
            minutes: Number(dd.duration_minutes) || Number(x.duration_minutes) || 20, qcount: Number(dd.question_count) || 30 });
        }),
        attempts: res[2].data || [],
        live: (res[3].data || []).filter(function (s) { return !s.expires_at || Date.parse(s.expires_at) > Date.now(); }),
        certs: res[4].error ? 0 : (res[4].count || 0),
        videoSessions: (res[5] && res[5].data || []).map(function (e) { return String(e.session_id); })
      };
      render();
    } catch (e) {
      console.warn("Mission card could not load", e);
      if (card && card.classList.contains("aldm-loading")) { card.remove(); card = null; }
    } finally { loading = false; }
  }

  function attemptsFor(r) { return data.attempts.filter(function (a) { return String(a.request_id || "") === String(r.id); }); }
  function passed(a) { return a && a.passed === true && (a.percentage == null || Number(a.percentage) >= 75); }

  function state() {
    var d = data;
    var live = d.live[0];
    if (live) {
      var lr = d.reqs.find(function (r) { return String(r.id) === String(live.request_id); });
      return { k: "continue", req: lr, skill: (lr && lr.skill) || cleanSkill(live.skill_name) };
    }
    if (!d.resume) return { k: "resume" };
    if (d.resume.status === "uploaded" && !d.reqs.length) return { k: "analyzing" };
    /* a passed skill without a certificate is one step from "verified", so it comes first */
    var passedReqs = d.reqs.filter(function (r) { return attemptsFor(r).some(passed); });
    if (passedReqs.length > d.certs) {
      var vids = d.videoSessions || [];
      var needVideo = passedReqs.filter(function (r) {
        return !attemptsFor(r).some(function (a) { return passed(a) && a.session_id && vids.indexOf(String(a.session_id)) > -1; });
      });
      if (needVideo.length) return { k: "video", req: needVideo[0] };
      if (!d.certs) return { k: "review", req: passedReqs[0] };
    }
    var ready = d.reqs.filter(function (r) { return r.status === "approved" && !attemptsFor(r).length; });
    if (ready.length) return { k: "ready", req: ready[0], more: ready.length - 1 };
    /* retry: skills never passed; suggest the one with the best score so far (closest to 75%) */
    var bestOf = function (r) { return Math.max.apply(null, attemptsFor(r).map(function (a) { return Number(a.percentage) || 0; })); };
    var retry = d.reqs.filter(function (r) { var at = attemptsFor(r); return at.length && !at.some(passed); })
      .sort(function (a, b) { return bestOf(b) - bestOf(a); });
    if (retry.length) return { k: "retry", req: retry[0], score: Math.round(bestOf(retry[0])) };
    if (d.certs) {
      var pend = d.reqs.filter(function (r) { return r.status === "payment_pending"; });
      return { k: "verified", next: pend[0] || null };
    }
    var pp = d.reqs.filter(function (r) { return r.status === "payment_pending"; });
    if (pp.length) return { k: "unlock", req: pp[0] };
    return { k: "noskills" };
  }

  /* ---------------- render ---------------- */
  function ensureCard() {
    if (card && document.body.contains(card)) return card;
    var hero = document.querySelector(".overview-hero");
    if (!hero || !hero.parentNode) return null;
    card = document.createElement("section");
    card.className = "aldm";
    card.setAttribute("aria-labelledby", "aldmTitle");
    hero.parentNode.insertBefore(card, hero.nextSibling);
    card.addEventListener("click", onClick);
    return card;
  }

  function stepsHtml(done) {
    var labels = [["Upload resume", "file"], ["Take a test", "test"], ["Get verified", "badge"]];
    return '<ol class="aldm-steps" aria-label="Verification progress">' + labels.map(function (l, i) {
      var cls = i < done ? "done" : i === done ? "now" : "";
      return '<li class="' + cls + '"><span class="aldm-dot">' + svg(i < done ? "check" : l[1]) + "</span><span>" + l[0] + "</span></li>";
    }).join("") + "</ol>";
  }

  function expectList(req) { return [
    ["clock", (req ? req.qcount : 30) + " questions, " + (req ? req.minutes : 20) + " minutes"], ["video", "Camera on, in a quiet room"], ["test", "Stay in full screen, no new tabs"],
    ["badge", "75% or more = verified"], ["spark", "Not 75%? Retry after 24 hours"]
  ]; }

  function render() {
    var el = ensureCard();
    if (el) { el.classList.remove("aldm-loading"); el.removeAttribute("aria-busy"); }
    if (!el || !data) return;
    var s = state();
    var done = !data.resume ? 0 : (data.certs ? 3 : (data.reqs.some(function (r) { return attemptsFor(r).some(passed); }) ? 2 : 1));
    var kicker = "Your next step", title = "", sub = "", chips = [], primary = null, extras = "", expect = false;

    if (s.k === "resume") {
      title = "Upload your resume to unlock <em>free skill tests.</em>";
      sub = "Takes 30 seconds. We read your resume, find your skills and set up tests for them. Your first test is free.";
      chips = ["PDF, up to 2 MB", "First test free"];
      primary = { t: "Upload resume", a: "resume", i: "file" };
    } else if (s.k === "analyzing") {
      kicker = "Almost there";
      title = "We’re reading <em>your resume.</em>";
      sub = "This usually takes under a minute. Your free skill tests will show up here as soon as it’s done.";
      primary = { t: "Analyse now", a: "analyze", i: "spark" };
    } else if (s.k === "ready") {
      title = "Your <em>" + esc(s.req.skill) + "</em> test is ready.";
      sub = "Pass with 75% or more and your profile shows a verified badge, you unlock Verified Matches, and recruiters on Aldovra can find you." + (s.more > 0 ? " " + s.more + " more test" + (s.more > 1 ? "s are" : " is") + " waiting after this one." : "");
      chips = [s.req.qcount + " questions", s.req.minutes + " min", "Free"];
      primary = { t: "Start " + s.req.skill + " test", a: "start", i: "play" };
      extras = '<button type="button" class="aldm-btn ghost" data-aldm="warmup">' + svg("spark") + "Try 3 sample questions</button>" +
               '<button type="button" class="aldm-btn ghost" data-aldm="remind">' + svg("bell") + "Remind me later</button>";
      expect = true;
    } else if (s.k === "continue") {
      kicker = "Test in progress";
      title = "Finish your <em>" + esc(s.skill) + "</em> test.";
      sub = "Your test is still open. Go back and submit before the timer ends so your score counts.";
      primary = { t: "Continue test", a: "continue", i: "play" };
    } else if (s.k === "retry") {
      title = "So close. Try <em>" + esc(s.req.skill) + "</em> again.";
      sub = (s.score != null ? "Your best score so far is " + s.score + "%. You need 75% to get verified. " : "") + "You get new questions each time, and you can retry 24 hours after your last attempt.";
      chips = ["New questions", "24-hour gap"];
      primary = { t: "Retry " + s.req.skill, a: "assessments", i: "play" };
      extras = '<button type="button" class="aldm-btn ghost" data-aldm="warmup">' + svg("spark") + "Practise 3 questions</button>" +
               '<button type="button" class="aldm-btn ghost" data-aldm="remind">' + svg("bell") + "Remind me later</button>";
    } else if (s.k === "video") {
      title = "You passed" + (s.req && s.req.skill ? " <em>" + esc(s.req.skill) + "</em>" : "") + ". <em>One last step.</em>";
      sub = "Add your short environment video so our team can approve your result. Then your certificate is issued.";
      primary = { t: "Add environment video", a: "assessments", i: "video" };
    } else if (s.k === "review") {
      kicker = "Under review";
      title = "Your video is <em>being reviewed.</em>";
      sub = "Our team reviews every environment video by hand. Your certificate appears here as soon as it is approved.";
      primary = { t: "See my assessments", a: "assessments", i: "test" };
    } else if (s.k === "verified") {
      kicker = "You’re verified";
      title = "Nice work. <em>Share your verified profile.</em>";
      sub = "Add your certificate to LinkedIn and your resume. Verify more skills to climb the Arena.";
      primary = { t: "Share my profile", a: "share", i: "share" };
      if (s.next) extras = '<button type="button" class="aldm-btn ghost" data-aldm="assessments">' + svg("test") + "Verify another skill</button>";
    } else if (s.k === "unlock") {
      title = "Unlock your <em>" + esc(s.req.skill) + "</em> test.";
      sub = "Your next skill test is waiting. Unlock it from Assessments.";
      primary = { t: "Go to assessments", a: "assessments", i: "test" };
    } else {
      title = "We couldn’t find testable skills <em>in your resume.</em>";
      sub = "Add the tools and languages you know (Python, SQL, Excel, Java…) to your resume and upload it again.";
      primary = { t: "Update resume", a: "resume", i: "file" };
    }
    data.state = s;

    el.innerHTML =
      '<div class="aldm-main">' +
        '<div class="aldm-kicker">' + esc(kicker) + "</div>" +
        '<h3 id="aldmTitle">' + title + "</h3>" +
        '<p class="aldm-sub">' + sub + "</p>" +
        (chips.length ? '<div class="aldm-chips">' + chips.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + "</div>" : "") +
        '<div class="aldm-actions"><button type="button" class="aldm-btn primary" data-aldm="' + primary.a + '">' + svg(primary.i) + esc(primary.t) + "</button>" + extras + "</div>" +
        '<div class="aldm-remind" hidden></div>' +
      "</div>" +
      '<div class="aldm-side">' + stepsHtml(done) +
        (expect ? '<div class="aldm-expect"><b>What to expect</b><ul>' + expectList(s.req).map(function (e) { return "<li>" + svg(e[0]) + esc(e[1]) + "</li>"; }).join("") + "</ul></div>" :
          '<div class="aldm-reward"><b>When you’re verified</b><ul><li>' + svg("badge") + "Verified badge and certificate</li><li>" + svg("check") + "Verified Matches tab unlocks</li><li>" + svg("share") + "Recruiters on Aldovra can find you</li></ul></div>") +
      "</div>";
  }

  /* ---------------- actions ---------------- */
  function startTest(req) {
    if (!req) return goSection("assessments");
    var btn = document.querySelector('[data-recommended-assessment="' + String(req.id).replace(/"/g, "") + '"]');
    if (btn) { btn.click(); return; }
    location.href = "/assessment.html?request=" + encodeURIComponent(req.id);
  }
  function openResume() {
    if (typeof window.openProfileModal === "function") window.openProfileModal();
    var input = $("resumeFileInput");
    var box = input && input.closest(".resume-upload-box");
    if (box) { box.scrollIntoView({ behavior: "smooth", block: "center" }); box.classList.add("aldovra-resume-next-step"); setTimeout(function () { box.classList.remove("aldovra-resume-next-step"); }, 3000); }
    if (input) input.click();
  }

  function onClick(e) {
    var b = e.target.closest("[data-aldm]");
    if (!b) return;
    var a = b.getAttribute("data-aldm"), s = data && data.state;
    if (a === "resume") return openResume();
    if (a === "start") return startTest(s && s.req);
    if (a === "continue") { if (s && s.req) location.href = "/assessment.html?request=" + encodeURIComponent(s.req.id); else goSection("assessments"); return; }
    if (a === "assessments") return goSection("assessments");
    if (a === "analyze") {
      if (typeof window.analyzeStudentResume === "function") {
        b.disabled = true; b.textContent = "Analysing…";
        Promise.resolve(window.analyzeStudentResume()).finally(load);
      } else openResume();
      return;
    }
    if (a === "share") return goSection("verified-profile");
    if (a === "warmup") return warmup(s && s.req);
    if (a === "remind") return toggleRemind(s && s.req);
    if (a.indexOf("cal-") === 0) return addToCalendar(a.slice(4), s && s.req);
  }

  /* ---------------- reminders ---------------- */
  var remindAt = null;
  function slots() {
    var now = new Date(), out = [];
    var t = new Date(now); t.setHours(20, 0, 0, 0);
    if (t - now > 30 * 60000) out.push(["Tonight, 8 PM", t]);
    var tm = new Date(now); tm.setDate(tm.getDate() + 1); tm.setHours(10, 0, 0, 0); out.push(["Tomorrow, 10 AM", tm]);
    var te = new Date(now); te.setDate(te.getDate() + 1); te.setHours(19, 0, 0, 0); out.push(["Tomorrow, 7 PM", te]);
    var sat = new Date(now); var add = (6 - sat.getDay() + 7) % 7 || 7; sat.setDate(sat.getDate() + add); sat.setHours(11, 0, 0, 0); out.push(["Saturday, 11 AM", sat]);
    return out;
  }
  function toggleRemind(req) {
    var box = card.querySelector(".aldm-remind");
    if (!box.hidden) { box.hidden = true; return; }
    var list = slots();
    box.innerHTML = '<div class="aldm-remind-h">When should we remind you?</div><div class="aldm-slots">' +
      list.map(function (x, i) { return '<button type="button" class="aldm-slot" data-slot="' + i + '">' + esc(x[0]) + "</button>"; }).join("") + "</div>" +
      '<div class="aldm-cal" hidden><span></span><div><button type="button" class="aldm-btn primary sm" data-aldm="cal-google">Google Calendar</button>' +
      '<button type="button" class="aldm-btn ghost sm" data-aldm="cal-ics">Apple / Outlook</button></div></div>';
    box.hidden = false;
    box.querySelectorAll("[data-slot]").forEach(function (sb) {
      sb.onclick = function () {
        remindAt = list[Number(sb.getAttribute("data-slot"))];
        box.querySelectorAll(".aldm-slot").forEach(function (o) { o.classList.toggle("on", o === sb); });
        var cal = box.querySelector(".aldm-cal"); cal.hidden = false;
        cal.querySelector("span").textContent = "Add “" + remindAt[0] + "” to your calendar:";
      };
    });
  }
  function fmt(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function addToCalendar(kind, req) {
    if (!remindAt) return toast("Pick a time first.");
    var start = remindAt[1], end = new Date(start.getTime() + 30 * 60000);
    var skill = req && req.skill ? req.skill : "skill";
    var title = "Aldovra: take your " + skill + " test";
    var details = (req ? req.qcount + " questions, about " + req.minutes + " minutes" : "About 20 minutes") + ". Keep your camera on and sit in a quiet room. Start here: https://aldovra.com/dashboard.html";
    if (kind === "google") {
      var url = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) +
        "&dates=" + fmt(start) + "/" + fmt(end) + "&details=" + encodeURIComponent(details) + "&location=" + encodeURIComponent("https://aldovra.com/dashboard.html");
      window.open(url, "_blank", "noopener");
    } else {
      var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Aldovra//Reminder//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
        "UID:" + Date.now() + "-" + Math.random().toString(36).slice(2) + "@aldovra.com", "DTSTAMP:" + fmt(new Date()), "DTSTART:" + fmt(start), "DTEND:" + fmt(end),
        "SUMMARY:" + title, "DESCRIPTION:" + details.replace(/,/g, "\\,"), "URL:https://aldovra.com/dashboard.html",
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + title, "TRIGGER:-PT10M", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
      var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "aldovra-test-reminder.ics";
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    toast("Reminder set for " + remindAt[0].toLowerCase() + ". See you then.");
    card.querySelector(".aldm-remind").hidden = true;
  }

  /* ---------------- warm-up ---------------- */
  var wm = null;
  async function warmup(req) {
    if (!req || !req.skill_id) return toast("Sample questions aren’t available for this test yet.");
    var r = await db.rpc("get_practice_questions", { p_skill_id: req.skill_id });
    if (r.error) {
      if (/PRACTICE_LIMIT/.test(r.error.message || "")) return toast("You’ve done today’s sample questions. You’re ready for the real test.");
      console.warn("Practice error", r.error);
      return toast("Couldn’t load sample questions right now. Try again in a minute.");
    }
    var qs = (r.data || []).filter(function (q) { return Array.isArray(q.options) && q.options.length; });
    if (!qs.length) return toast("You’ve seen all the sample questions for this skill. You’re ready for the real test.");
    openWarmup(req, qs);
  }
  function openWarmup(req, qs) {
    var st = { i: 0, score: 0, answered: false };
    wm = document.createElement("div");
    wm.className = "aldm-modal";
    wm.setAttribute("role", "dialog"); wm.setAttribute("aria-modal", "true"); wm.setAttribute("aria-labelledby", "aldmWTitle");
    wm.innerHTML = '<div class="aldm-mcard"><button type="button" class="aldm-close" aria-label="Close">' + svg("x") + '</button><div class="aldm-mbody"></div></div>';
    document.body.appendChild(wm);
    document.documentElement.classList.add("aldw-open");
    requestAnimationFrame(function () { wm.classList.add("show"); });
    var body = wm.querySelector(".aldm-mbody");
    function close() { wm.classList.remove("show"); document.documentElement.classList.remove("aldw-open"); setTimeout(function () { wm && wm.remove(); wm = null; }, 220); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    wm.querySelector(".aldm-close").onclick = close;
    wm.addEventListener("click", function (e) { if (e.target === wm) close(); });
    function show() {
      var q = qs[st.i]; st.answered = false;
      body.innerHTML = '<div class="aldm-kicker">' + esc(req.skill) + " warm-up · " + (st.i + 1) + " of " + qs.length + "</div>" +
        '<div class="aldm-mbar"><i style="width:' + Math.round((st.i / qs.length) * 100) + '%"></i></div>' +
        '<h3 id="aldmWTitle" class="aldm-q">' + esc(q.question) + "</h3>" +
        '<div class="aldm-opts">' + q.options.map(function (o, i) { return '<button type="button" class="aldm-opt" data-i="' + i + '"><b>' + "ABCD"[i] + "</b><span>" + esc(o) + "</span></button>"; }).join("") + "</div>" +
        '<div class="aldm-fb" aria-live="polite"></div><div class="aldm-mfoot"><span>Practice only. No camera, no score saved.</span><button type="button" class="aldm-btn primary sm" data-next disabled>' + (st.i === qs.length - 1 ? "See result" : "Next question") + "</button></div>";
      body.querySelectorAll(".aldm-opt").forEach(function (b) {
        b.onclick = function () {
          if (st.answered) return; st.answered = true;
          var pick = Number(b.getAttribute("data-i")), ok = pick === Number(q.correct_index);
          if (ok) st.score++;
          body.querySelectorAll(".aldm-opt").forEach(function (o) {
            var i = Number(o.getAttribute("data-i"));
            o.disabled = true;
            if (i === Number(q.correct_index)) o.classList.add("right");
            else if (i === pick) o.classList.add("wrong");
          });
          body.querySelector(".aldm-fb").innerHTML = ok ? "<b class=\"ok\">Correct.</b> Nice." : "<b class=\"no\">Not quite.</b> The right answer is " + "ABCD"[Number(q.correct_index)] + ".";
          var n = body.querySelector("[data-next]"); n.disabled = false; n.focus();
        };
      });
      body.querySelector("[data-next]").onclick = function () { st.i++; if (st.i < qs.length) show(); else result(); };
      var first = body.querySelector(".aldm-opt"); if (first) first.focus();
    }
    function result() {
      var good = st.score >= Math.ceil(qs.length * 0.66);
      body.innerHTML = '<div class="aldm-res"><div class="aldm-resnum">' + st.score + "<small>/" + qs.length + "</small></div>" +
        '<div class="aldm-kicker">Warm-up done</div><h3 id="aldmWTitle">' + (good ? "You’re ready for the <em>real test.</em>" : "Good practice. <em>You’ve got this.</em>") + "</h3>" +
        '<p class="aldm-sub">The real ' + esc(req.skill) + " test has " + req.qcount + " questions like these, in " + req.minutes + " minutes, with your camera on. Score 75% or more to get verified.</p>" +
        '<div class="aldm-actions"><button type="button" class="aldm-btn primary" data-go-real>' + svg("play") + "Start real test</button>" +
        '<button type="button" class="aldm-btn ghost" data-later>Maybe later</button></div></div>';
      body.querySelector("[data-go-real]").onclick = function () { close(); startTest(req); };
      body.querySelector("[data-later]").onclick = function () { close(); toggleRemind(req); card.scrollIntoView({ behavior: "smooth", block: "center" }); };
      if (good && window.AldoMascot && typeof window.AldoMascot.dance === "function") { try { window.AldoMascot.dance(1500); } catch (e) {} }
    }
    show();
  }

  /* ---------------- boot ---------------- */
  /* reserve the card's space right away so the page below it doesn't jump when data arrives (CLS) */
  (function placeholder() {
    var el = ensureCard();
    if (el && !el.innerHTML) { el.classList.add("aldm-loading"); el.setAttribute("aria-busy", "true"); }
  })();
  document.addEventListener("aldovra:profile-loaded", function () { setTimeout(load, 300); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && data) load(); });
  window.AldMission = { reload: load };
})();
