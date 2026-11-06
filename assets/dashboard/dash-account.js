/* "Delete my account" (6 Nov 2026). Adds a small danger-zone row at the bottom of the profile modal and a
   confirm dialog. Calls the edge function delete-account (removes storage files, then purge_user_account).
   Needs the global `db` from dash-main.js. */
(function () {
  "use strict";
  var FN = "https://lgefwfrjzweayfxahogs.supabase.co/functions/v1/delete-account";

  var css =
    ".aldd-zone{margin-top:22px;padding-top:16px;border-top:1px dashed rgba(127,127,140,.35);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}" +
    ".aldd-zone p{margin:0;font-size:13px;color:var(--muted,#6b6b76);max-width:44ch}" +
    ".aldd-link{background:none;border:1px solid rgba(220,38,38,.35);color:#b91c1c;border-radius:999px;height:36px;padding:0 14px;font:600 13px/1 inherit;cursor:pointer}" +
    ".aldd-link:hover{background:#fef2f2;border-color:#dc2626}" +
    ".aldd-back{position:fixed;inset:0;z-index:10050;background:rgba(13,13,18,.55);backdrop-filter:blur(4px);display:grid;place-items:center;padding:16px}" +
    ".aldd-box{width:min(460px,100%);box-sizing:border-box;background:#fff;color:#0d0d12;border-radius:22px;padding:26px;box-shadow:0 40px 90px -30px rgba(0,0,0,.5);max-height:calc(100vh - 32px);overflow:auto}" +
    ".aldd-box h3{margin:0 0 6px;font-size:22px;letter-spacing:-.02em}" +
    ".aldd-box>p{margin:0 0 14px;color:#55555f;font-size:14px;line-height:1.5}" +
    ".aldd-box ul{margin:0 0 16px;padding-left:18px;font-size:13.5px;line-height:1.6;color:#33333b}" +
    ".aldd-box label{display:block;font-size:12.5px;font-weight:600;margin:12px 0 6px}" +
    ".aldd-box select,.aldd-box input{width:100%;box-sizing:border-box;height:42px;border:1px solid #d9d8d2;border-radius:12px;padding:0 12px;font:inherit;background:#fff;color:#0d0d12}" +
    ".aldd-box input:focus,.aldd-box select:focus{outline:2px solid #4f46e5;outline-offset:1px}" +
    ".aldd-row{display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap}" +
    ".aldd-row button{height:42px;padding:0 18px;border-radius:999px;font:600 14px/1 inherit;cursor:pointer;border:1px solid #d9d8d2;background:#fff;color:#0d0d12}" +
    ".aldd-row .aldd-go{background:#dc2626;border-color:#dc2626;color:#fff}" +
    ".aldd-row .aldd-go:disabled{opacity:.45;cursor:not-allowed}" +
    ".aldd-msg{margin-top:10px;font-size:13px;color:#b91c1c;min-height:1em}" +
    ".aldd-note{font-size:12.5px;color:#6b6b76;background:#f3f2ee;border-radius:12px;padding:10px 12px;line-height:1.5}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function addZone() {
    var anchor = document.getElementById("profileMessage");
    if (!anchor || document.querySelector(".aldd-zone")) return;
    var z = document.createElement("div");
    z.className = "aldd-zone";
    z.innerHTML = "<p>Want to leave Aldovra? You can delete your account and all your data at any time.</p>" +
      '<button type="button" class="aldd-link" id="alddOpen">Delete my account</button>';
    anchor.insertAdjacentElement("afterend", z);
    z.querySelector("#alddOpen").addEventListener("click", openDialog);
  }

  function openDialog() {
    var back = document.createElement("div");
    back.className = "aldd-back";
    back.innerHTML =
      '<div class="aldd-box" role="dialog" aria-modal="true" aria-labelledby="alddTitle">' +
        '<h3 id="alddTitle">Delete your account?</h3>' +
        "<p>This is permanent. We can't undo it or bring your data back.</p>" +
        "<ul><li>Your profile, resume and resume analysis</li><li>Assessment attempts, scores, reports and exam evidence</li>" +
        "<li>Certificates and your public profile link (old links will stop working)</li><li>Saved and applied jobs, notifications and Arena rank</li></ul>" +
        '<div class="aldd-note">Payment records (amount and transaction ID) are kept without your contact details, because tax law requires us to keep them.</div>' +
        '<label for="alddReason">Why are you leaving? (optional)</label>' +
        '<select id="alddReason"><option value="">Prefer not to say</option><option>I got a job</option><option>Not enough jobs for me</option>' +
        "<option>Assessments were not useful</option><option>Too many emails or notifications</option><option>Privacy concerns</option><option>Created a second account by mistake</option><option>Other</option></select>" +
        '<label for="alddConfirm">Type DELETE to confirm</label>' +
        '<input id="alddConfirm" autocomplete="off" spellcheck="false" placeholder="DELETE">' +
        '<div class="aldd-msg" id="alddMsg" role="status"></div>' +
        '<div class="aldd-row"><button type="button" id="alddCancel">Keep my account</button>' +
        '<button type="button" class="aldd-go" id="alddGo" disabled>Delete permanently</button></div>' +
      "</div>";
    document.body.appendChild(back);
    var input = back.querySelector("#alddConfirm"), go = back.querySelector("#alddGo"), msg = back.querySelector("#alddMsg");
    var busy = false;
    function close() { if (!busy) { back.remove(); document.removeEventListener("keydown", onKey); } }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    back.querySelector("#alddCancel").addEventListener("click", close);
    input.addEventListener("input", function () { go.disabled = input.value.trim() !== "DELETE"; });
    setTimeout(function () { input.focus(); }, 30);

    go.addEventListener("click", async function () {
      if (busy || input.value.trim() !== "DELETE") return;
      busy = true; go.disabled = true; go.textContent = "Deleting…"; msg.textContent = "";
      try {
        var s = await window.db.auth.getSession();
        var token = s && s.data && s.data.session && s.data.session.access_token;
        if (!token) throw new Error("SESSION");
        var res = await fetch(FN, {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: "DELETE", reason: back.querySelector("#alddReason").value || null })
        });
        var out = await res.json().catch(function () { return {}; });
        if (!res.ok || !out.ok) {
          throw new Error(out.error === "ADMIN_ACCOUNT" ? "ADMIN" : "FAILED");
        }
        try {
          Object.keys(localStorage).forEach(function (k) { if (/^(aldovra|sb-)/.test(k)) localStorage.removeItem(k); });
          sessionStorage.clear();
        } catch (e) {}
        try { await window.db.auth.signOut({ scope: "local" }); } catch (e) {}
        location.replace("/?account=deleted");
      } catch (e) {
        busy = false; go.disabled = false; go.textContent = "Delete permanently";
        msg.textContent = e.message === "ADMIN" ? "Admin accounts can't be deleted from here."
          : e.message === "SESSION" ? "Your session expired. Please log in again and retry."
          : "Your account was not deleted. Please try again, or write to support@aldovra.com and we will do it for you.";
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addZone); else addZone();
  document.addEventListener("aldovra:profile-loaded", addZone);
})();
