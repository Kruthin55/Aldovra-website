/* Aldovra student dashboard: section reveals, job-card spotlight, and Aldo the helper. */
(function () {
  "use strict";
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };


  /* ---------- line icons instead of emoji in the sidebar ---------- */
  var ICONS = {
    overview: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>',
    assessments: '<path d="M8 4h8l3 3v13H5V4z"/><path d="M9 12l2 2 4-4"/>',
    skills: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
    screening: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    tracks: '<path d="M4 19l5-5 4 4 7-8"/><path d="M15 10h5v5"/>',
    explore: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4"/>',
    jobs: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>'
  };
  $$(".sidebar .nav-item").forEach(function (item) {
    var icon = item.querySelector(".nav-icon");
    if (!icon) return;
    var key = item.hasAttribute("data-ald-jobs-nav") ? "jobs" : item.getAttribute("data-section") || (/log ?out/i.test(item.textContent) ? "logout" : "");
    if (!ICONS[key]) return;
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[key] + "</svg>";
  });

  /* ---------- PayU return: ?payment=success|failed|pending ---------- */
  var payResult = null;
  try { payResult = new URLSearchParams(location.search).get("payment"); } catch (e) {}
  if (payResult) {
    var msgs = {
      success: ["Payment successful 🎉", "Your paid reattempt is unlocked. Open Assessments and start when you're ready.", "ok"],
      pending: ["Payment is being confirmed ⏳", "PayU is still confirming your payment. Refresh in a few minutes; if money was deducted it will be credited or refunded automatically.", "wait"],
      failed: ["Payment didn't go through", "No reattempt was unlocked. If money was deducted, PayU refunds it automatically. You can try again from Assessments.", "bad"]
    };
    var forSkill = false;
    try { forSkill = new URLSearchParams(location.search).get("for") === "skill"; } catch (e) {}
    if (forSkill) msgs.success = ["Payment successful 🎉", "Your new skill verification is unlocked. Open Assessments and start when you're ready.", "ok"];
    var m = msgs[payResult] || msgs.failed;
    var toast = document.createElement("div");
    toast.className = "ald-pay-toast " + m[2];
    toast.setAttribute("role", "status");
    toast.innerHTML = "<strong></strong><p></p><button type=\"button\" aria-label=\"Close\">✕</button>";
    toast.querySelector("strong").textContent = m[0];
    toast.querySelector("p").textContent = m[1];
    toast.querySelector("button").addEventListener("click", function () { toast.remove(); });
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add("show"); }, 60);
    setTimeout(function () { toast.classList.remove("show"); setTimeout(function () { toast.remove(); }, 600); }, 12000);
    window.__aldPayResult = payResult;
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
    setTimeout(function () {
      var nav = document.querySelector('.sidebar .nav-item[data-section="assessments"]');
      if (nav && payResult !== "failed") nav.click();
    }, 1800);
  }

  /* ---------- deep links: dashboard.html#assessments / #jobs ---------- */
  (function () {
    var h = (location.hash || "").replace("#", "");
    if (!h) return;
    setTimeout(function () {
      var nav = h === "jobs" ? document.querySelector(".sidebar .nav-item[data-ald-jobs-nav]") : document.querySelector('.sidebar .nav-item[data-section="' + h + '"]');
      if (nav) nav.click();
    }, 1200);
  })();

  /* ---------- section reveals ---------- */
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
    var targets = $$("main > .container > section, main > section, .grid-stats > *");
    targets.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.9 && r.bottom > 0) return; // already on screen: leave it alone
      el.classList.add("ald-dv");
      var idx = el.parentNode && el.parentNode.classList.contains("grid-stats") ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
      el.style.setProperty("--d", idx * 70 + "ms");
      io.observe(el);
    });
    // Safety: never leave anything hidden (tall sections, sections shown later, slow devices).
    var sweep = function () { $$(".ald-dv:not(.in)").forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add("in"); }); };
    addEventListener("scroll", function () { requestAnimationFrame(sweep); }, { passive: true });
    setTimeout(sweep, 2500);
    // Jobs section is huge and filled late: never animate it, just show it.
    $$("#aldovraJobsSection, #premiumVerifiedSection").forEach(function (el) { el.classList.remove("ald-dv"); el.classList.add("in"); });
  }

  /* ---------- job card spotlight ---------- */
  var grid = document.getElementById("aldJobsGrid");
  if (grid && !reduce) {
    grid.addEventListener("pointermove", function (e) {
      var card = e.target.closest && e.target.closest(".ajc");
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", e.clientX - r.left + "px");
      card.style.setProperty("--my", e.clientY - r.top + "px");
    }, { passive: true });
  }

  /* ---------- Aldo dock ---------- */
  if (!window.AldoMascot) return;
  var dock = document.createElement("div");
  dock.className = "ald-dock";
  var x = document.createElement("button");
  x.type = "button"; x.className = "ald-dock-x";
  dock.appendChild(x);
  document.body.appendChild(dock);
  var aldo = AldoMascot.create(dock, { bubble: "left" });
  var minimized = store.get("aldovra-dock-min") === "1";
  function setMin(m) {
    minimized = m;
    dock.classList.toggle("min", m);
    store.set("aldovra-dock-min", m ? "1" : "0");
    x.textContent = m ? "+" : "–";
    x.setAttribute("aria-label", m ? "Show Aldo" : "Hide Aldo");
    if (m) aldo.say("");
    if (typeof roamer !== "undefined" && roamer) { if (m) roamer.pause(); else roamer.resume(); }
  }
  setMin(minimized);
  x.addEventListener("click", function (e) { e.stopPropagation(); setMin(!minimized); });
  setTimeout(function () { dock.classList.add("on"); }, reduce ? 0 : 1200);

  /* Desktop: walk along the bottom of the screen after the mouse. Mobile: bottom-right corner. */
  var bubble = dock.querySelector(".aldo-bubble");
  /* On desktop she walks only inside the sidebar, so she never covers cards or buttons. */
  function sidebarBounds() {
    var sb = document.querySelector(".sidebar");
    var r = sb ? sb.getBoundingClientRect() : null;
    if (!r || innerWidth < 900 || r.width < 170 || r.left < -1 || r.right > innerWidth / 2) return null;
    var aw = (dock.querySelector(".aldo") || dock).offsetWidth || 110;
    return { min: r.left + 6, max: r.right - aw - 6 };
  }
  var roamer = AldoMascot.roam(dock, aldo, { minX: 8, bounds: sidebarBounds });
  if (roamer.active) { bubble.classList.remove("left"); if (minimized) roamer.pause(); }
  function markSide() { dock.classList.toggle("in-sidebar", !!(roamer.active && sidebarBounds())); }
  markSide();
  addEventListener("resize", markSide);
  /* Phones: Aldo says hello, then tucks down so she never covers cards (not saved; tap + to bring her back). */
  if (!roamer.active && innerWidth < 900 && !minimized) {
    var tucked = false;
    var tuck = function () {
      if (tucked || minimized) return;
      tucked = true; minimized = true;
      dock.classList.add("min"); x.textContent = "+"; x.setAttribute("aria-label", "Show Aldo"); aldo.say("");
    };
    setTimeout(tuck, 8000);
    addEventListener("scroll", function () { if (scrollY > 160) tuck(); }, { passive: true });
  }
  function place() {
    if (roamer.active) return;
    var sb = document.querySelector(".sidebar");
    var r = sb ? sb.getBoundingClientRect() : null;
    var side = !!(r && innerWidth >= 900 && r.width >= 170 && r.left >= -1 && r.right <= innerWidth / 2);
    dock.classList.toggle("side", side);
    if (side) {
      dock.style.left = (r.left + r.width / 2) + "px";
      dock.style.setProperty("--dock-bubble-max", Math.max(150, r.width - 20) + "px");
      bubble.classList.remove("left");
    } else {
      dock.style.left = "";
      bubble.classList.add("left");
    }
  }
  place();
  addEventListener("resize", place);

  function say(text, mood, ms) {
    if (minimized) return;
    if (mood) aldo.mood(mood, ms || 2600);
    aldo.say(text, ms);
  }

  function firstName() {
    var el = document.getElementById("profileName");
    var v = el && el.value ? el.value.trim() : "";
    return v ? v.split(/\s+/)[0].slice(0, 18) : "";
  }
  var greeted = false;
  function greet() {
    if (greeted) return;
    greeted = true;
    if (window.__aldPayResult) {
      if (window.__aldPayResult === "success") { aldo.jump(); say("Payment done! Your reattempt is ready — all the best 💪", "excited", 5000); }
      else if (window.__aldPayResult === "pending") { say("Hmm, PayU is still confirming. Check back in a bit ⏳", "think", 5000); }
      else { aldo.shake(); say("Payment didn't go through. No worries, try again anytime 🙂", "sad", 5000); }
      return;
    }
    var n = firstName();
    var hour = new Date().getHours();
    var part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    if (!minimized) aldo.wave();
    say(part + (n ? ", " + n : "") + "! 👋 Ready to prove some skills today?", "happy", 5200);
  }
  var waited = 0;
  (function waitForName() {
    if (firstName() || waited > 6000) { setTimeout(greet, 600); return; }
    waited += 400; setTimeout(waitForName, 400);
  })();

  var tips = [
    "Score 75%+ in an assessment to get verified ✓",
    "New fresher jobs are added every day — check back often 💼",
    "Save jobs you like so you can track them 📌",
    "A complete profile helps recruiters trust you ✨",
    "Climb the leaderboard as you prove more skills 🏆",
    "Hehe, that tickles! 😆"
  ];
  var ti = 0;
  dock.querySelector(".aldo").addEventListener("click", function () {
    if (minimized) { setMin(false); return; }
    aldo.jump();
    say(tips[ti++ % tips.length], "excited", 3200);
  });

  /* react to navigation and job actions */
  var navLines = {
    overview: ["Here's your progress at a glance 📊", "happy"],
    assessments: ["Pick a skill and give it your best 💪", "excited"],
    skills: ["Add the skills you can really prove 🧠", "happy"],
    explore: ["Let's see where you rank in the Arena 🏆", "excited"],
    profile: ["A complete profile = more trust from recruiters ✨", "happy"],
    jobs: ["Fresh jobs land every day — apply early! 💼", "excited"]
  };
  var tabLines = {
    recommended: "These match your skills best 🎯",
    verified: "Jobs that match your verified skills ✓",
    all: "Every live fresher job, in one place 🔎",
    saved: "Your saved jobs live here 📌",
    applied: "Jobs you've applied to — fingers crossed 🤞"
  };
  var lastSay = 0;
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var now = Date.now();
    var nav = t.closest(".sidebar .nav-item");
    if (nav) {
      var key = nav.hasAttribute("data-ald-jobs-nav") ? "jobs" : nav.getAttribute("data-section");
      if (navLines[key] && now - lastSay > 900) { lastSay = now; say(navLines[key][0], navLines[key][1], 3200); }
      return;
    }
    var tab = t.closest("[data-ald-job-tab]");
    if (tab && !tab.disabled) { var k = tab.getAttribute("data-ald-job-tab"); if (tabLines[k]) say(tabLines[k], "happy", 2600); return; }
    var save = t.closest("[data-ald-save]");
    if (save && !save.disabled) {
      save.classList.add("just-saved");
      setTimeout(function () { save.classList.remove("just-saved"); }, 600);
      aldo.jump(); say("Saved! I'll keep it in Saved & tracked 📌", "excited", 2600); return;
    }
    if (t.closest("[data-ald-apply]")) { aldo.jump(); say("All the best! You've got this 🤞", "excited", 3000); return; }
    if (t.closest("[data-ald-refresh-jobs]")) { say("Fetching the freshest jobs… ↻", "think", 2400); return; }
    if (t.closest("[data-ald-report-job]")) { say("Thanks for reporting — it helps everyone 🙏", "happy", 2600); }
  }, true);

  /* watch the eyes follow the search box while typing */
  var search = document.getElementById("aldJobSearch");
  if (search) {
    search.addEventListener("focus", function () { aldo.lookAtElement(search, 0.2).mood("think"); });
    search.addEventListener("input", function () { aldo.lookAtElement(search, Math.min(1, search.value.length / 30)); });
    search.addEventListener("blur", function () { aldo.release().mood("idle"); });
  }
})();
