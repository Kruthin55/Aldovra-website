/* Aldovra polish layer (29 Oct 2026).
   Swaps UI emoji for line icons, keeps section headings clear of the sticky top bar,
   and gives the section you jump to from the sidebar one short arrival motion.
   Loaded last on app pages; it never changes data or behaviour. */
(function () {
  "use strict";
  var P = function (d) { return '<svg class="aldp-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + d + "</svg>"; };
  var ICONS = {
    sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
    moon: P('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>'),
    home: P('<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5.5h4V20"/>'),
    bell: P('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),
    menu: P('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    target: P('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>'),
    chart: P('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'),
    spark: P('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>'),
    note: P('<path d="M7 3.5h7l4 4V20.5H7Z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6"/>'),
    trophy: P('<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4"/>'),
    cap: P('<path d="m2.5 9 9.5-5 9.5 5-9.5 5Z"/><path d="M6.5 11v5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-5"/>'),
    camera: P('<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>'),
    pencil: P('<path d="M4 20l1-4L16.5 4.5l3 3L8 19Z"/><path d="M14 7l3 3"/>'),
    eye: P('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
    video: P('<rect x="3" y="6.5" width="13" height="11" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/>'),
    mic: P('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3.5"/>'),
    monitor: P('<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>'),
    lock: P('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
    user: P('<circle cx="12" cy="8" r="4"/><path d="M4 20.5a8 8 0 0 1 16 0"/>'),
    clock: P('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    check: P('<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>')
  };
  var MAP = {
    "☀️": "sun", "☀": "sun", "🌙": "moon", "🏠": "home", "🔔": "bell", "☰": "menu", "🎯": "target",
    "📊": "chart", "🧠": "spark", "📝": "note", "🏆": "trophy", "🎓": "cap", "📷": "camera", "✏️": "pencil",
    "✏": "pencil", "👀": "eye", "🎥": "video", "🎙️": "mic", "🎙": "mic", "🖥️": "monitor", "🖥": "monitor",
    "🔒": "lock", "👤": "user", "⏱️": "clock", "⏱": "clock"
  };
  var MEDALS = { "🥇": "gold", "🥈": "silver", "🥉": "bronze" };
  var KEYS = Object.keys(MAP).concat(Object.keys(MEDALS)).sort(function (a, b) { return b.length - a.length; });
  // Only UI chrome: never the mascot's speech, job descriptions or anything students typed.
  var SCOPE = ".icon-btn, .mobile-sidebar-btn, .nav-icon, .assessment-guidance-icon, .recommended-empty-icon, " +
    ".notification-empty-icon, .arena-medal, .arena-tier, #aldovraPreviewBanner, button, .btn, " +
    "[class*='-icon'], [class*='Icon'], .info-icon, .card-icon, .feature-icon";
  var SKIP = ".aldo-bubble, .aldo, .ajc, .ald-job-card, textarea, input, [contenteditable], .aldp-done";

  function leadingEmoji(text) {
    var t = text.replace(/^\s+/, "");
    for (var i = 0; i < KEYS.length; i++) if (t.indexOf(KEYS[i]) === 0) return KEYS[i];
    return null;
  }
  function swap(el) {
    if (el.closest(SKIP)) return;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && /^(svg|img)$/i.test(n.nodeName)) return;
      if (n.nodeType !== 3) continue;
      if (!n.nodeValue.trim()) continue;
      var e = leadingEmoji(n.nodeValue);
      if (!e) return;
      var span = document.createElement("span");
      span.className = "aldp-icon";
      if (MEDALS[e]) {
        span.className = "aldp-medal aldp-" + MEDALS[e];
        if (el.classList.contains("arena-medal")) {
          span.textContent = MEDALS[e] === "gold" ? "1" : MEDALS[e] === "silver" ? "2" : "3";
          span.className += " aldp-disc";
        }
      } else {
        span.innerHTML = ICONS[MAP[e]];
      }
      n.nodeValue = n.nodeValue.replace(/^\s+/, "").slice(e.length).replace(/^️/, "");
      el.insertBefore(span, n);
      return;
    }
  }
  function sweep(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(SCOPE)) swap(root);
    root.querySelectorAll(SCOPE).forEach(swap);
  }
  var queued = new Set(), scheduled = false;
  function flush() { scheduled = false; queued.forEach(sweep); queued.clear(); }
  function queue(node) { queued.add(node); if (!scheduled) { scheduled = true; requestAnimationFrame(flush); } }

  /* Section headings land below the sticky top bar (and the preview banner when it shows). */
  function measureTop() {
    var bar = document.querySelector(".topbar"), banner = document.getElementById("aldovraPreviewBanner");
    var shown = banner && getComputedStyle(banner).display !== "none";
    var h = (bar ? bar.getBoundingClientRect().height : 72) + (shown ? banner.getBoundingClientRect().height : 0);
    document.documentElement.style.setProperty("--aldp-top", Math.round(h + 20) + "px");
  }

  /* One arrival motion for the section a student jumps to from the sidebar. */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TARGETS = { assessments: "assessmentsSection", explore: "exploreSection", skills: "skillsSection", tracks: "tracksSection",
    screening: "screeningCallsSection", "premium-verified": "premiumVerifiedSection", "verified-profile": "aldShareProfileCard", jobs: "aldovraJobsSection" };
  function arrive(id) {
    var el = id === "aldShareProfileCard" ? document.querySelector(".ald-share") : document.getElementById(id);
    if (!el || reduce) return;
    el.classList.remove("aldp-arrive");
    void el.offsetWidth;
    el.classList.add("aldp-arrive");
    setTimeout(function () { el.classList.remove("aldp-arrive"); }, 1100);
  }
  document.addEventListener("click", function (ev) {
    var nav = ev.target.closest && ev.target.closest(".sidebar [data-section]");
    if (!nav) return;
    var id = TARGETS[nav.getAttribute("data-section")];
    if (!id) return;
    setTimeout(function () { arrive(id); }, 420);
    // Older scroll code can land the heading under the bar; nudge it into view once scrolling settles.
    var tries = 0;
    (function settle() {
      var el = id === "aldShareProfileCard" ? document.querySelector(".ald-share") : document.getElementById(id);
      if (!el) return;
      var want = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--aldp-top"), 10) || 96;
      var top = el.getBoundingClientRect().top, last = settle.last;
      settle.last = top;
      if (last == null || Math.abs(last - top) > 1) { if (++tries < 20) setTimeout(settle, 120); return; }
      if (top < want - 4) window.scrollBy({ top: top - want, behavior: reduce ? "auto" : "smooth" });
    })();
  });

  /* ---------- Dark mode repair ----------
     Older dashboard CSS hard-codes light backgrounds (#fff, #eef0ff …) and dark text on many cards.
     In dark mode, find those surfaces at runtime and move them onto the dark palette, then lift any
     text inside that ended up too dark or too dim to read. Removed again when switching back to light. */
  function rgbOf(c) { var m = String(c).match(/[\d.]+/g); if (!m || m.length < 3) return null; return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 }; }
  function lumOf(o) { var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(o.r) + 0.7152 * f(o.g) + 0.0722 * f(o.b); }
  var KEEP_LIGHT = ".aldo-bubble, .ald-dock, .ald-dock *, .ald-share-qr, .ald-share-qr *, .ald-ask, .ald-ask *, .aldx-hero-btn, .overview-hero-btn, " +
    ".ald-jobs-tab[aria-pressed=true], .ald-share-btn, .ajc-apply, .ca-btn-light, img, svg, canvas, video, iframe, input[type=checkbox], input[type=radio], input[type=range], .aldp-medal, .arena-tier, [class*='badge'], [class*='pill'], [class*='status'], .chip, .ald-job-new";
  function isDark() { return document.body.classList.contains("dark") || document.documentElement.getAttribute("data-theme") === "dark"; }
  function repairDark() {
    var on = isDark();
    document.querySelectorAll(".aldp-dk-surface, .aldp-dk-ink, .aldp-dk-accent").forEach(function (el) {
      if (!on) el.classList.remove("aldp-dk-surface", "aldp-dk-ink", "aldp-dk-accent");
    });
    if (!on) return;
    var all = document.body.querySelectorAll("div, section, article, aside, li, button, a, label, details, summary, header, footer, nav, input, textarea, select, span, p, strong, small, b, h1, h2, h3, h4, h5, td, th");
    all.forEach(function (el) {
      if (el.classList.contains("aldp-dk-surface") || el.closest(KEEP_LIGHT)) return;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var cs = getComputedStyle(el), bg = rgbOf(cs.backgroundColor);
      if (r.width < 90 || r.height < 26) {
        // small controls: only when both the fill and the text are light (white button, white label)
        var fg = rgbOf(cs.color);
        if (bg && fg && bg.a > 0.6 && lumOf(bg) > 0.72 && lumOf(fg) > 0.5 && /^(BUTTON|A)$/.test(el.tagName)) el.classList.add("aldp-dk-surface");
        return;
      }
      var lightImg = cs.backgroundImage && cs.backgroundImage !== "none" && /gradient/.test(cs.backgroundImage) && /(#f[0-9a-f]{5}|#e[c-f][0-9a-f]{4}|255,\s*255,\s*255|rgb\(2[3-5]\d,\s*2[3-5]\d,\s*2[3-5]\d)/i.test(cs.backgroundImage) && !/rgba\([^)]*,\s*0(\.\d+)?\)/.test(cs.backgroundImage);
      if ((bg && bg.a > 0.6 && lumOf(bg) > 0.72) || lightImg) el.classList.add("aldp-dk-surface");
    });
    // text that is now unreadable on a dark surface
    all.forEach(function (el) {
      if (el.closest(KEEP_LIGHT)) return;
      var hasText = false;
      for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) { hasText = true; break; }
      if (!hasText) return;
      var cs = getComputedStyle(el), c = rgbOf(cs.color);
      if (!c) return;
      // effective background
      var p = el, bg = null;
      while (p && p !== document.documentElement) {
        var b = rgbOf(getComputedStyle(p).backgroundColor);
        if (b && b.a > 0.6) { bg = b; break; }
        if (getComputedStyle(p).backgroundImage !== "none" && !p.classList.contains("aldp-dk-surface")) { bg = null; p = null; break; }
        p = p.parentElement;
      }
      if (!bg) return;
      var lc = lumOf(c), lb = lumOf(bg);
      var ratio = (Math.max(lc, lb) + 0.05) / (Math.min(lc, lb) + 0.05);
      if (ratio >= 4.2 || lb > 0.4) return;
      var sat = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
      el.classList.add(sat > 60 ? "aldp-dk-accent" : "aldp-dk-ink");
    });
  }
  var darkTimer = null;
  function scheduleDark() { clearTimeout(darkTimer); darkTimer = setTimeout(repairDark, 250); }

  function start() {
    document.documentElement.classList.add("aldp");
    sweep(document.body);
    measureTop();
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (m.type === "characterData") { if (m.target.parentElement) queue(m.target.parentElement); return; }
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1) queue(n); else if (n.nodeType === 3 && n.parentElement) queue(n.parentElement); });
        if (m.addedNodes.length) scheduleDark();
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", measureTop);
    new MutationObserver(scheduleDark).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(scheduleDark).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("toggle", scheduleDark, true);
    document.addEventListener("click", function () { setTimeout(scheduleDark, 120); }, true);
    scheduleDark();
    setTimeout(repairDark, 2500);
    var pb = document.getElementById("aldovraPreviewBanner");
    if (pb) new MutationObserver(measureTop).observe(pb, { attributes: true, attributeFilter: ["style", "class"] });
    setTimeout(measureTop, 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.AldPolish = { icons: ICONS, sweep: sweep };
})();
