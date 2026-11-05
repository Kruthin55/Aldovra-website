/* Aldovra motion layer (5 Nov 2026): the home page's motion on every other page.
   Load in <head> (not deferred) with assets/aldovra-motion.css:
     <script src="/assets/aldovra-motion.js" data-motion="full|lite"></script>
   full: curtain in/out, grain, cursor ring, scroll progress, split h1/h2, staggered reveals,
         card lift, magnetic buttons.
   lite (dashboard): curtain in/out, cursor ring, magnetic [data-magnetic] only.
   Skips everything under prefers-reduced-motion. Never hides content unless
   IntersectionObserver exists, and a failsafe reveals everything after 3 s. */
(function () {
  "use strict";
  var doc = document, html = doc.documentElement;
  var me = doc.currentScript;
  var mode = (me && me.getAttribute("data-motion")) || html.getAttribute("data-motion") || "full";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  html.classList.add("aldm-boot");
  setTimeout(function () { html.classList.remove("aldm-boot"); }, 1400);

  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  var hasIO = "IntersectionObserver" in window;

  function ready(fn) { if (doc.readyState !== "loading") fn(); else doc.addEventListener("DOMContentLoaded", fn); }

  ready(function () {
    var body = doc.body;
    if (!body) return;

    /* ---------- leave transition ---------- */
    var leave = doc.createElement("div");
    leave.className = "aldm-leave";
    leave.setAttribute("aria-hidden", "true");
    body.appendChild(leave);
    window.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a || a.hasAttribute("download") || a.hasAttribute("data-no-transition")) return;
      if (a.target && a.target !== "_self") return;
      var url;
      try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page / hash jump
      e.preventDefault();
      html.classList.add("aldm-leaving");
      setTimeout(function () { location.href = url.href; }, 330);
    });
    window.addEventListener("pageshow", function (e) { if (e.persisted) html.classList.remove("aldm-leaving", "aldm-boot"); });

    /* ---------- cursor dot + ring ---------- */
    if (fine) {
      var dot = doc.createElement("div"), ring = doc.createElement("div");
      dot.className = "aldm-dot"; ring.className = "aldm-ring";
      dot.setAttribute("aria-hidden", "true"); ring.setAttribute("aria-hidden", "true");
      body.appendChild(dot); body.appendChild(ring);
      var mx = -100, my = -100, rx = -100, ry = -100, raf = 0;
      var hot = "a, button, [role='button'], input[type='submit'], input[type='button'], label[for], select, summary, .oauth-btn, [data-magnetic]";
      function loop() {
        rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
        dot.style.transform = "translate(" + mx + "px," + my + "px)";
        ring.style.transform = "translate(" + rx + "px," + ry + "px)";
        raf = Math.abs(mx - rx) + Math.abs(my - ry) > 0.3 ? requestAnimationFrame(loop) : 0;
      }
      doc.addEventListener("mousemove", function (e) {
        mx = e.clientX; my = e.clientY;
        html.classList.add("aldm-cursor-on");
        var t = e.target && e.target.closest ? e.target.closest(hot) : null;
        ring.classList.toggle("hover", !!t);
        if (!raf) raf = requestAnimationFrame(loop);
      }, { passive: true });
      doc.addEventListener("mousedown", function () { ring.classList.add("press"); });
      doc.addEventListener("mouseup", function () { ring.classList.remove("press"); });
      doc.addEventListener("mouseleave", function () { html.classList.remove("aldm-cursor-on"); });
    }

    /* ---------- magnetic buttons ---------- */
    if (fine) {
      var magSel = mode === "lite" ? "[data-magnetic]" : "[data-magnetic], a[class*='btn'], .oauth-btn, a[class*='cta'], button[class*='cta']";
      $$(magSel).forEach(function (el) {
        if (el.closest(".ald-ask, .aldo-dock, nav, aside")) return;
        el.classList.add("aldm-mag");
        el.addEventListener("mousemove", function (e) {
          var r = el.getBoundingClientRect();
          var x = (e.clientX - r.left - r.width / 2) / r.width, y = (e.clientY - r.top - r.height / 2) / r.height;
          el.style.transform = "translate(" + (x * 10).toFixed(1) + "px," + (y * 8).toFixed(1) + "px)";
        });
        el.addEventListener("mouseleave", function () { el.style.transform = ""; });
      });
    }

    if (mode === "lite") return;

    /* ---------- grain ---------- */
    var grain = doc.createElement("div");
    grain.className = "aldm-grain";
    grain.setAttribute("aria-hidden", "true");
    body.appendChild(grain);

    /* ---------- scroll progress (only if the page has none) ---------- */
    if (!doc.querySelector(".ald-progress, #progress, .progress, .aldm-progress")) {
      var bar = doc.createElement("div");
      bar.className = "aldm-progress";
      bar.setAttribute("aria-hidden", "true");
      body.appendChild(bar);
      var tick = false;
      var onScroll = function () {
        tick = false;
        var max = doc.documentElement.scrollHeight - innerHeight;
        bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, scrollY / max) : 0) + ")";
      };
      addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(onScroll); } }, { passive: true });
    }

    if (!hasIO) return;
    var root = doc.querySelector("main") || body;

    /* ---------- split headings ---------- */
    var splits = [];
    $$("h1, h2", root).forEach(function (h) {
      if (h.closest("[data-split], .ald-split, .aldm-split, .ald-guide, .aldo-dock, [hidden], dialog, .modal")) return;
      if (h.querySelector("input, button, select, textarea, img, svg, br, div, p")) return;
      var text = (h.textContent || "").trim();
      if (!text || text.length > 140) return;
      var n = { i: 0 };
      (function walk(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (c) {
          if (c.nodeType === 3) {
            var frag = doc.createDocumentFragment();
            c.textContent.split(/(\s+)/).forEach(function (part) {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(part)); return; }
              var w = doc.createElement("span"), wi = doc.createElement("span");
              w.className = "aldm-w"; wi.className = "aldm-wi";
              wi.style.setProperty("--i", n.i++);
              wi.textContent = part;
              w.appendChild(wi); frag.appendChild(w);
            });
            node.replaceChild(frag, c);
          } else if (c.nodeType === 1) walk(c);
        });
      })(h);
      h.classList.add("aldm-split");
      splits.push(h);
    });

    /* ---------- staggered reveals ---------- */
    var skipPage = body.classList.contains("ald-page"); // aldovra-pages.js already reveals these blocks
    var blocks = [];
    if (!skipPage) {
      var cands = [];
      Array.prototype.slice.call(root.children).forEach(function (c) {
        cands.push(c);
        if (c.children.length > 1 && c.children.length < 14 && c.offsetHeight > innerHeight * 0.9) {
          Array.prototype.slice.call(c.children).forEach(function (g) { cands.push(g); });
        }
      });
      cands.forEach(function (el) {
        if (/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) return;
        if (el.matches(".ald-rv, [data-reveal], .aldm-rv, .aldo-dock, .ald-guide, .aldm-leave, .aldm-grain, .aldm-dot, .aldm-ring, .aldm-progress")) return;
        if (el.querySelector(".aldm-rv")) return;
        var cs = getComputedStyle(el);
        if (cs.position === "fixed" || cs.position === "sticky" || cs.display === "none" || cs.display === "contents") return;
        if (el.parentElement && blocks.indexOf(el.parentElement) !== -1) return; // parent already animates
        blocks.push(el);
      });
      var sib = new Map();
      blocks.forEach(function (el) {
        var p = el.parentElement, k = sib.get(p) || 0;
        sib.set(p, k + 1);
        el.style.setProperty("--d", Math.min(k, 6) * 70 + "ms");
        el.classList.add("aldm-rv");
        if (/card|stat|tile|kpi/i.test(el.className)) el.classList.add("aldm-scale");
      });
    }

    /* ---------- card lift ---------- */
    if (fine && !body.classList.contains("ald-auth")) {
      $$("[class*='card']", root).forEach(function (el) {
        if (el.closest("form, dialog, .modal, .ald-ask") || el.querySelector("[class*='card']")) return;
        var h = el.offsetHeight;
        if (h > 40 && h < 520 && getComputedStyle(el).position !== "fixed") el.classList.add("aldm-lift");
      });
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    splits.concat(blocks).forEach(function (el) { io.observe(el); });
    setTimeout(function () { // failsafe: anything already on screen shows even if the observer missed it
      splits.concat(blocks).forEach(function (el) { if (el.getBoundingClientRect().top < innerHeight) el.classList.add("in"); });
    }, 3000);
  });
})();
