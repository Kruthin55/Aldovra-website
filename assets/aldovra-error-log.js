/* Automatic error reports (24 Nov 2026). Loaded on dashboard.html and assessment.html after the Supabase client.
   JavaScript errors and failed promises are saved to public.client_errors (signed-in users only, 30/hour cap in the DB)
   so we hear about breakages before students have to tell us. Admin → Support shows them grouped. */
(function () {
  "use strict";
  var sent = 0, seen = {}, MAX = 8;
  function client() { try { return typeof db !== "undefined" ? db : null; } catch (e) { return null; } }
  function clip(v, n) { v = String(v == null ? "" : v); return v.length > n ? v.slice(0, n) : v; }
  function report(message, source, line) {
    message = clip(message, 600);
    if (!message || /ResizeObserver loop|Script error\.?$|extension:\/\/|chrome-extension|moz-extension/i.test(message + " " + (source || ""))) return;
    var key = message + "|" + source + "|" + line;
    if (seen[key] || sent >= MAX) return;
    seen[key] = 1; sent++;
    var c = client();
    if (!c || !c.auth) return;
    c.auth.getUser().then(function (r) {
      if (!r || !r.data || !r.data.user) return;
      return c.from("client_errors").insert({
        page: clip(location.pathname + location.search.replace(/([?&](?:access_token|code|token)=)[^&]+/g, "$1…"), 300),
        message: message, source: clip(source || "", 300), line: Number(line) || null,
        user_agent: clip(navigator.userAgent, 400)
      });
    }).catch(function () {});
  }
  window.addEventListener("error", function (e) {
    if (e && e.target && e.target !== window && (e.target.src || e.target.href)) return; // missing images/fonts: ignore
    report(e.message || (e.error && e.error.message), e.filename, e.lineno);
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    var msg = r && (r.message || r.error_description || r.msg) || (typeof r === "string" ? r : "");
    if (!msg || /AbortError|The user aborted|NotAllowedError|Failed to fetch/i.test(msg)) return; // network blips / permission prompts are not bugs
    report("Promise: " + msg, r && r.stack ? String(r.stack).split("\n")[1] : "", 0);
  });
  window.AldReportError = function (message, where) { report(message, where || "manual", 0); };
})();
