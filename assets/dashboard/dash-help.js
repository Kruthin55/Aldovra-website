/* Help & feedback (24 Nov 2026). A "Help" button (bottom-left; the Aldo dock is bottom-right) opens a form:
   category, message, optional payment ID. Saved to public.support_tickets with the page and browser, so students do
   not need to explain who they are. "My requests" shows status and our reply (admin_note). Admin → Support. */
(function () {
  "use strict";
  if (typeof db === "undefined") return;
  var user = null;
  var CATS = [
    ["payment", "Payment"], ["test", "Skill test"], ["resume", "Resume"], ["jobs", "Jobs"],
    ["account", "Login / account"], ["suggestion", "Suggestion"], ["other", "Other"]
  ];
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m) { (window.AldToast || window.alert)(m); };

  function button() {
    if (document.getElementById("aldHelpBtn")) return;
    var b = document.createElement("button");
    b.id = "aldHelpBtn"; b.type = "button"; b.className = "aldhp-btn";
    b.setAttribute("aria-haspopup", "dialog");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg><span>Help</span>';
    b.addEventListener("click", open);
    document.body.appendChild(b);
  }
  function catLabel(k) { for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === k) return CATS[i][1]; return k; }
  function when(v) { var d = new Date(v); return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }

  function close(box) { box.classList.remove("in"); setTimeout(function () { box.remove(); }, 200); document.removeEventListener("keydown", box._esc); var b = document.getElementById("aldHelpBtn"); if (b) b.focus(); }
  function open(preset) {
    if (document.querySelector(".aldhp")) return;
    var cat = typeof preset === "string" ? preset : "";
    var box = document.createElement("div");
    box.className = "aldhp";
    box.innerHTML =
      '<div class="aldhp-card" role="dialog" aria-modal="true" aria-labelledby="aldhpTitle">' +
        '<button class="aldhp-x" type="button" aria-label="Close" data-hp="close">×</button>' +
        '<div class="aldhp-kicker">We reply within 24 hours on working days</div>' +
        '<h2 id="aldhpTitle">How can we help?</h2>' +
        '<form id="aldhpForm" novalidate>' +
          '<div class="aldhp-cats" role="radiogroup" aria-label="Topic">' + CATS.map(function (c) {
            return '<button type="button" role="radio" aria-checked="' + (c[0] === cat) + '" data-cat="' + c[0] + '">' + c[1] + "</button>";
          }).join("") + "</div>" +
          '<label class="aldhp-pay" ' + (cat === "payment" ? "" : "hidden") + '>Payment ID or order ID <i>(from your bank / UPI app or the Razorpay email, optional)</i><input id="aldhpPay" maxlength="120" placeholder="pay_XXXXXXXX or UPI reference"></label>' +
          '<label>What happened? <i>(or your idea)</i><textarea id="aldhpMsg" maxlength="3000" rows="5" placeholder="Tell us what you tried, what you expected and what you saw. Screens or error text help."></textarea></label>' +
          '<div class="aldhp-foot"><button type="submit" class="aldhp-send">Send to Aldovra team</button><span id="aldhpMsgOut" role="status"></span></div>' +
        "</form>" +
        '<p class="aldhp-alt">Prefer email? <a href="mailto:support@aldovra.com">support@aldovra.com</a></p>' +
        '<div class="aldhp-mine" id="aldhpMine"></div>' +
      "</div>";
    document.body.appendChild(box);
    requestAnimationFrame(function () { box.classList.add("in"); });
    box._esc = function (e) { if (e.key === "Escape") close(box); };
    document.addEventListener("keydown", box._esc);
    var form = box.querySelector("#aldhpForm"), out = box.querySelector("#aldhpMsgOut"), pay = box.querySelector(".aldhp-pay");
    box.addEventListener("click", function (e) {
      if (e.target === box || e.target.closest("[data-hp=close]")) { close(box); return; }
      var c = e.target.closest("[data-cat]");
      if (!c) return;
      cat = c.getAttribute("data-cat");
      box.querySelectorAll("[data-cat]").forEach(function (b) { b.setAttribute("aria-checked", String(b === c)); });
      pay.hidden = cat !== "payment";
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = box.querySelector("#aldhpMsg").value.trim();
      out.className = "err";
      if (!cat) { out.textContent = "Please pick a topic."; return; }
      if (msg.length < 10) { out.textContent = "Please write a little more (at least 10 characters)."; return; }
      var btn = form.querySelector(".aldhp-send");
      btn.disabled = true; btn.textContent = "Sending…"; out.textContent = "";
      db.from("support_tickets").insert({
        category: cat, message: msg,
        payment_ref: cat === "payment" ? (box.querySelector("#aldhpPay").value.trim() || null) : null,
        page: (location.pathname + location.hash).slice(0, 300), user_agent: navigator.userAgent.slice(0, 400)
      }).then(function (r) {
        if (r.error) throw r.error;
        form.reset(); cat = ""; pay.hidden = true;
        box.querySelectorAll("[data-cat]").forEach(function (b) { b.setAttribute("aria-checked", "false"); });
        out.className = "ok"; out.textContent = "Sent. We will reply here and by email within 24 hours on working days.";
        mine(box);
      }).catch(function (err) {
        out.className = "err";
        out.textContent = /SUPPORT_DAILY_LIMIT/.test(String(err && err.message)) ? "You have sent 5 requests today. Please email support@aldovra.com if it is urgent." : "Could not send. Please email support@aldovra.com.";
      }).then(function () { btn.disabled = false; btn.textContent = "Send to Aldovra team"; });
    });
    mine(box);
    var first = box.querySelector(cat ? "#aldhpMsg" : "[data-cat]"); if (first) first.focus({ preventScroll: true });
  }
  function mine(box) {
    var el = box.querySelector("#aldhpMine");
    db.from("support_tickets").select("id,category,message,status,admin_note,created_at").order("created_at", { ascending: false }).limit(5)
      .then(function (r) {
        var rows = (r && r.data) || [];
        if (!rows.length) { el.innerHTML = ""; return; }
        el.innerHTML = "<h3>Your requests</h3>" + rows.map(function (t) {
          return '<div class="aldhp-row"><div><b>' + esc(catLabel(t.category)) + "</b> · " + esc(when(t.created_at)) +
            '<span class="aldhp-st ' + esc(t.status) + '">' + (t.status === "resolved" ? "Resolved" : "Open") + "</span></div>" +
            '<p class="aldhp-q">' + esc(t.message.length > 140 ? t.message.slice(0, 140) + "…" : t.message) + "</p>" +
            (t.admin_note ? '<p class="aldhp-a"><b>Our reply:</b> ' + esc(t.admin_note) + "</p>" : "") + "</div>";
        }).join("");
      }, function () {});
  }

  window.AldHelp = { open: open };
  document.addEventListener("aldovra:profile-loaded", function (e) { user = e && e.detail && e.detail.user; button(); });
  // Also show the button if the profile event fired before this script loaded.
  setTimeout(function () { db.auth.getUser().then(function (r) { if (r && r.data && r.data.user) button(); }, function () {}); }, 2500);
})();
