/* Aldovra public credentials helpers (used by /u/ and /cert/). */
(function (global) {
  "use strict";
  var SUPABASE_URL = "https://lgefwfrjzweayfxahogs.supabase.co";
  var SUPABASE_KEY = "sb_publishable_f4DHvfDfjqLyugXm6iq6JQ__Q72vK9i";
  var SITE = "https://aldovra.com";
  var client = null;

  function db() {
    if (!client) client = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    return client;
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(v, opts) {
    var d = new Date(v);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-IN", opts || { day: "numeric", month: "long", year: "numeric" });
  }
  function score(v) {
    var n = Number(v);
    if (!isFinite(n)) return "";
    return (Math.round(n * 10) / 10).toString().replace(/\.0$/, "") + "%";
  }
  /* The key after "?" — supports /u/?slug, /u/?n=slug, /cert/?ALD-XXXX-XXXX, /cert/?c=... */
  function queryKey(names) {
    var q = location.search.replace(/^\?/, "");
    if (!q) return "";
    var params = new URLSearchParams(q);
    for (var i = 0; i < names.length; i++) if (params.get(names[i])) return params.get(names[i]).trim();
    var first = q.split("&")[0];
    return first.indexOf("=") === -1 ? decodeURIComponent(first).trim() : "";
  }
  function profileUrl(slug) { return SITE + "/u/?" + encodeURIComponent(slug); }
  function certUrl(code) { return SITE + "/cert/?" + encodeURIComponent(code); }
  function qr(el, text) {
    if (el && global.AldQR) el.innerHTML = global.AldQR.svg(text, { quiet: 2 });
  }
  function linkedInShare(url) {
    return "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url);
  }
  /* LinkedIn "Add licence or certification" prefilled form */
  function linkedInAddCert(c) {
    var d = new Date(c.issued_at);
    var p = new URLSearchParams({
      startTask: "CERTIFICATION_NAME",
      name: c.skill + " — Verified Skill",
      organizationName: "Aldovra",
      issueYear: String(d.getFullYear()),
      issueMonth: String(d.getMonth() + 1),
      certUrl: certUrl(c.code),
      certId: c.code
    });
    return "https://www.linkedin.com/profile/add?" + p.toString();
  }
  var toastTimer;
  function toast(msg) {
    var t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("on"); }, 2200);
  }
  function copy(text, msg) {
    var done = function () { toast(msg || "Link copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("Copy this link: " + text); }
      ta.remove();
    }
  }
  function share(url, title) {
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {});
    } else copy(url);
  }
  function reveal(root) {
    var els = (root || document).querySelectorAll(".reveal");
    if (!("IntersectionObserver" in global)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (e, i) { e.style.transitionDelay = Math.min(i * 60, 360) + "ms"; io.observe(e); });
  }
  /* certificate is designed at 1123x794; scale it to its box */
  function fitCert(fit) {
    if (!fit) return;
    var cert = fit.querySelector(".cert");
    var apply = function () { cert.style.setProperty("--cert-scale", (fit.clientWidth / 1123).toFixed(4)); };
    apply();
    if ("ResizeObserver" in global) new ResizeObserver(apply).observe(fit); else addEventListener("resize", apply);
  }
  function setMeta(title, desc) {
    document.title = title;
    var m = document.querySelector('meta[name="description"]');
    if (m && desc) m.setAttribute("content", desc);
  }
  var ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    li: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11H3zM9.5 9.75h3.8v1.6h.06c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.77 2.65 4.77 6.1v6.36h-4v-5.64c0-1.35-.02-3.08-1.88-3.08-1.88 0-2.17 1.47-2.17 2.98v5.74h-4z"/></svg>',
    gh: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
    img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'
  };

  global.AldCred = {
    db: db, esc: esc, fmtDate: fmtDate, score: score, queryKey: queryKey, profileUrl: profileUrl, certUrl: certUrl,
    qr: qr, linkedInShare: linkedInShare, linkedInAddCert: linkedInAddCert, toast: toast, copy: copy, share: share,
    reveal: reveal, fitCert: fitCert, setMeta: setMeta, ICON: ICON, SITE: SITE
  };
})(window);
