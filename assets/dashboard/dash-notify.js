/* Notifications that do something (5 Nov 2026): clicking one marks it read and takes the student
   to the right place (resume/welcome → next-step card, assessment → Assessments, certificate → Verified Profile). */
(function () {
  "use strict";
  if (typeof db === "undefined") return;
  var list = document.getElementById("notificationList");
  if (!list) return;

  function nav(section) {
    var el = document.querySelector('.sidebar .nav-item[data-section="' + section + '"]');
    if (el) el.click();
  }
  function closePanel() {
    var panel = document.getElementById("notificationPanel"), btn = document.getElementById("notificationBtn");
    if (panel) { panel.classList.remove("show"); panel.setAttribute("aria-hidden", "true"); }
    if (btn) btn.setAttribute("aria-expanded", "false");
  }
  function go(type, title) {
    var t = String(type || "").toLowerCase(), ti = String(title || "").toLowerCase();
    if (t === "certificate" || /verified|certificate/.test(ti)) return nav("verified-profile");
    if (t === "assessment") return nav("assessments");
    if (t === "screening") return nav("screening");
    if (t === "jobs") { var j = document.querySelector(".sidebar [data-ald-jobs-nav]"); if (j) j.click(); return; }
    nav("overview");
    setTimeout(function () {
      var card = document.querySelector(".aldm");
      if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("aldm-flash"); setTimeout(function () { card.classList.remove("aldm-flash"); }, 1600); }
    }, 350);
  }
  async function markRead(item) {
    var id = item.getAttribute("data-notification-id");
    if (!id || !item.classList.contains("unread")) return;
    item.classList.remove("unread");
    var dot = item.querySelector(".notification-unread-dot"); if (dot) dot.remove();
    var badge = document.getElementById("notificationBadge");
    if (badge) {
      var n = Math.max(0, (parseInt(badge.textContent, 10) || 1) - 1);
      badge.textContent = String(n);
      if (!n) badge.style.display = "none";
    }
    try {
      var uid = window.currentUser && window.currentUser.id;
      var q = db.from("notifications").update({ is_read: true }).eq("id", id);
      if (uid) q = q.eq("user_id", uid);
      await q;
      if (typeof window.loadNotifications === "function") window.loadNotifications();
    } catch (e) { console.warn("Could not mark notification read", e); }
  }
  function activate(item) {
    markRead(item);
    closePanel();
    var title = (item.querySelector("strong") || {}).textContent || "";
    go(item.getAttribute("data-notification-type"), title);
  }
  list.addEventListener("click", function (e) {
    var item = e.target.closest(".notification-item");
    if (item) activate(item);
  });
  list.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var item = e.target.closest(".notification-item");
    if (item) { e.preventDefault(); activate(item); }
  });
})();
