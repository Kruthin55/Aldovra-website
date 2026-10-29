/* Extra sign-in providers (LinkedIn, GitHub) on login/signup.
   Buttons stay hidden until the provider is switched on in Supabase Auth,
   so turning it on in the dashboard is enough to show them. */
(function () {
  "use strict";
  var row = document.querySelector(".oauth-more");
  if (!row || typeof supabaseClient === "undefined") return;
  var buttons = row.querySelectorAll("[data-oauth]");

  fetch(SUPABASE_URL + "/auth/v1/settings", { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (s) {
      var ext = (s && s.external) || {};
      var shown = 0;
      buttons.forEach(function (b) {
        var on = ext[b.getAttribute("data-oauth")] === true;
        b.hidden = !on;
        if (on) shown++;
      });
      row.hidden = !shown;
    })
    .catch(function () {});

  buttons.forEach(function (b) {
    b.addEventListener("click", async function () {
      var label = b.getAttribute("data-label");
      var html = b.innerHTML;
      buttons.forEach(function (x) { x.disabled = true; });
      b.lastChild.textContent = "Connecting...";
      try {
        var res = await supabaseClient.auth.signInWithOAuth({
          provider: b.getAttribute("data-oauth"),
          options: { redirectTo: window.location.origin + "/dashboard.html" }
        });
        if (res.error) throw res.error;
      } catch (error) {
        console.error(error);
        var msg = label + " sign-in could not start. Please try Google or email.";
        if (typeof showMessage === "function") {
          showMessage(typeof friendlyAuthError === "function" ? friendlyAuthError(error, msg) : msg, "error");
        }
        b.innerHTML = html;
        buttons.forEach(function (x) { x.disabled = false; });
      }
    });
  });
})();
