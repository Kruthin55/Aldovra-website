/* Aldovra HR workspace shell: recruiter session (own storageKey), access guard, sidebar, shortlist, helpers. */
(function (global) {
  "use strict";
  var SUPABASE_URL = "https://lgefwfrjzweayfxahogs.supabase.co";
  var SUPABASE_KEY = "sb_publishable_f4DHvfDfjqLyugXm6iq6JQ__Q72vK9i";
  var db = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storageKey: "aldovra-hr-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var initials = function (v) {
    return String(v || "A").trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0] || ""; }).join("").toUpperCase() || "A";
  };
  var pct = function (v) { var n = Number(v); return isFinite(n) ? Math.round(n) + "%" : "—"; };
  var safeUrl = function (v) {
    try { var u = new URL(String(v || "")); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch (e) { return ""; }
  };
  var ICON = {
    dash: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>',
    cand: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6.5 6.5 0 0 0-2.5-5.1"/>',
    star: '<path d="M12 3l2.7 5.5 6 .9-4.4 4.2 1 6L12 16.8 6.7 19.6l1-6L3.3 9.4l6-.9z"/>',
    out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>'
  };
  var svg = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + "</svg>"; };

  var saved = new Set();
  function savedCount() { return saved.size; }

  function shell(active) {
    var nav = [
      { id: "dashboard", href: "/hr-dashboard.html", label: "Dashboard", icon: ICON.dash },
      { id: "candidates", href: "/hr-candidates.html", label: "Candidates", icon: ICON.cand },
      { id: "saved", href: "/hr-candidates.html#saved", label: "Saved", icon: ICON.star, count: true }
    ];
    var links = nav.map(function (n) {
      return '<a href="' + n.href + '" data-nav="' + n.id + '"' + (n.id === active ? ' class="on" aria-current="page"' : "") + ">" + svg(n.icon) + "<span>" + n.label + "</span>" +
        (n.count ? '<span class="count" data-saved-count hidden></span>' : "") + "</a>";
    }).join("");
    var brand = '<a class="hr-brand" href="/hr-dashboard.html"><img src="/aldovra-logo.png" alt=""><div><b>Aldovra</b><span>HR workspace</span></div></a>';
    var side = document.createElement("aside");
    side.className = "hr-side";
    side.innerHTML = brand + '<div class="hr-nav-label">Workspace</div><nav class="hr-nav" aria-label="HR workspace">' + links + "</nav>" +
      '<div class="hr-side-foot"><div class="hr-me"><div class="av" id="hrAv">HR</div><div><b id="hrName">Recruiter</b><span id="hrCompany"></span></div></div>' +
      '<button class="hr-logout" type="button" data-hr-logout>' + svg(ICON.out) + "Log out</button></div>";
    var app = document.querySelector(".hr-app");
    app.insertBefore(side, app.firstChild);
    var mtop = document.createElement("header");
    mtop.className = "hr-mtop";
    mtop.innerHTML = brand + '<button class="hr-mlogout" type="button" data-hr-logout>Log out</button>';
    var mtabs = document.createElement("nav");
    mtabs.className = "hr-mtabs";
    mtabs.setAttribute("aria-label", "HR workspace");
    mtabs.innerHTML = nav.map(function (n) { return '<a href="' + n.href + '" data-nav="' + n.id + '"' + (n.id === active ? ' class="on"' : "") + ">" + n.label + "</a>"; }).join("");
    document.body.insertBefore(mtabs, document.body.firstChild);
    document.body.insertBefore(mtop, document.body.firstChild);
    document.querySelectorAll("[data-hr-logout]").forEach(function (b) {
      b.addEventListener("click", function () {
        db.auth.signOut({ scope: "local" }).then(function () { location.replace("/hr-login.html"); });
      });
    });
  }
  function setActive(id) {
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      var on = a.getAttribute("data-nav") === id;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  function paintSaved() {
    document.querySelectorAll("[data-saved-count]").forEach(function (el) { el.hidden = !saved.size; el.textContent = saved.size; });
  }

  /* guard: signed in + approved recruiter (or admin) */
  function boot(active) {
    document.body.classList.add("hr-locked");
    shell(active);
    return db.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) { location.replace("/hr-login.html"); throw new Error("redirect"); }
      return db.rpc("my_recruiter_status").then(function (s) {
        var st = s.data || {};
        if (s.error || (!st.is_admin && st.status !== "approved")) {
          return db.auth.signOut({ scope: "local" }).then(function () { location.replace("/hr-login.html?access=pending"); throw new Error("redirect"); });
        }
        return Promise.all([
          db.from("recruiter_access").select("full_name,company_name,designation").eq("user_id", user.id).maybeSingle(),
          db.from("recruiter_shortlist").select("student_id")
        ]).then(function (res) {
          var me = (res[0] && res[0].data) || {};
          (res[1] && res[1].data || []).forEach(function (row) { saved.add(String(row.student_id)); });
          me.email = user.email;
          me.is_admin = !!st.is_admin;
          var name = me.full_name || (user.email || "").split("@")[0];
          document.getElementById("hrName").textContent = name;
          document.getElementById("hrCompany").textContent = me.company_name || (me.is_admin ? "Aldovra admin" : user.email);
          document.getElementById("hrAv").textContent = initials(name);
          paintSaved();
          document.body.classList.remove("hr-locked");
          return { user: user, me: me };
        });
      });
    });
  }

  function loadPool(opts) {
    opts = opts || {};
    return db.rpc("get_verified_candidates_for_recruiters", {
      p_search: opts.search || null, p_skill: opts.skill || null, p_location: null,
      p_limit: opts.limit || 100, p_offset: opts.offset || 0
    }).then(function (r) { if (r.error) throw r.error; return Array.isArray(r.data) ? r.data : []; });
  }

  function toggleSave(studentId) {
    var id = String(studentId), was = saved.has(id);
    if (was) saved.delete(id); else saved.add(id);
    paintSaved();
    var q = was
      ? db.from("recruiter_shortlist").delete().eq("student_id", id)
      : db.from("recruiter_shortlist").insert({ student_id: id });
    return Promise.resolve(q).then(function (r) {
      if (r && r.error) throw r.error;
      toast(was ? "Removed from Saved" : "Saved ⭐");
      return !was;
    }).catch(function (e) {
      if (was) saved.add(id); else saved.delete(id);
      paintSaved();
      toast("Couldn't update Saved. Please try again.");
      throw e;
    });
  }

  var toastTimer;
  function toast(msg) {
    var t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("on"); }, 2000);
  }
  function reveal(root) {
    var els = (root || document).querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in global)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (e, i) { e.style.transitionDelay = Math.min(i * 50, 400) + "ms"; io.observe(e); });
  }
  function starIcon() { return svg(ICON.star); }
  function skillsOf(c) { return Array.isArray(c.verified_skills) ? c.verified_skills : []; }
  function latestVerified(c) { return Math.max(0, Math.max.apply(null, skillsOf(c).map(function (x) { return Date.parse(x.verified_at || "") || 0; }).concat([0]))); }
  /* one candidate card (used on Dashboard and Candidates) */
  function card(c) {
    var id = String(c.student_id || ""), list = skillsOf(c);
    var chips = list.slice(0, 5).map(function (sk) { return '<span class="chip ok">✓ ' + esc(sk.name) + " <b>" + pct(sk.score) + "</b></span>"; }).join("");
    if (list.length > 5) chips += '<span class="chip">+' + (list.length - 5) + " more</span>";
    var edu = [c.degree, c.college].filter(Boolean).join(" · ");
    var meta = [edu, c.graduation_year ? "Class of " + c.graduation_year : "", c.city].filter(Boolean).map(esc).join(" · ");
    return '<article class="cand reveal" data-id="' + esc(id) + '">' +
      '<button type="button" class="save-btn' + (saved.has(id) ? " on" : "") + '" data-save="' + esc(id) + '" aria-pressed="' + saved.has(id) + '" aria-label="Save candidate">' + starIcon() + "</button>" +
      '<div class="cand-top"><div class="cand-av">' + esc(initials(c.full_name)) + '</div><div><b>' + esc(c.full_name || "Aldovra student") + "</b><span>" + esc(c.career_track || "Early-career candidate") + "</span></div></div>" +
      (meta ? '<div class="cand-meta">' + meta + "</div>" : "") +
      '<div class="cand-skills">' + (chips || '<span class="chip">Verified skill evidence</span>') + "</div>" +
      '<div class="cand-foot"><div class="cand-score"><small>Avg. verified score</small><b>' + pct(c.average_score) + "</b></div>" +
      '<button type="button" class="btn sm dark" data-open="' + esc(id) + '">View profile</button></div></article>';
  }

  global.AldHR = {
    db: db, boot: boot, loadPool: loadPool, toggleSave: toggleSave, isSaved: function (id) { return saved.has(String(id)); },
    savedCount: savedCount, setActive: setActive, esc: esc, initials: initials, pct: pct, safeUrl: safeUrl,
    toast: toast, reveal: reveal, starIcon: starIcon, card: card, skillsOf: skillsOf, latestVerified: latestVerified
  };
})(window);
