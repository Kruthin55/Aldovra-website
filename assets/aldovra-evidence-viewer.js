/* Aldovra exam-evidence viewer: shows the snapshot timeline (camera photo + screenshot pairs),
   flagged moments and the audio track from timeline.json. Works for students (own files),
   admins and HR pages that can read the assessment-evidence bucket.
   AldovraEvidence.render(containerEl, evidenceRow, supabaseClient) -> Promise<boolean> */
(function (global) {
  "use strict";
  var BUCKET = "assessment-evidence";
  var LABELS = {
    start: "Exam start", end: "Submitted", interval: "", tab_hidden: "Left the tab", window_blur: "Window lost focus",
    fullscreen_exit: "Exited fullscreen", screen_share_stopped: "Screen share stopped", blocked_shortcut: "Blocked shortcut"
  };
  var css =
    ".aev{display:grid;gap:14px;font:14px/1.5 'Inter Tight',Inter,system-ui,sans-serif;color:var(--text,#0d0d12)}" +
    ".aev-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}" +
    ".aev-head h3{margin:0;font-size:16px;letter-spacing:-.02em}" +
    ".aev-stats{display:flex;flex-wrap:wrap;gap:8px}" +
    ".aev-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:12px;background:rgba(79,70,229,.1);color:#4338ca;font-weight:600}" +
    ".aev-chip.warn{background:rgba(220,38,38,.1);color:#b91c1c}" +
    ".aev-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
    ".aev-tools button{border:1px solid var(--border,#e5e7eb);background:transparent;color:inherit;border-radius:999px;padding:6px 12px;font:inherit;font-size:12.5px;cursor:pointer}" +
    ".aev-tools button[aria-pressed=true]{background:#0d0d12;color:#fff;border-color:#0d0d12}" +
    ".aev audio{width:100%;max-width:520px;height:36px}" +
    ".aev-list{display:grid;gap:10px;max-height:560px;overflow:auto;padding-right:4px}" +
    ".aev-row{display:grid;grid-template-columns:86px 1fr 2fr;gap:10px;align-items:start;padding:10px;border:1px solid var(--border,#e5e7eb);border-radius:14px;background:var(--surface,#fff)}" +
    ".aev-row.flag{border-color:rgba(220,38,38,.45);background:color-mix(in srgb,#dc2626 5%,var(--surface,#fff))}" +
    ".aev-time{font:600 12px/1.4 'JetBrains Mono',ui-monospace,monospace;color:var(--muted,#6b7280)}" +
    ".aev-time b{display:block;color:#b91c1c;font-family:'Inter Tight',Inter,sans-serif;font-size:12px;margin-top:4px}" +
    ".aev-row a{display:block;border-radius:10px;overflow:hidden;background:#111;line-height:0}" +
    ".aev-row img{width:100%;height:auto;display:block}" +
    ".aev-empty{padding:14px;border:1px dashed var(--border,#e5e7eb);border-radius:14px;color:var(--muted,#6b7280)}" +
    "@media(max-width:620px){.aev-row{grid-template-columns:1fr 1fr}.aev-time{grid-column:1/-1}}";
  function injectCss() {
    if (document.getElementById("aev-css")) return;
    var s = document.createElement("style"); s.id = "aev-css"; s.textContent = css; document.head.appendChild(s);
  }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clock(iso, startIso) {
    var t = new Date(iso).getTime(), s = new Date(startIso).getTime();
    if (!isFinite(t)) return "";
    if (isFinite(s)) { var d = Math.max(0, Math.round((t - s) / 1000)); return String(Math.floor(d / 60)).padStart(2, "0") + ":" + String(d % 60).padStart(2, "0"); }
    return new Date(t).toLocaleTimeString("en-IN");
  }
  function signOne(db, path) {
    return db.storage.from(BUCKET).createSignedUrl(path, 1800).then(function (r) { return r.error ? null : r.data.signedUrl; });
  }
  function signMany(db, paths) {
    if (!paths.length) return Promise.resolve({});
    var out = {}, chunks = [];
    for (var i = 0; i < paths.length; i += 100) chunks.push(paths.slice(i, i + 100));
    return Promise.all(chunks.map(function (c) {
      return db.storage.from(BUCKET).createSignedUrls(c, 1800).then(function (r) {
        (r.data || []).forEach(function (x) { if (x && x.signedUrl) out[x.path] = x.signedUrl; });
      });
    })).then(function () { return out; });
  }

  function render(el, ev, db) {
    injectCss();
    if (!el || !ev) return Promise.resolve(false);
    if (ev.media_deleted_at && !ev.timeline_path) {
      el.innerHTML = '<div class="aev"><div class="aev-empty">Exam snapshots were deleted on ' +
        esc(new Date(ev.media_deleted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })) +
        ' under Aldovra\'s retention policy (7 days below 75%, 90 days after passing).</div></div>';
      return Promise.resolve(true);
    }
    if (!ev.timeline_path) return Promise.resolve(false);
    el.innerHTML = '<div class="aev"><div class="aev-empty">Loading exam snapshots…</div></div>';
    return signOne(db, ev.timeline_path).then(function (u) {
      if (!u) throw new Error("no timeline url");
      return fetch(u).then(function (r) { if (!r.ok) throw new Error("timeline " + r.status); return r.json(); });
    }).then(function (tl) {
      var snaps = Array.isArray(tl.snapshots) ? tl.snapshots : [];
      var paths = snaps.map(function (s) { return s.path; });
      if (tl.audio_path) paths.push(tl.audio_path);
      return signMany(db, paths).then(function (urls) { return { tl: tl, snaps: snaps, urls: urls }; });
    }).then(function (o) {
      var groups = {}, order = [];
      o.snaps.forEach(function (s) {
        if (!groups[s.seq]) { groups[s.seq] = { seq: s.seq, t: s.t, reason: s.reason }; order.push(s.seq); }
        groups[s.seq][s.kind] = s;
      });
      var flagged = order.filter(function (k) { var r = groups[k].reason; return r && r !== "interval" && r !== "start" && r !== "end"; });
      var events = Array.isArray(o.tl.events) ? o.tl.events : [];
      var started = o.tl.started_at;
      var rows = order.map(function (k) {
        var g = groups[k], flag = flagged.indexOf(k) !== -1;
        var cell = function (s, label) {
          var url = s && o.urls[s.path];
          return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" title="' + label + '"><img loading="lazy" src="' + esc(url) + '" alt="' + label + ' at ' + esc(clock(g.t, started)) + '"></a>' : '<div class="aev-empty">No ' + label.toLowerCase() + '</div>';
        };
        return '<div class="aev-row' + (flag ? " flag" : "") + '" data-flag="' + (flag ? 1 : 0) + '"><div class="aev-time">' + esc(clock(g.t, started)) +
          (LABELS[g.reason] ? "<b>" + esc(LABELS[g.reason]) + "</b>" : "") + "</div>" + cell(g.camera, "Camera") + cell(g.screen, "Screen") + "</div>";
      }).join("");
      var audioUrl = o.tl.audio_path && o.urls[o.tl.audio_path];
      el.innerHTML =
        '<div class="aev">' +
          '<div class="aev-head"><h3>📸 Exam snapshots</h3><div class="aev-stats">' +
            '<span class="aev-chip">' + order.length + " moments · every " + esc(o.tl.interval_seconds || 20) + "s</span>" +
            '<span class="aev-chip' + (flagged.length ? " warn" : "") + '">' + flagged.length + " flagged</span>" +
            (events.length ? '<span class="aev-chip">' + events.length + " events logged</span>" : "") +
          "</div></div>" +
          (audioUrl ? '<div><div style="font-weight:600;margin-bottom:4px">🎙️ Exam audio</div><audio controls preload="none" src="' + esc(audioUrl) + '"></audio></div>' : "") +
          (flagged.length ? '<div class="aev-tools"><button type="button" data-aev="all" aria-pressed="true">All moments</button><button type="button" data-aev="flag" aria-pressed="false">Flagged only</button></div>' : "") +
          '<div class="aev-list">' + (rows || '<div class="aev-empty">No snapshots were saved for this attempt.</div>') + "</div>" +
        "</div>";
      el.querySelectorAll("[data-aev]").forEach(function (b) {
        b.addEventListener("click", function () {
          var only = b.getAttribute("data-aev") === "flag";
          el.querySelectorAll("[data-aev]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          el.querySelectorAll(".aev-row").forEach(function (r) { r.style.display = only && r.getAttribute("data-flag") !== "1" ? "none" : ""; });
        });
      });
      return true;
    }).catch(function (e) {
      console.warn("Evidence viewer:", e && e.message);
      el.innerHTML = '<div class="aev"><div class="aev-empty">Exam snapshots are not available right now.</div></div>';
      return true;
    });
  }

  global.AldovraEvidence = { render: render };
})(window);
