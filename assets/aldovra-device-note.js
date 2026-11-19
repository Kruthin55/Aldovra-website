/* Aldovra device note (19 Nov 2026).
   Phones can browse jobs and results fine, but the proctored exam needs a laptop/desktop
   (camera + screen sharing + fullscreen; phone browsers cannot share the screen).
   Usage: <script src="/assets/aldovra-device-note.js" data-mode="dashboard|exam" defer></script>
   dashboard: small dismissible strip at the top of <main> (hidden for 7 days after "Got it").
   exam: a strip that stays, placed above the exam start card.
   Only shown on touch devices whose browser cannot share the screen. */
(function () {
  "use strict";
  var me = document.currentScript;
  var mode = (me && me.getAttribute("data-mode")) || "dashboard";
  var KEY = "aldovra-device-note-hidden-until";

  function isPhoneLike() {
    var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    var canShare = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    return coarse && !canShare;
  }
  function hiddenForNow() {
    try { return Number(localStorage.getItem(KEY) || 0) > Date.now(); } catch (e) { return false; }
  }

  function css() {
    if (document.getElementById("aldDnCss")) return;
    var s = document.createElement("style");
    s.id = "aldDnCss";
    s.textContent =
      ".ald-dn{display:flex;gap:12px;align-items:flex-start;margin:0 0 16px;padding:14px 16px;border:1px solid #cfe3d4;background:#e3efe5;color:#0d0d12;border-radius:14px;font:14px/1.45 'Inter Tight',Inter,system-ui,sans-serif}" +
      ".ald-dn svg{flex:none;width:22px;height:22px;margin-top:1px;color:#14532d}" +
      ".ald-dn b{display:block;font-size:15px;margin-bottom:2px}" +
      ".ald-dn p{margin:0;color:#33413a}" +
      ".ald-dn .row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}" +
      ".ald-dn button{font-family:inherit;font-weight:600;font-size:13.5px;line-height:1;padding:9px 14px;border-radius:999px;border:1px solid #14532d;background:#14532d;color:#fff;cursor:pointer}" +
      ".ald-dn button.ghost{background:transparent;color:#14532d}" +
      ".ald-dn .ok{margin-left:auto;align-self:flex-start;border:0;background:none;color:#33413a;font-size:20px;line-height:1;padding:0 2px}" +
      "html[data-theme=dark] .ald-dn,body.dark .ald-dn{background:#16251b;border-color:#24402c;color:#eef2ee}" +
      "html[data-theme=dark] .ald-dn p,body.dark .ald-dn p{color:#b9c6bd}" +
      "html[data-theme=dark] .ald-dn svg,body.dark .ald-dn svg{color:#7cc495}";
    document.head.appendChild(s);
  }

  function sendToLaptop(btn) {
    var url = location.origin + (mode === "exam" ? location.pathname + location.search : "/dashboard.html");
    var text = "Open Aldovra on my laptop to take the skill test: " + url;
    if (navigator.share) {
      navigator.share({ title: "Aldovra", text: "Open on my laptop to take the skill test", url: url }).catch(function () {});
      return;
    }
    var done = function () { btn.textContent = "Link copied"; setTimeout(function () { btn.textContent = "Send link to my laptop"; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { location.href = "https://wa.me/?text=" + encodeURIComponent(text); });
    else location.href = "https://wa.me/?text=" + encodeURIComponent(text);
  }

  function mount() {
    if (!isPhoneLike()) return;
    if (mode === "dashboard" && hiddenForNow()) return;
    var main = document.querySelector("main");
    if (!main || document.querySelector(".ald-dn")) return;
    css();
    var box = document.createElement("div");
    box.className = "ald-dn";
    box.setAttribute("role", "note");
    var exam = mode === "exam";
    box.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/></svg>' +
      "<div><b>" + (exam ? "Please take this test on a laptop or desktop" : "Taking a skill test? Use a laptop") + "</b>" +
      "<p>" + (exam
        ? "The proctored test needs your camera, screen sharing and fullscreen, and phone browsers cannot share the screen. Open this page on a laptop or desktop with Chrome or Edge."
        : "Jobs, results and your profile work fine on your phone. The proctored skill test needs a laptop or desktop (camera + screen sharing).") + "</p>" +
      '<div class="row"><button type="button" class="send">Send link to my laptop</button></div></div>' +
      (exam ? "" : '<button type="button" class="ok" aria-label="Hide this note">×</button>');
    main.insertBefore(box, main.firstChild);
    box.querySelector(".send").addEventListener("click", function (e) { sendToLaptop(e.currentTarget); });
    var ok = box.querySelector(".ok");
    if (ok) ok.addEventListener("click", function () {
      try { localStorage.setItem(KEY, String(Date.now() + 7 * 86400000)); } catch (e) {}
      box.remove();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
