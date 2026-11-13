/* "Aldo recommends" nudge on login/signup (13 Nov 2026).
   Email sign-up sends a verification email and Brevo's free plan allows 300 a day, so we gently
   steer people to Google / LinkedIn / GitHub:
   1. Signup: clicking "Sign up with email instead" first shows the nudge; "Use email anyway" continues.
   2. Any page: when Supabase reports an email rate limit, the nudge explains it and offers the
      one-tap options instead of a dead end. */
(function () {
  "use strict";
  var css =
    ".aen-bg{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:16px;background:rgba(13,13,18,.5)}" +
    ".aen{width:min(420px,100%);background:#fff;color:#0d0d12;border-radius:20px;padding:24px 22px 18px;font:15px/1.5 Inter,system-ui,sans-serif;box-shadow:0 30px 80px -30px rgba(0,0,0,.5)}" +
    ".aen-k{display:inline-flex;align-items:center;gap:8px;font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#14532d}" +
    ".aen-k i{width:22px;height:22px;border-radius:7px;background:#14532d;color:#fff;display:grid;place-items:center;font:700 12px/1 Inter,sans-serif;font-style:normal}" +
    ".aen h3{margin:12px 0 6px;font-size:20px;letter-spacing:-.02em}" +
    ".aen p{margin:0 0 16px;color:#5c5a66;font-size:14px}" +
    ".aen-opts{display:grid;gap:8px}" +
    ".aen-opts button{display:flex;align-items:center;justify-content:center;gap:10px;height:46px;border-radius:12px;border:1px solid #e4e1d8;background:#fff;color:#0d0d12;font:600 15px/1 Inter,system-ui,sans-serif;cursor:pointer}" +
    ".aen-opts button:hover{background:#f4f2ec}" +
    ".aen-opts button svg{flex:none}" +
    ".aen-email{display:block;width:100%;margin-top:12px;border:0;background:none;color:#5c5a66;font:500 13.5px/1.4 Inter,system-ui,sans-serif;text-decoration:underline;text-underline-offset:3px;cursor:pointer}" +
    ".aen-email:hover{color:#0d0d12}";
  function injectCss() {
    if (document.getElementById("aen-css")) return;
    var s = document.createElement("style"); s.id = "aen-css"; s.textContent = css; document.head.appendChild(s);
  }
  function providers() {
    var list = [];
    var g = document.getElementById("googleSignupBtn") || document.getElementById("googleLoginBtn");
    if (g) list.push(g);
    document.querySelectorAll(".oauth-btn[data-oauth]").forEach(function (b) { if (!b.hidden) list.push(b); });
    return list;
  }
  function show(opts) {
    opts = opts || {};
    if (document.querySelector(".aen-bg")) return;
    injectCss();
    var limit = opts.reason === "limit";
    var names = providers().map(function (b) { return b.getAttribute("data-label") || "Google"; });
    var who = names.length > 1 ? names.slice(0, -1).join(", ") + " or " + names[names.length - 1] : (names[0] || "Google");
    var bg = document.createElement("div");
    bg.className = "aen-bg";
    bg.innerHTML =
      '<div class="aen" role="dialog" aria-modal="true" aria-labelledby="aenT">' +
      '<span class="aen-k"><i>A</i>Aldo recommends</span>' +
      '<h3 id="aenT">' + (limit ? "Our email service is busy right now" : "Sign up in one tap instead") + "</h3>" +
      "<p>" + (limit
        ? "We have sent a lot of verification emails in a short time, so new ones may be delayed. Continue with " + who + " to get in right away, no email needed."
        : "Continue with " + who + ": no password to remember and no verification email to wait for. Your Aldovra account works exactly the same.") + "</p>" +
      '<div class="aen-opts"></div>' +
      (opts.onEmail ? '<button type="button" class="aen-email">Use email anyway</button>' : '<button type="button" class="aen-email">Close</button>') +
      "</div>";
    var box = bg.querySelector(".aen-opts");
    providers().forEach(function (real) {
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = real.innerHTML.replace(/>(LinkedIn|GitHub)</, ">Continue with $1<");
      b.addEventListener("click", function () { close(); real.click(); });
      box.appendChild(b);
    });
    function close() { document.removeEventListener("keydown", onKey); bg.remove(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    bg.addEventListener("click", function (e) { if (e.target === bg) close(); });
    bg.querySelector(".aen-email").addEventListener("click", function () { close(); if (opts.onEmail) opts.onEmail(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(bg);
    var first = box.querySelector("button"); if (first) first.focus();
  }

  // 1. Signup: nudge before opening the email form (skip when the page was opened with ?email=1).
  var allowEmail = /[?&]email=1\b/.test(location.search);
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("#emailToggle");
    if (!t || allowEmail) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    show({ onEmail: function () { allowEmail = true; t.click(); } });
  }, true);

  // 2. Email rate limit anywhere on the page: wrap the page's friendlyAuthError().
  if (typeof window.friendlyAuthError === "function") {
    var orig = window.friendlyAuthError;
    window.friendlyAuthError = function (error, fallback) {
      var msg = orig(error, fallback);
      if (/Too many emails/i.test(String(msg))) setTimeout(function () { show({ reason: "limit" }); }, 50);
      return msg;
    };
  }
  window.AldEmailNudge = { show: show };
})();
