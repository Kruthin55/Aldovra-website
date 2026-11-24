/* Channel join popup + Aldovra roadmap card (24 Nov 2026).
   Founder's plan: get every student into the WhatsApp / Telegram channels for daily jobs and tips, and explain the
   two phases honestly: Q1 2027 is the verification window (pool of 500–1,000 verified freshers); from Q2 2027 verified profiles
   go to recruiters who join Aldovra. No promise of interviews or jobs.
   WhatsApp channels never reveal followers, so clicks are logged in channel_join_clicks (admin → Channels). */
(function () {
  "use strict";
  if (typeof db === "undefined") return;

  var WA = "https://whatsapp.com/channel/0029VbEAgbc9Gv7PYRDHFP3e";
  var TG = "https://t.me/aldovrajobs";
  var KEY = "aldovra-channels-state";      // "joined" | "<timestamp until which the popup stays hidden>"
  var VISITS = "aldovra-visit-count";
  var userId = null, shown = false;

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  }
  function ss(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; }
  }
  function log(channel, action, place) {
    if (!userId) return;
    db.from("channel_join_clicks").insert({ channel: channel, action: action, place: place }).then(function () {}, function () {});
  }
  function icon(name) {
    return '<img src="/assets/icons/' + name + '.svg" alt="" width="18" height="18">';
  }
  function hiddenNow() {
    var v = ls(KEY);
    if (v === "joined") return true;
    var until = Number(v || 0);
    return until && until > Date.now();
  }
  function modalOpen() {
    var list = document.querySelectorAll('[aria-modal="true"], .modal.show, .modal.active, .profile-modal.active');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.offsetParent !== null || getComputedStyle(el).position === "fixed") {
        if (getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden") return true;
      }
    }
    return false;
  }

  /* ---------------- popup ---------------- */
  function closePopup(box, state) {
    if (state) ls(KEY, state);
    box.classList.remove("in");
    setTimeout(function () { box.remove(); }, 220);
    document.removeEventListener("keydown", box._esc);
  }
  function showPopup() {
    if (shown || hiddenNow()) return;
    if (modalOpen()) { setTimeout(showPopup, 8000); return; }
    shown = true;
    var box = document.createElement("div");
    box.className = "aldch";
    box.innerHTML =
      '<div class="aldch-card" role="dialog" aria-modal="true" aria-labelledby="aldchTitle">' +
        '<button class="aldch-x" type="button" aria-label="Close" data-ch="later">×</button>' +
        '<div class="aldch-kicker">Free · daily</div>' +
        '<h2 id="aldchTitle">Get fresher jobs on WhatsApp every morning</h2>' +
        "<ul>" +
          "<li>New fresher jobs from company career sites, checked every day</li>" +
          "<li>Short tips to clear your skill test and get verified</li>" +
          "<li>First news when verified profiles open to recruiters in Q2 2027</li>" +
        "</ul>" +
        '<div class="aldch-btns">' +
          '<a class="aldch-wa" href="' + WA + '" target="_blank" rel="noopener" data-ch="whatsapp">' + icon("whatsapp") + "Join WhatsApp channel</a>" +
          '<a class="aldch-tg" href="' + TG + '" target="_blank" rel="noopener" data-ch="telegram">' + icon("telegram") + "Join Telegram</a>" +
        "</div>" +
        '<p class="aldch-note">WhatsApp channels keep your number private. Nobody in the channel can see it.</p>' +
        '<div class="aldch-foot"><button type="button" data-ch="already">I have already joined</button><button type="button" data-ch="later">Maybe later</button></div>' +
      "</div>";
    document.body.appendChild(box);
    requestAnimationFrame(function () { box.classList.add("in"); });
    box._esc = function (e) { if (e.key === "Escape") closePopup(box, String(Date.now() + 7 * 864e5)); };
    document.addEventListener("keydown", box._esc);
    box.addEventListener("click", function (e) {
      var t = e.target.closest("[data-ch]");
      if (!t) { if (e.target === box) closePopup(box, String(Date.now() + 7 * 864e5)); return; }
      var k = t.getAttribute("data-ch");
      if (k === "whatsapp" || k === "telegram") { log(k, "join", "popup"); setTimeout(function () { closePopup(box, "joined"); }, 300); return; }
      if (k === "already") { log("whatsapp", "already", "popup"); closePopup(box, "joined"); return; }
      closePopup(box, String(Date.now() + 7 * 864e5));
    });
    var first = box.querySelector(".aldch-wa");
    if (first) first.focus({ preventScroll: true });
  }
  function schedulePopup() {
    if (hiddenNow()) return;
    if (!ss("aldovra-visit-counted")) { ss("aldovra-visit-counted", "1"); ls(VISITS, String(Number(ls(VISITS) || 0) + 1)); }
    var visits = Number(ls(VISITS) || 1);
    // Second visit onwards: after a few seconds. First visit: let the student look around for 25 s first.
    setTimeout(showPopup, visits >= 2 ? 4000 : 25000);
  }

  /* ---------------- roadmap card ---------------- */
  function goSection(s) {
    var nav = document.querySelector('.sidebar .nav-item[data-section="' + s + '"]');
    if (nav) nav.click();
  }
  function roadmap() {
    if (document.getElementById("aldRoad")) return;
    var anchor = document.getElementById("aldResumeCard") || document.querySelector(".aldm") || document.querySelector(".overview-hero");
    if (!anchor || !anchor.parentNode) return;
    var el = document.createElement("section");
    el.id = "aldRoad";
    el.className = "aldrd";
    el.setAttribute("aria-labelledby", "aldRoadTitle");
    el.innerHTML =
      '<div class="aldrd-head"><div class="aldrd-kicker">The Aldovra plan</div>' +
        '<h3 id="aldRoadTitle">A bridge between <em>verified freshers</em> and recruiters</h3></div>' +
      '<ol class="aldrd-phases">' +
        '<li class="now"><span class="aldrd-tag">Now to Q1 2027 · verification window</span><b>Prove your skills</b>' +
          "<p>We are building a pool of 500 to 1,000 verified freshers while we bring startups and companies onto Aldovra. Meanwhile, apply free to fresher jobs from company career sites, checked every day.</p></li>" +
        '<li><span class="aldrd-tag">Q2 2027 · from April</span><b>Verified profiles go to recruiters</b>' +
          "<p>Recruiters who join Aldovra search the verified pool by role and city. Verified students are the ones they see; then you prove yourself in their interviews.</p></li>" +
      "</ol>" +
      '<p class="aldrd-honest">Honest promise: we never sell jobs or promise interviews. Your first test is free; after that each test is ₹49 (about one masala dosa) and pays only for the proctored test and its review.</p>' +
      '<div class="aldrd-act"><button type="button" class="aldrd-main" data-rd="test">Start my verification</button>' +
        '<a href="' + WA + '" target="_blank" rel="noopener" data-rd="whatsapp">' + icon("whatsapp") + "Daily updates on WhatsApp</a>" +
        '<a href="' + TG + '" target="_blank" rel="noopener" data-rd="telegram">' + icon("telegram") + "Telegram</a></div>";
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
    el.addEventListener("click", function (e) {
      var t = e.target.closest("[data-rd]");
      if (!t) return;
      var k = t.getAttribute("data-rd");
      if (k === "test") { goSection("assessments"); return; }
      log(k, "join", "card");
      if (ls(KEY) !== "joined") ls(KEY, "joined");
    });
  }

  document.addEventListener("aldovra:profile-loaded", function (e) {
    userId = e && e.detail && e.detail.user ? e.detail.user.id : null;
    setTimeout(roadmap, 1200);
    setTimeout(roadmap, 4000);   // the mission / resume cards may arrive later; insert once they exist
    schedulePopup();
  });
  // Jobs-section WhatsApp/Telegram strip (dash-jobs-value.js) also counts.
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("#aldvWaBox a, .aldv-tg");
    if (!a || !userId) return;
    log(/t\.me/.test(a.href) ? "telegram" : "whatsapp", "join", "jobs");
  });
})();
