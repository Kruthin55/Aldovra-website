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

  /* ---------- section reveals ---------- */
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    var targets = $$("main > .container > section, main > section, .grid-stats > *");
    targets.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.9 && r.bottom > 0) return; // already on screen: leave it alone
      el.classList.add("ald-dv");
      var idx = el.parentNode && el.parentNode.classList.contains("grid-stats") ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
      el.style.setProperty("--d", idx * 70 + "ms");
      io.observe(el);
    });
    // Safety: never leave anything hidden.
    setTimeout(function () { $$(".ald-dv:not(.in)").forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top < innerHeight) el.classList.add("in"); }); }, 2500);
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
  }
  setMin(minimized);
  x.addEventListener("click", function (e) { e.stopPropagation(); setMin(!minimized); });
  setTimeout(function () { dock.classList.add("on"); }, reduce ? 0 : 1200);

  /* Desktop: live at the bottom of the sidebar. Mobile: bottom-right corner. */
  var bubble = dock.querySelector(".aldo-bubble");
  function place() {
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
