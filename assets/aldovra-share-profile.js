/* Dashboard: "Share your proof" — public profile switch, link + QR, and the student's verified-skill certificates.
   Needs the global `db` (dashboard Supabase client) and RPCs get_my_public_profile / save_public_profile.
   If those are unavailable the section stays hidden, so the dashboard never shows a broken card. */
(function () {
  "use strict";
  var SITE = "https://aldovra.com";
  var anchor = document.getElementById("assessmentsSection");
  if (!anchor) return;

  var state = null, saving = false;
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var pct = function (v) { var n = Number(v); return isFinite(n) ? (Math.round(n * 10) / 10 + "").replace(/\.0$/, "") + "%" : ""; };
  var fmt = function (v) { var d = new Date(v); return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
  var profileUrl = function (slug) { return SITE + "/u/?" + slug; };
  var certUrl = function (code) { return SITE + "/cert/?" + code; };
  var liAdd = function (c) {
    var d = new Date(c.issued_at);
    return "https://www.linkedin.com/profile/add?" + new URLSearchParams({
      startTask: "CERTIFICATION_NAME", name: c.skill + " — Verified Skill", organizationName: "Aldovra",
      issueYear: String(d.getFullYear()), issueMonth: String(d.getMonth() + 1), certUrl: certUrl(c.code), certId: c.code
    }).toString();
  };
  var liShare = function (url) { return "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url); };

  var section = document.createElement("section");
  section.className = "card ald-share";
  section.id = "shareProfileSection";
  section.hidden = true;
  section.setAttribute("aria-labelledby", "aldShareTitle");
  anchor.insertAdjacentElement("afterend", section);

  function copy(text, btn) {
    var ok = function () {
      if (!btn) return;
      var t = btn.innerHTML; btn.textContent = "Copied ✓"; setTimeout(function () { btn.innerHTML = t; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { prompt("Copy this link:", text); });
    else prompt("Copy this link:", text);
  }

  function render() {
    var s = state, url = profileUrl(s.slug), certs = s.certificates || [];
    var certList = certs.length
      ? certs.map(function (c) {
          return '<div class="ald-share-cert">' +
            '<div class="ald-share-cert-main"><span class="ald-share-tick" aria-hidden="true">✓</span><div>' +
            "<strong>" + esc(c.skill) + "</strong><small>" + esc(pct(c.score)) + " · " + esc(fmt(c.issued_at)) + " · " + esc(c.code) + "</small></div></div>" +
            '<div class="ald-share-cert-act">' +
            '<a class="ald-share-btn" href="/cert/?' + encodeURIComponent(c.code) + '" target="_blank" rel="noopener">View certificate</a>' +
            '<a class="ald-share-btn li" href="' + esc(liAdd(c)) + '" target="_blank" rel="noopener">Add to LinkedIn</a></div></div>';
        }).join("")
      : '<div class="ald-share-empty"><strong>No certificates yet</strong><span>Score 75% or more in an assessment and submit your environment video. Once the Aldovra team approves it, your certificate appears here automatically.</span></div>';

    section.innerHTML =
      '<div class="ald-share-head"><div>' +
        '<div class="assessment-section-kicker">Share your proof</div>' +
        '<h2 id="aldShareTitle">Your verified profile</h2>' +
        "<p>One link for recruiters and LinkedIn: your verified skills, each with a certificate anyone can check.</p></div>" +
        '<span class="ald-share-pill ' + (s.is_public ? "on" : "") + '">' + (s.is_public ? "● Public" : "○ Private") + "</span></div>" +
      '<div class="ald-share-grid">' +
        '<form class="ald-share-form" id="aldShareForm" novalidate>' +
          '<label class="ald-share-switch"><input type="checkbox" id="aldSharePublic"' + (s.is_public ? " checked" : "") + '>' +
            '<span class="track" aria-hidden="true"><span></span></span><span class="lbl"><b>Make my profile public</b>' +
            "<small>Only your name, education, bio, links and verified skills are shown. Never your email, phone or exam recordings.</small></span></label>" +
          '<label class="ald-share-field"><span>Your link</span><div class="ald-share-url"><em>aldovra.com/u/?</em>' +
            '<input id="aldShareSlug" value="' + esc(s.slug) + '" maxlength="40" autocomplete="off" spellcheck="false" aria-describedby="aldShareMsg"></div></label>' +
          '<div class="ald-share-opts">' +
            '<label><input type="checkbox" id="aldShareCollege"' + (s.show_college ? " checked" : "") + "> Show college & degree</label>" +
            '<label><input type="checkbox" id="aldShareScores"' + (s.show_scores ? " checked" : "") + "> Show scores</label></div>" +
          '<div class="ald-share-save"><button class="ald-share-btn dark" type="submit" id="aldShareSave">Save</button>' +
            '<span id="aldShareMsg" class="ald-share-msg" role="status"></span></div>' +
        "</form>" +
        '<div class="ald-share-card' + (s.is_public && s.exists ? "" : " off") + '">' +
          '<div class="ald-share-qr" id="aldShareQr"></div>' +
          '<div class="ald-share-link">' + esc(url.replace("https://", "")) + "</div>" +
          '<div class="ald-share-actions">' +
            '<button class="ald-share-btn" type="button" id="aldShareCopy">Copy link</button>' +
            '<a class="ald-share-btn" href="/u/?' + encodeURIComponent(s.slug) + '" target="_blank" rel="noopener">Open</a>' +
            '<a class="ald-share-btn li" href="' + esc(liShare(url)) + '" target="_blank" rel="noopener">Share on LinkedIn</a></div>' +
          '<p class="ald-share-hint">' + (s.is_public && s.exists ? "Add this link to your resume and LinkedIn headline." : "Switch on and save to get your shareable link.") + "</p>" +
        "</div>" +
      "</div>" +
      '<div class="ald-share-certs"><div class="ald-share-sub">Your certificates <span>' + certs.length + "</span></div>" + certList + "</div>";

    if (window.AldQR) document.getElementById("aldShareQr").innerHTML = window.AldQR.svg(url, { quiet: 2 });
    document.getElementById("aldShareCopy").addEventListener("click", function (e) { copy(url, e.currentTarget); });
    var slug = document.getElementById("aldShareSlug");
    slug.addEventListener("input", function () {
      var v = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
      if (v !== slug.value) slug.value = v;
      msg("");
    });
    document.getElementById("aldShareForm").addEventListener("submit", save);
    document.getElementById("aldSharePublic").addEventListener("change", function () { save(); });
    section.hidden = false;
  }

  function msg(text, kind) {
    var m = document.getElementById("aldShareMsg");
    if (m) { m.textContent = text; m.className = "ald-share-msg " + (kind || ""); }
  }

  function save(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (saving) return;
    var slug = document.getElementById("aldShareSlug").value.trim().replace(/^-+|-+$/g, "");
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
      msg("Use 3–40 letters, numbers or hyphens.", "bad"); return;
    }
    saving = true; msg("Saving…");
    window.db.rpc("save_public_profile", {
      p_slug: slug,
      p_is_public: document.getElementById("aldSharePublic").checked,
      p_show_college: document.getElementById("aldShareCollege").checked,
      p_show_scores: document.getElementById("aldShareScores").checked
    }).then(function (res) {
      saving = false;
      if (res.error) {
        var t = String(res.error.message || "");
        msg(t.indexOf("SLUG_TAKEN") > -1 ? "That link is taken. Try another." : t.indexOf("SLUG_INVALID") > -1 ? "Use 3–40 letters, numbers or hyphens." : "Couldn't save. Please try again.", "bad");
        return;
      }
      state = res.data; render(); msg("Saved ✓", "ok");
    }, function () { saving = false; msg("Couldn't save. Please try again.", "bad"); });
  }

  function load() {
    if (!window.db || !window.db.rpc) return;
    window.db.rpc("get_my_public_profile").then(function (res) {
      if (res.error || !res.data || typeof res.data !== "object" || !res.data.slug) return; // feature not live yet -> stay hidden
      state = res.data; render();
    }, function () {});
  }

  /* wait for the dashboard to sign the student in */
  var tries = 0;
  (function wait() {
    if (window.currentUser && window.db) return load();
    if (++tries < 80) setTimeout(wait, 400);
  })();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && state && !saving) load();
  });
})();
