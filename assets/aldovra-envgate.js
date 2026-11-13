/* Environment-video gate (13 Nov 2026). On the exam page the student must watch the whole
   guide video (inline or full-screen) before the "I have read the rules" box unlocks.
   Forward seeking past what was watched is pulled back and speed-ups are reset to 1x.
   Watching once per browser per video version is enough (localStorage). */
(function () {
  "use strict";
  var VERSION = "20261112"; // bump when assets/env-video-guide.mp4 changes
  var KEY = "aldovra-envguide-watched";
  var box = document.getElementById("preExamRulesAgreement");
  var inline = document.querySelector(".mobile-recording-guide video");
  if (!box || !inline) return;

  var done = false;
  try { done = localStorage.getItem(KEY) === VERSION; } catch (e) {}
  var watched = 0, duration = 64;

  var css = document.createElement("style");
  css.textContent =
    ".aeg-gate{margin:10px 10px 14px;padding:12px 14px;border-radius:12px;background:#fff7e0;border:1px solid #f2d27a;color:#5b4300;font:600 14px/1.4 Inter,system-ui,sans-serif}" +
    ".aeg-gate.ok{background:#e3efe5;border-color:#bcd8c3;color:#14532d}" +
    ".aeg-gate .bar{height:6px;border-radius:99px;background:rgba(0,0,0,.08);margin-top:8px;overflow:hidden}" +
    ".aeg-gate .bar i{display:block;height:100%;width:0;background:#14532d;transition:width .4s}" +
    ".aeg-locked{opacity:.5;cursor:not-allowed}" +
    "[data-theme=dark] .aeg-gate{background:#2a2412;border-color:#5b4a1a;color:#f2d27a}[data-theme=dark] .aeg-gate.ok{background:#1c2b21;border-color:#2c4a35;color:#7cc495}";
  document.head.appendChild(css);

  var gate = document.createElement("div");
  gate.className = "aeg-gate";
  gate.setAttribute("role", "status");
  gate.setAttribute("aria-live", "polite");
  gate.innerHTML = '<span class="t"></span><div class="bar"><i></i></div>';
  var wrap = inline.closest(".mobile-guide-image-wrap") || inline.parentNode;
  wrap.appendChild(gate);
  var label = box.closest("label");

  function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function render() {
    if (done) {
      gate.classList.add("ok");
      gate.querySelector(".t").textContent = "✓ You watched the setup video. You can continue.";
      gate.querySelector(".bar").style.display = "none";
      box.disabled = false;
      if (label) label.classList.remove("aeg-locked");
      return;
    }
    gate.querySelector(".t").textContent =
      "Watch the full setup video to continue (" + fmt(watched) + " / " + fmt(duration) + "). Press play above.";
    gate.querySelector(".bar i").style.width = Math.min(100, (watched / duration) * 100) + "%";
    box.checked = false;
    box.disabled = true;
    var btn = document.getElementById("continuePreExamRulesBtn");
    if (btn) btn.disabled = true;
    if (label) label.classList.add("aeg-locked");
  }
  function finish() {
    done = true;
    try { localStorage.setItem(KEY, VERSION); } catch (e) {}
    render();
  }

  function track(v) {
    var last = 0;
    v.addEventListener("loadedmetadata", function () { if (isFinite(v.duration) && v.duration > 0) { duration = v.duration; render(); } });
    v.addEventListener("ratechange", function () { if (!done && v.playbackRate > 1) v.playbackRate = 1; });
    v.addEventListener("seeking", function () {
      if (done) return;
      if (v.currentTime > watched + 1.5) v.currentTime = watched; // no skipping ahead
    });
    v.addEventListener("timeupdate", function () {
      if (done || v.seeking) return;
      var t = v.currentTime;
      if (t > watched && t - last < 2.5 && t <= watched + 2.5) watched = t; // count only real playback
      last = t;
      render();
      if (duration && watched >= duration - 1) finish();
    });
    v.addEventListener("ended", function () { if (!done && duration && watched >= duration - 2) finish(); });
    if (isFinite(v.duration) && v.duration > 0) duration = v.duration;
  }

  track(inline);
  if (window.AldovraEnvGuide) {
    window.AldovraEnvGuide.onVideo = function (v) {
      if (done) return;
      track(v);
      var resume = function () { try { v.currentTime = watched; } catch (e) {} };
      if (v.readyState >= 1) resume(); else v.addEventListener("loadedmetadata", resume, { once: true });
    };
  }
  render();
})();
