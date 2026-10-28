/* Aldovra Admin v2: own sign-in (separate session from student/recruiter tabs), tabs,
   Overview KPIs, Certificates, Payments, System health. Uses the page's global `db` client. */
(function () {
  "use strict";
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var num = function (v) { return Number(v || 0).toLocaleString("en-IN"); };
  var inr = function (v) { return "₹" + Number(v || 0).toLocaleString("en-IN"); };
  var pct = function (v) { var n = Number(v); return isFinite(n) ? (Math.round(n * 10) / 10 + "").replace(/\.0$/, "") + "%" : "—"; };
  var bytes = function (b) {
    b = Number(b || 0);
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
    return (b / 1073741824).toFixed(2) + " GB";
  };
  var when = function (v) {
    if (!v) return "—";
    var d = new Date(v);
    return isNaN(d) ? "—" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  };
  var ago = function (v) {
    if (!v) return "never";
    var m = Math.round((Date.now() - new Date(v).getTime()) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    if (m < 1440) return Math.round(m / 60) + " h ago";
    return Math.round(m / 1440) + " d ago";
  };
  function rpc(name, args) {
    return db.rpc(name, args || {}).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  }
  function errBox(e) {
    return '<div class="adm-error">Couldn\'t load this. ' + esc((e && e.message) || "Please refresh.") + "</div>";
  }

  /* ---------------------------------------------------------------- sign-in gate */
  function showGate(message) {
    document.body.classList.add("adm-locked");
    var g = $("#admGate");
    if (!g) {
      g = document.createElement("div");
      g.id = "admGate";
      g.innerHTML =
        '<form class="adm-gate-card" novalidate>' +
          '<div class="adm-gate-brand"><img src="/aldovra-logo.png" alt=""><div><b>Aldovra</b><span>Admin console</span></div></div>' +
          "<h1>Admin sign in</h1>" +
          "<p>This sign-in is separate from student and recruiter accounts, so you can stay logged in as a student in another tab.</p>" +
          '<label>Email<input type="email" id="admEmail" autocomplete="username" required></label>' +
          '<label>Password<input type="password" id="admPass" autocomplete="current-password" required></label>' +
          '<div class="adm-gate-msg" id="admGateMsg" role="alert"></div>' +
          '<button type="submit" id="admGateBtn">Sign in</button>' +
          '<a href="/" class="adm-gate-back">← Back to aldovra.com</a>' +
        "</form>";
      document.body.appendChild(g);
      g.querySelector("form").addEventListener("submit", function (e) {
        e.preventDefault();
        var email = $("#admEmail").value.trim(), pass = $("#admPass").value;
        var btn = $("#admGateBtn"), msg = $("#admGateMsg");
        if (!email || !pass) { msg.textContent = "Enter your admin email and password."; return; }
        btn.disabled = true; btn.textContent = "Signing in…"; msg.textContent = "";
        db.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
          if (r.error) throw r.error;
          return db.from("admin_users").select("user_id").eq("user_id", r.data.user.id).maybeSingle();
        }).then(function (r) {
          if (r.error) throw r.error;
          if (!r.data) {
            return db.auth.signOut({ scope: "local" }).then(function () {
              throw new Error("This account doesn't have admin access.");
            });
          }
          location.reload();
        }).catch(function (err) {
          var t = String((err && err.message) || "");
          msg.textContent = /invalid login/i.test(t) ? "Wrong email or password." : t || "Couldn't sign in. Try again.";
          btn.disabled = false; btn.textContent = "Sign in";
        });
      });
    }
    var m = $("#admGateMsg");
    if (m && message) m.textContent = message;
    setTimeout(function () { var i = $("#admEmail"); if (i) i.focus(); }, 50);
  }

  /* ---------------------------------------------------------------- tabs */
  var TABS = [
    { id: "overview", label: "Overview" },
    { id: "students", label: "Students", sections: ["studentDirectory"] },
    { id: "reviews", label: "Video reviews", sections: ["environmentVideoReviewQueue"] },
    { id: "certificates", label: "Certificates" },
    { id: "recruiters", label: "Recruiters" },
    { id: "payments", label: "Payments" },
    { id: "health", label: "System health" },
    { id: "jobs", label: "Jobs", sections: ["jobSourcesAdmin", "jobApplicationIssuesAdmin"] }
  ];
  var loaded = {};
  var main = $("main.container");

  function panel(id) {
    var p = $("#admPanel-" + id);
    if (!p) {
      p = document.createElement("section");
      p.id = "admPanel-" + id;
      p.className = "adm-panel";
      p.setAttribute("data-adm-tab", id);
      main.appendChild(p);
    }
    return p;
  }

  function buildTabs() {
    var legacy = $("#legacyAssessmentStats"); if (legacy) legacy.hidden = true;
    var title = main && main.querySelector(":scope > .page-title"); if (title) title.hidden = true;
    var nav = document.createElement("nav");
    nav.className = "adm-tabs";
    nav.setAttribute("aria-label", "Admin sections");
    nav.innerHTML = '<div class="adm-tabs-in">' + TABS.map(function (t) {
      return '<button type="button" data-tab="' + t.id + '">' + t.label + (t.id === "reviews" ? ' <span class="adm-badge" id="admReviewBadge" hidden></span>' : t.id === "recruiters" ? ' <span class="adm-badge" id="admRecBadge" hidden></span>' : "") + "</button>";
    }).join("") + "</div>";
    document.querySelector(".topbar").insertAdjacentElement("afterend", nav);
    TABS.forEach(function (t) {
      (t.sections || []).forEach(function (sid) { var s = document.getElementById(sid); if (s) s.setAttribute("data-adm-tab", t.id); });
      if (!t.sections) panel(t.id);
    });
    nav.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-tab]");
      if (b) show(b.getAttribute("data-tab"));
    });
    addEventListener("hashchange", function () { show(current(), true); });
  }
  function current() {
    var h = (location.hash || "").replace("#", "");
    return TABS.some(function (t) { return t.id === h; }) ? h : "overview";
  }
  function show(id, fromHash) {
    document.querySelectorAll("[data-adm-tab]").forEach(function (el) {
      el.classList.toggle("adm-hidden", el.getAttribute("data-adm-tab") !== id);
    });
    document.querySelectorAll(".adm-tabs button").forEach(function (b) {
      var on = b.getAttribute("data-tab") === id;
      b.classList.toggle("on", on);
      b.setAttribute("aria-current", on ? "page" : "false");
    });
    if (!fromHash && location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    if (!loaded[id] && LOADERS[id]) { loaded[id] = true; LOADERS[id](); }
    scrollTo({ top: 0 });
  }

  /* ---------------------------------------------------------------- overview */
  function kpi(label, value, sub, opts) {
    opts = opts || {};
    return '<div class="adm-kpi' + (opts.alert ? " alert" : "") + '"' + (opts.go ? ' data-go="' + opts.go + '" role="button" tabindex="0"' : "") + ">" +
      "<small>" + esc(label) + "</small><b>" + value + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</div>";
  }
  function loadOverview() {
    var p = panel("overview");
    p.innerHTML = '<div class="adm-head"><div><div class="adm-kicker">Admin console</div><h2>Overview</h2></div>' +
      '<button class="adm-btn" type="button" id="admOvRefresh">Refresh</button></div><div id="admOvBody"><div class="adm-loading">Loading…</div></div>';
    $("#admOvRefresh").onclick = loadOverview;
    Promise.all([rpc("admin_overview"), rpc("admin_system_health").catch(function () { return null; }), rpc("admin_pending_recruiters").catch(function () { return 0; })]).then(function (res) {
      var o = res[0], h = res[1], recPending = Number(res[2] || 0);
      var rb = $("#admRecBadge");
      if (rb) { rb.hidden = !recPending; rb.textContent = recPending; }
      var badge = $("#admReviewBadge");
      if (badge) { badge.hidden = !o.pending_video_reviews; badge.textContent = o.pending_video_reviews; }
      var issues = h ? healthIssues(h) : [];
      var days = o.daily || [];
      var max = Math.max(1, Math.max.apply(null, days.map(function (d) { return Math.max(d.exams, d.signups, d.certificates); })));
      var chart = '<div class="adm-chart" role="img" aria-label="Last 14 days: exams, signups and certificates">' + days.map(function (d) {
        var lbl = new Date(d.day + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        return '<div class="adm-col" title="' + esc(lbl) + ": " + d.exams + " exams, " + d.signups + " signups, " + d.certificates + ' certificates">' +
          '<div class="adm-bars"><i class="e" style="height:' + (d.exams / max * 100) + '%"></i><i class="s" style="height:' + (d.signups / max * 100) + '%"></i><i class="c" style="height:' + (d.certificates / max * 100) + '%"></i></div>' +
          "<span>" + esc(lbl.split(" ")[0]) + "</span></div>";
      }).join("") + "</div>";
      $("#admOvBody").innerHTML =
        (issues.length
          ? '<div class="adm-banner bad" data-go="health" role="button" tabindex="0"><b>' + issues.length + " system issue" + (issues.length > 1 ? "s" : "") + "</b> " + esc(issues[0]) + (issues.length > 1 ? " · and more" : "") + " → open System health</div>"
          : (h ? '<div class="adm-banner ok"><b>All systems healthy.</b> Jobs, crons, AI and storage look good.</div>' : "")) +
        '<div class="adm-kpis">' +
          kpi("Students", num(o.students_total), "+" + num(o.students_7d) + " this week", { go: "students" }) +
          kpi("Exams today", num(o.exams_today), num(o.exams_7d) + " in 7 days") +
          kpi("Pass rate (30d)", pct(o.pass_rate_30d), "scores 75% or more") +
          kpi("Video reviews waiting", num(o.pending_video_reviews), o.pending_video_reviews ? "Review now →" : "Queue is clear", { go: "reviews", alert: o.pending_video_reviews > 0 }) +
          kpi("Active certificates", num(o.certificates_active), "+" + num(o.certificates_30d) + " in 30 days", { go: "certificates" }) +
          kpi("Recruiter requests", num(recPending), recPending ? "Approve or reject →" : "No requests waiting", { go: "recruiters", alert: recPending > 0 }) +
          kpi("Public profiles", num(o.public_profiles), "students sharing their link") +
          kpi("Revenue (PayU)", inr(o.revenue_total), inr(o.revenue_30d) + " in 30 days · " + (o.payments_live ? '<em class="on">payments ON</em>' : '<em>payments OFF</em>'), { go: "payments" }) +
          kpi("Jobs visible", num(o.jobs_visible), "live fresher jobs for students", { go: "jobs" }) +
        "</div>" +
        '<div class="adm-card"><div class="adm-card-head"><h3>Last 14 days</h3><div class="adm-legend"><span class="e">Exams</span><span class="s">Signups</span><span class="c">Certificates</span></div></div>' + chart + "</div>";
      p.querySelectorAll("[data-go]").forEach(function (el) {
        var go = function () { show(el.getAttribute("data-go")); };
        el.addEventListener("click", go);
        el.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
      });
    }).catch(function (e) { $("#admOvBody").innerHTML = errBox(e); });
  }

  /* ---------------------------------------------------------------- certificates */
  function loadCertificates() {
    var p = panel("certificates");
    if (!p.dataset.ready) {
      p.dataset.ready = "1";
      p.innerHTML = '<div class="adm-head"><div><div class="adm-kicker">Verified skills</div><h2>Certificates</h2>' +
        "<p>Issued automatically when you approve a 75%+ result's environment video. Revoking withdraws that approval.</p></div></div>" +
        '<div class="adm-filters"><input type="search" id="admCertQ" placeholder="Search name, email, skill or ALD- code…" aria-label="Search certificates">' +
        '<select id="admCertStatus" aria-label="Certificate status"><option value="active">Active</option><option value="revoked">Revoked</option><option value="all">All</option></select></div>' +
        '<div id="admCertBody"></div>';
      var t; $("#admCertQ").addEventListener("input", function () { clearTimeout(t); t = setTimeout(loadCertificates, 300); });
      $("#admCertStatus").addEventListener("change", loadCertificates);
    }
    var body = $("#admCertBody");
    body.innerHTML = '<div class="adm-loading">Loading…</div>';
    rpc("admin_list_certificates", { p_search: $("#admCertQ").value || null, p_status: $("#admCertStatus").value, p_limit: 300 }).then(function (rows) {
      if (!rows.length) { body.innerHTML = '<div class="adm-empty">No certificates here yet. They appear as soon as you approve a verified result.</div>'; return; }
      body.innerHTML = '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Credential</th><th>Student</th><th>Skill</th><th>Score</th><th>Issued</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          return "<tr><td><a class=\"mono\" href=\"/cert/?" + encodeURIComponent(r.code) + '" target="_blank" rel="noopener">' + esc(r.code) + "</a></td>" +
            "<td><b>" + esc(r.holder) + "</b><small>" + esc(r.email || "") + (r.is_public && r.profile_slug ? ' · <a href="/u/?' + encodeURIComponent(r.profile_slug) + '" target="_blank" rel="noopener">public profile</a>' : "") + "</small></td>" +
            "<td>" + esc(r.skill) + "</td><td>" + pct(r.score) + "</td><td>" + when(r.issued_at) + "</td>" +
            "<td>" + (r.revoked_at ? '<span class="adm-chip bad">Revoked</span>' : '<span class="adm-chip ok">Valid</span>') + "</td>" +
            "<td>" + (r.revoked_at ? "" : '<button class="adm-btn sm danger" type="button" data-revoke="' + esc(r.code) + '">Revoke</button>') + "</td></tr>";
        }).join("") + "</tbody></table></div>";
      body.querySelectorAll("[data-revoke]").forEach(function (b) {
        b.addEventListener("click", function () { revokeDialog(b.getAttribute("data-revoke")); });
      });
    }).catch(function (e) { body.innerHTML = errBox(e); });
  }
  function revokeDialog(code) {
    var d = document.createElement("div");
    d.className = "adm-dialog";
    d.innerHTML = '<form class="adm-dialog-card"><h3>Revoke ' + esc(code) + "?</h3>" +
      "<p>The certificate page will show it as revoked, it leaves the student's profile, Arena and the recruiter list, and the student sees your reason.</p>" +
      '<label>Reason (shown to the student)<textarea id="admRevokeWhy" rows="3" maxlength="300" required></textarea></label>' +
      '<div class="adm-dialog-msg" role="alert"></div>' +
      '<div class="adm-dialog-act"><button type="button" class="adm-btn" data-x>Cancel</button><button type="submit" class="adm-btn danger">Revoke certificate</button></div></form>';
    document.body.appendChild(d);
    var close = function () { d.remove(); };
    d.querySelector("[data-x]").onclick = close;
    d.addEventListener("click", function (e) { if (e.target === d) close(); });
    d.querySelector("textarea").focus();
    d.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var why = d.querySelector("textarea").value.trim(), msg = d.querySelector(".adm-dialog-msg");
      if (why.length < 5) { msg.textContent = "Please write a short reason."; return; }
      var btn = d.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = "Revoking…";
      rpc("admin_revoke_certificate", { p_code: code, p_reason: why }).then(function () { close(); loadCertificates(); loaded.overview = false; })
        .catch(function (err) { msg.textContent = (err && err.message) || "Couldn't revoke."; btn.disabled = false; btn.textContent = "Revoke certificate"; });
    });
  }

  /* ---------------------------------------------------------------- recruiters */
  function loadRecruiters() {
    var p = panel("recruiters");
    if (!p.dataset.ready) {
      p.dataset.ready = "1";
      p.innerHTML = '<div class="adm-head"><div><div class="adm-kicker">HR access</div><h2>Recruiters</h2>' +
        "<p>Companies request access from the HR login page. Only approved recruiters can see students who chose to be visible to recruiters.</p></div>" +
        '<select id="admRecStatus" aria-label="Request status"><option value="pending">Waiting for review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option></select></div>' +
        '<div id="admRecBody"></div>';
      $("#admRecStatus").addEventListener("change", loadRecruiters);
    }
    var body = $("#admRecBody");
    body.innerHTML = '<div class="adm-loading">Loading…</div>';
    rpc("admin_list_recruiters", { p_status: $("#admRecStatus").value }).then(function (rows) {
      var badge = $("#admRecBadge");
      if (badge && $("#admRecStatus").value === "pending") { badge.hidden = !rows.length; badge.textContent = rows.length; }
      if (!rows.length) {
        body.innerHTML = '<div class="adm-empty">No requests here. Recruiters can request access at <a href="/hr-login.html#request" target="_blank" rel="noopener">aldovra.com/hr-login.html</a>.</div>';
        return;
      }
      body.innerHTML = '<div class="adm-recs">' + rows.map(function (r) {
        var site = r.company_website && /^https?:\/\//i.test(r.company_website) ? '<a href="' + esc(r.company_website) + '" target="_blank" rel="noopener nofollow">' + esc(r.company_website.replace(/^https?:\/\//, "")) + "</a>" : "";
        var chips = (r.email_confirmed ? '<span class="adm-chip ok">email confirmed</span>' : '<span class="adm-chip warn">email not confirmed</span>') +
          (r.personal_email ? ' <span class="adm-chip warn">personal email</span>' : "");
        var stat = r.status === "approved" ? '<span class="adm-chip ok">approved</span>' : r.status === "rejected" ? '<span class="adm-chip bad">rejected</span>' : '<span class="adm-chip warn">waiting</span>';
        return '<div class="adm-rec"><div class="adm-rec-main">' +
          '<div class="adm-rec-top"><b>' + esc(r.full_name || "—") + "</b>" + stat + "</div>" +
          "<div>" + esc(r.designation || "Recruiter") + " · <b>" + esc(r.company_name || "Company not given") + "</b>" + (site ? " · " + site : "") + "</div>" +
          '<div class="adm-rec-meta"><span class="mono">' + esc(r.email || "") + "</span>" + (r.phone ? " · " + esc(r.phone) : "") + " · requested " + esc(when(r.created_at)) + "</div>" +
          '<div class="adm-rec-chips">' + chips + "</div>" +
          (r.admin_note ? '<div class="adm-rec-note">Note: ' + esc(r.admin_note) + "</div>" : "") +
          '</div><div class="adm-rec-act">' +
          (r.status !== "approved" ? '<button class="adm-btn ok" type="button" data-approve="' + esc(r.user_id) + '">Approve</button>' : "") +
          (r.status !== "rejected" ? '<button class="adm-btn danger" type="button" data-reject="' + esc(r.user_id) + '">' + (r.status === "approved" ? "Remove access" : "Reject") + "</button>" : "") +
          "</div></div>";
      }).join("") + "</div>";
      body.querySelectorAll("[data-approve]").forEach(function (b) {
        b.addEventListener("click", function () {
          b.disabled = true; b.textContent = "Approving…";
          rpc("admin_review_recruiter", { p_user: b.getAttribute("data-approve"), p_approve: true, p_note: null })
            .then(function () { loadRecruiters(); loaded.overview = false; })
            .catch(function (e) { b.disabled = false; b.textContent = "Approve"; alertBox(body, e); });
        });
      });
      body.querySelectorAll("[data-reject]").forEach(function (b) {
        b.addEventListener("click", function () { rejectDialog(b.getAttribute("data-reject")); });
      });
    }).catch(function (e) { body.innerHTML = errBox(e); });
  }
  function alertBox(el, e) { el.insertAdjacentHTML("afterbegin", errBox(e)); }
  function rejectDialog(userId) {
    var d = document.createElement("div");
    d.className = "adm-dialog";
    d.innerHTML = '<form class="adm-dialog-card"><h3>Reject this recruiter?</h3>' +
      "<p>They won't be able to see any student. They'll see your note when they try to sign in.</p>" +
      '<label>Note (optional, shown to them)<textarea rows="3" maxlength="300" placeholder="e.g. Please apply with your company email"></textarea></label>' +
      '<div class="adm-dialog-msg" role="alert"></div>' +
      '<div class="adm-dialog-act"><button type="button" class="adm-btn" data-x>Cancel</button><button type="submit" class="adm-btn danger">Reject</button></div></form>';
    document.body.appendChild(d);
    var close = function () { d.remove(); };
    d.querySelector("[data-x]").onclick = close;
    d.addEventListener("click", function (e) { if (e.target === d) close(); });
    d.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = d.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = "Rejecting…";
      rpc("admin_review_recruiter", { p_user: userId, p_approve: false, p_note: d.querySelector("textarea").value.trim() || null })
        .then(function () { close(); loadRecruiters(); loaded.overview = false; })
        .catch(function (err) { d.querySelector(".adm-dialog-msg").textContent = (err && err.message) || "Couldn't save."; btn.disabled = false; btn.textContent = "Reject"; });
    });
  }

  /* ---------------------------------------------------------------- payments */
  function loadPayments() {
    var p = panel("payments");
    if (!p.dataset.ready) {
      p.dataset.ready = "1";
      p.innerHTML = '<div class="adm-head"><div><div class="adm-kicker">PayU</div><h2>Payments</h2><p>Reattempt and new-skill payments. Amounts are in rupees.</p></div>' +
        '<select id="admPayStatus" aria-label="Payment status"><option value="all">All payments</option><option value="paid">Paid</option><option value="open">Started, not finished</option><option value="failed">Failed</option></select></div>' +
        '<div id="admPayBody"></div>';
      $("#admPayStatus").addEventListener("change", loadPayments);
    }
    var body = $("#admPayBody");
    body.innerHTML = '<div class="adm-loading">Loading…</div>';
    Promise.all([rpc("admin_list_payments", { p_status: $("#admPayStatus").value, p_limit: 300 }), rpc("admin_overview").catch(function () { return {}; })]).then(function (res) {
      var d = res[0], s = d.summary || {}, live = res[1].payments_live;
      var rows = d.rows || [];
      var chip = function (st) {
        var cls = st === "paid" ? "ok" : (st === "failed" || st === "cancelled") ? "bad" : "warn";
        return '<span class="adm-chip ' + cls + '">' + esc(st) + "</span>";
      };
      body.innerHTML =
        (live ? "" : '<div class="adm-banner warn"><b>Payments are OFF for students.</b> Everything below is from testing. Turn on with <code>reattempt_payments_live</code> after live keys are tested.</div>') +
        '<div class="adm-kpis">' +
          kpi("Collected (PayU)", inr(s.paid_amount), num(s.paid_count) + " paid") +
          kpi("Last 30 days", inr(s.paid_30d), "") +
          kpi("Started, not finished", num(s.open_count), "student left checkout or PayU pending", { alert: s.open_count > 0 }) +
          kpi("Failed", num(s.failed_count), "") +
          kpi("Paid, not used yet", num(s.unused_paid), "attempts students still have") +
        "</div>" +
        (rows.length
          ? '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Date</th><th>Student</th><th>For</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>' +
            rows.map(function (r) {
              return "<tr><td>" + when(r.paid_at || r.created_at) + "</td>" +
                "<td><b>" + esc(r.student) + "</b><small>" + esc(r.email || "") + "</small></td>" +
                "<td>" + esc(r.purpose === "new_skill" ? "New skill" : r.purpose === "reattempt" ? "Reattempt" : r.purpose || "—") + "<small>" + esc(r.assessment || "") + "</small></td>" +
                "<td><b>" + inr(r.amount) + "</b></td><td>" + chip(r.status) + (r.failure_reason ? "<small>" + esc(r.failure_reason) + "</small>" : "") + "</td>" +
                '<td><span class="mono">' + esc(r.provider_txn_id || "—") + "</span><small>" + esc(r.provider) + (r.provider_payment_id ? " · " + esc(r.provider_payment_id) : "") + "</small></td></tr>";
            }).join("") + "</tbody></table></div>"
          : '<div class="adm-empty">No payments for this filter.</div>');
    }).catch(function (e) { body.innerHTML = errBox(e); });
  }

  /* ---------------------------------------------------------------- system health */
  function healthIssues(h) {
    var out = [], j = h.jobs || {}, st = h.storage || {}, ai = h.ai || {};
    var syncMin = j.last_source_sync_at ? (Date.now() - Date.parse(j.last_source_sync_at)) / 60000 : Infinity;
    if (syncMin > 30) out.push("Job sync hasn't run for " + (isFinite(syncMin) ? Math.round(syncMin) + " min" : "a long time"));
    if (Number(j.student_visible_jobs) < 100) out.push("Only " + j.student_visible_jobs + " jobs visible to students");
    if (Number(j.new_jobs_24h) < 10) out.push("Only " + j.new_jobs_24h + " new jobs in 24 h");
    if (Number(j.sources_erroring) > Math.max(10, Number(j.sources_enabled) * 0.25)) out.push(j.sources_erroring + " job sources failing");
    (h.cron || []).forEach(function (c) {
      if (c.active && (c.last_status === "failed" || Number(c.failures_24h) > 3)) out.push("Cron " + c.name + " is failing");
    });
    if (st.storage_limit_bytes && st.storage_bytes / st.storage_limit_bytes > 0.8) out.push("File storage above 80%");
    if (st.db_limit_bytes && st.db_bytes / st.db_limit_bytes > 0.8) out.push("Database above 80%");
    if (Number(ai.resumes_stuck_analyzing) > 0) out.push(ai.resumes_stuck_analyzing + " resume(s) stuck analyzing");
    if (h.question_bank && h.question_bank.refill_paused_until && Date.parse(h.question_bank.refill_paused_until) > Date.now()) out.push("Question bank refill paused (Gemini rate limit)");
    return out;
  }
  function meter(label, used, limit) {
    var p = limit ? Math.min(100, used / limit * 100) : 0;
    return '<div class="adm-meter"><div class="adm-meter-top"><span>' + esc(label) + "</span><b>" + bytes(used) + " / " + bytes(limit) + "</b></div>" +
      '<div class="adm-meter-bar"><i style="width:' + p.toFixed(1) + '%" class="' + (p > 80 ? "bad" : p > 60 ? "warn" : "") + '"></i></div></div>';
  }
  function loadHealth() {
    var p = panel("health");
    p.innerHTML = '<div class="adm-head"><div><div class="adm-kicker">Under the hood</div><h2>System health</h2></div>' +
      '<button class="adm-btn" type="button" id="admHRefresh">Refresh</button></div><div id="admHBody"><div class="adm-loading">Checking…</div></div>';
    $("#admHRefresh").onclick = loadHealth;
    rpc("admin_system_health").then(function (h) {
      var issues = healthIssues(h), j = h.jobs || {}, q = h.question_bank || {}, ai = h.ai || {}, st = h.storage || {};
      var stat = function (k, v) { return "<div><small>" + esc(k) + "</small><b>" + v + "</b></div>"; };
      $("#admHBody").innerHTML =
        (issues.length
          ? '<div class="adm-banner bad"><b>' + issues.length + " issue" + (issues.length > 1 ? "s need" : " needs") + " attention</b><ul>" + issues.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul></div>"
          : '<div class="adm-banner ok"><b>Everything is running normally.</b> Checked ' + esc(when(h.checked_at)) + ".</div>") +
        '<div class="adm-grid2">' +
          '<div class="adm-card"><h3>Job pipeline</h3><div class="adm-stats">' +
            stat("Visible to students", num(j.student_visible_jobs)) + stat("Active jobs", num(j.active_jobs)) +
            stat("New in 24 h", num(j.new_jobs_24h)) + stat("Links checked 24 h", num(j.links_checked_24h)) +
            stat("Links live", pct(j.links_live_pct)) + stat("Last sync", ago(j.last_source_sync_at)) +
            stat("Sources", num(j.sources_enabled) + " on") + stat("Sources failing", num(j.sources_erroring)) +
          "</div></div>" +
          '<div class="adm-card"><h3>Question bank</h3><div class="adm-stats">' +
            stat("Active questions", num(q.active_total)) + stat("Skills", num(q.skills_total)) +
            stat("Skills below 300", num(q.skills_below_target)) + stat("Refill", q.refill_paused_until && Date.parse(q.refill_paused_until) > Date.now() ? "paused" : "running") +
          "</div>" + (q.lowest && q.lowest.length ? '<p class="adm-note">Lowest: ' + q.lowest.map(function (x) { return esc(x.skill_name) + " (" + x.active + ")"; }).join(", ") + ". Refill tops up the most-requested skills first.</p>" : "") + "</div>" +
          '<div class="adm-card"><h3>AI (Gemini)</h3><div class="adm-stats">' +
            stat("Resumes waiting AI retry", num(ai.resumes_waiting_ai_retry)) + stat("Stuck analyzing", num(ai.resumes_stuck_analyzing)) +
            stat("Keyword fallback (7 d)", num(ai.keyword_fallback_7d)) + stat("Payments", h.payments_live ? "ON" : "OFF") +
          '</div><p class="adm-note">If Gemini is down, resumes use keyword matching and are retried automatically; exams use the question bank.</p></div>' +
          '<div class="adm-card"><h3>Storage</h3>' + meter("Files (exam evidence, resumes)", st.storage_bytes, st.storage_limit_bytes) + meter("Database", st.db_bytes, st.db_limit_bytes) +
            '<div class="adm-buckets">' + (st.buckets || []).map(function (b) { return "<span>" + esc(b.bucket) + " · " + num(b.files) + " files · " + bytes(b.bytes) + "</span>"; }).join("") + "</div></div>" +
        "</div>" +
        '<div class="adm-card"><h3>Scheduled jobs</h3><div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Job</th><th>Schedule (UTC)</th><th>Last run</th><th>Runs 24 h</th><th>Failures 24 h</th></tr></thead><tbody>' +
          (h.cron || []).map(function (c) {
            var bad = c.last_status === "failed" || Number(c.failures_24h) > 0;
            return "<tr><td><b>" + esc(c.name.replace(/^aldovra-/, "")) + "</b>" + (c.active ? "" : ' <span class="adm-chip">paused</span>') + "</td>" +
              '<td class="mono">' + esc(c.schedule) + "</td>" +
              '<td><span class="adm-chip ' + (c.last_status === "succeeded" ? "ok" : c.last_status ? "bad" : "") + '">' + esc(c.last_status || "—") + "</span><small>" + esc(ago(c.last_start)) + "</small></td>" +
              "<td>" + num(c.runs_24h) + '</td><td class="' + (bad ? "bad" : "") + '">' + num(c.failures_24h) + "</td></tr>";
          }).join("") + "</tbody></table></div></div>";
    }).catch(function (e) { $("#admHBody").innerHTML = errBox(e); });
  }

  var LOADERS = { overview: loadOverview, recruiters: loadRecruiters, certificates: loadCertificates, payments: loadPayments, health: loadHealth };

  function ready(user) {
    document.body.classList.remove("adm-locked");
    var who = $("#admWho"); if (who && user) who.textContent = user.email || "";
    if (!$(".adm-tabs")) buildTabs();
    show(current(), true);
  }

  window.AldAdmin = { showGate: showGate, ready: ready };
  if (typeof window.__admGate === "string") showGate(window.__admGate);
  if (window.__admUser) ready(window.__admUser);
})();
