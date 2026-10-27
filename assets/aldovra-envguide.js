/* Aldovra environment-video guide: a 30-sec explainer in a modal.
   Any element with [data-env-guide] opens it. AldovraEnvGuide.open() works too. */
(function (global) {
  "use strict";
  var SRC = "/assets/env-video-guide.mp4", POSTER = "/assets/env-video-guide.jpg";
  var css =
    ".aeg-btn{display:inline-flex;align-items:center;gap:10px;padding:10px 16px 10px 10px;border-radius:999px;border:1px solid rgba(79,70,229,.3);background:linear-gradient(100deg,rgba(79,70,229,.08),rgba(124,58,237,.08));color:#4338ca;font:600 14px/1.2 'Inter Tight',Inter,system-ui,sans-serif;cursor:pointer;transition:transform .3s,box-shadow .3s}" +
    ".aeg-btn:hover{transform:translateY(-1px);box-shadow:0 10px 24px -14px rgba(79,70,229,.7)}" +
    ".aeg-btn i{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-style:normal;font-size:11px;box-shadow:0 0 0 0 rgba(124,58,237,.5);animation:aegPulse 2.2s infinite}" +
    "@keyframes aegPulse{70%{box-shadow:0 0 0 10px rgba(124,58,237,0)}100%{box-shadow:0 0 0 0 rgba(124,58,237,0)}}" +
    "[data-theme=dark] .aeg-btn{color:#c7c2ff;border-color:rgba(167,139,250,.35)}" +
    ".aeg-modal{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:16px;background:rgba(13,13,18,.72);backdrop-filter:blur(6px);opacity:0;transition:opacity .3s}" +
    ".aeg-modal.on{opacity:1}" +
    ".aeg-box{width:min(960px,100%);border-radius:18px;overflow:hidden;background:#0d0d12;box-shadow:0 40px 90px -30px rgba(0,0,0,.7);transform:translateY(16px) scale(.98);transition:transform .45s cubic-bezier(.22,1,.36,1)}" +
    ".aeg-modal.on .aeg-box{transform:none}" +
    ".aeg-box video{display:block;width:100%;aspect-ratio:16/9;background:#f3f2ee}" +
    ".aeg-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;color:#e8e6f5;font:500 13px/1.4 'Inter Tight',Inter,system-ui,sans-serif}" +
    ".aeg-bar button{white-space:nowrap;flex:none;border:0;border-radius:999px;padding:8px 16px;background:#fff;color:#0d0d12;font-weight:600;cursor:pointer}" +
    ".aeg-inline{position:relative;border-radius:14px;overflow:hidden;background:#f3f2ee}" +
    ".aeg-inline video{display:block;width:100%;aspect-ratio:16/9}";
  function injectCss() {
    if (document.getElementById("aeg-css")) return;
    var s = document.createElement("style"); s.id = "aeg-css"; s.textContent = css; document.head.appendChild(s);
  }
  function open() {
    injectCss();
    var m = document.createElement("div");
    m.className = "aeg-modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "How to record your exam environment video");
    m.innerHTML = '<div class="aeg-box"><video src="' + SRC + '" poster="' + POSTER + '" controls autoplay muted playsinline preload="auto"></video>' +
      '<div class="aeg-bar"><span>Phone in landscape → record → upload to YouTube as <b>Unlisted</b> → paste the link.</span><button type="button">Got it</button></div></div>';
    function close() { m.classList.remove("on"); document.removeEventListener("keydown", onKey); setTimeout(function () { m.remove(); }, 300); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m || e.target.tagName === "BUTTON") close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add("on"); });
    var v = m.querySelector("video"); var p = v.play && v.play(); if (p && p.catch) p.catch(function () {});
  }
  function button(label) {
    injectCss();
    var b = document.createElement("button");
    b.type = "button"; b.className = "aeg-btn"; b.setAttribute("data-env-guide", "");
    b.innerHTML = "<i>▶</i>" + (label || "Watch the 30-sec video guide");
    return b;
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-env-guide]");
    if (t) { e.preventDefault(); open(); }
  });
  injectCss();
  global.AldovraEnvGuide = { open: open, button: button, src: SRC, poster: POSTER };
})(window);
