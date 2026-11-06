/* Moving strip of company logos: "Live fresher jobs from N companies".
   Companies come from the anon RPC hiring_now_companies() (most live jobs first); logos from Logo.dev
   via window.ALD_COMPANY_DOMAINS. Auth pages: inserted right under .heading. Elsewhere: any [data-logo-marquee].
   Fails quietly: if nothing loads, the strip is never shown. */
(function () {
  "use strict";
  var URL_RPC = "https://lgefwfrjzweayfxahogs.supabase.co/rest/v1/rpc/hiring_now_companies";
  var KEY = "sb_publishable_f4DHvfDfjqLyugXm6iq6JQ__Q72vK9i";
  var LOGO = "pk_TpDEg18pTDWBij6DRTkUxQ";
  var FALLBACK = ["Amazon", "Wells Fargo", "Citi", "LSEG", "Hewlett Packard Enterprise", "Caterpillar", "Deutsche Bank",
    "Cognizant", "Bosch Group", "NVIDIA", "Applied Materials", "Medtronic", "BlackRock", "Accenture", "Micron", "Intel",
    "Salesforce", "Stripe", "PhonePe", "Novartis"].map(function (n) { return { name: n }; });

  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  function domain(name) {
    var map = window.ALD_COMPANY_DOMAINS || {};
    return map[String(name || "").trim().toLowerCase()] || "";
  }

  function mount(host) {
    if (!host || host.dataset.lmReady) return;
    host.dataset.lmReady = "1";
    host.className += " ald-lm";
    host.hidden = true;
    fetch(URL_RPC, {
      method: "POST",
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_limit: 30 })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { render(host, d && d.companies && d.companies.length ? d : null); },
            function () { render(host, null); });
  }

  function render(host, data) {
    var list = ((data && data.companies) || FALLBACK).filter(function (c) { return domain(c.name); }).slice(0, 22);
    if (list.length < 6) return;
    var total = data && data.total_companies;
    var tiles = list.map(function (c) {
      var tip = c.name + (c.jobs ? " · " + c.jobs + " live job" + (c.jobs === 1 ? "" : "s") : "");
      return '<li class="ald-lm-tile" title="' + esc(tip) + '"><span class="ald-lm-ini" aria-hidden="true">' + esc(c.name.charAt(0)) + "</span>" +
        '<img alt="' + esc(c.name) + '" width="44" height="44" loading="lazy" decoding="async" ' +
        'src="https://img.logo.dev/' + esc(domain(c.name)) + "?token=" + LOGO + '&size=96&format=webp&fallback=404" ' +
        "onload=\"this.parentNode.classList.add('is-loaded')\" onerror=\"this.remove()\"></li>";
    }).join("");
    host.innerHTML =
      '<p class="ald-lm-cap"><i aria-hidden="true"></i>Live fresher jobs from ' + (total ? "<b>" + total + "</b> companies" : "top companies") + "</p>" +
      '<div class="ald-lm-view"><ul class="ald-lm-track">' + tiles + "</ul>" +
      '<ul class="ald-lm-track" aria-hidden="true">' + tiles + "</ul></div>" +
      '<a class="ald-lm-attr" href="https://logo.dev" target="_blank" rel="noopener">Logos provided by Logo.dev</a>';
    /* the second copy is decorative: keep its images out of the accessibility tree */
    host.querySelectorAll('.ald-lm-track[aria-hidden="true"] img').forEach(function (i) { i.alt = ""; });
    host.style.setProperty("--ald-lm-dur", Math.max(28, list.length * 2.6) + "s");
    host.hidden = false;
  }

  function init() {
    document.querySelectorAll("[data-logo-marquee]").forEach(mount);
    if (document.body.classList.contains("ald-auth") && !document.querySelector(".ald-lm")) {
      var head = document.querySelector(".card .heading");
      if (head) { var d = document.createElement("div"); head.insertAdjacentElement("afterend", d); mount(d); }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
