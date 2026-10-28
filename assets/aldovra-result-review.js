/* Aldovra: professional "View Result" panel for the dashboard + a reusable environment-video
   link form (also used on the post-exam result screen).

   AldovraVideoLink.mount(el, {db, sessionId, onDone(data), compact})
   AldovraResultReview.render(modalBodyEl, model, {onClose, onSubmitted, db}) */
(function (global) {
  "use strict";
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var reduce = false; try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var css =
  /* video link form */
  ".avl{display:grid;gap:10px}" +
  ".avl-steps{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none;font-size:12.5px;color:var(--rr-muted,#6b6b76)}" +
  ".avl-steps li{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:var(--rr-chip,rgba(13,13,18,.05))}" +
  ".avl-steps b{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#0d0d12;color:#fff;font-size:10.5px}" +
  ".avl-row{display:flex;gap:8px;flex-wrap:wrap}" +
  ".avl input{flex:1 1 260px;min-width:0;height:48px;padding:0 16px;border-radius:14px;border:1px solid var(--rr-line,rgba(13,13,18,.14));background:var(--rr-card,#fff);color:inherit;font:inherit;font-size:15px;outline:none;transition:border-color .2s,box-shadow .2s}" +
  ".avl input:focus{border-color:#4f46e5;box-shadow:0 0 0 4px rgba(79,70,229,.14)}" +
  ".avl input.bad{border-color:#dc2626;box-shadow:0 0 0 4px rgba(220,38,38,.12)}" +
  ".avl button.avl-go{height:48px;padding:0 22px;border-radius:999px;border:0;background:#0d0d12;color:#fff;font:600 15px/1 'Inter Tight',Inter,system-ui,sans-serif;cursor:pointer;transition:transform .3s,background .3s}" +
  ".avl button.avl-go:hover{background:linear-gradient(100deg,#4f46e5,#7c3aed);transform:translateY(-1px)}" +
  ".avl button.avl-go:disabled{opacity:.6;cursor:progress;transform:none}" +
  ".avl-msg{font-size:13px;min-height:18px;color:var(--rr-muted,#6b6b76)}" +
  ".avl-msg.err{color:#b91c1c}.avl-msg.ok{color:#15803d;font-weight:600}" +
  ".avl-done{display:flex;gap:12px;align-items:center;padding:14px 16px;border-radius:14px;background:rgba(22,163,74,.1);color:#15803d;font-weight:600}" +
  ".avl-done i{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#16a34a;color:#fff;font-style:normal}" +
  ".avl-tip{font-size:12.5px;color:var(--rr-muted,#6b6b76)}" +
  ".avl-tip a{color:#4f46e5;font-weight:600;text-decoration:none}.avl-tip a:hover{text-decoration:underline}" +
  /* review panel */
  "#assessmentModal .assessment-result-modal.rr-mode{max-width:min(980px,calc(100vw - 24px))!important;width:100%;padding:0!important;border-radius:26px!important;overflow:hidden}" +
  "#assessmentModal .rr-mode .modal-body{padding:0!important}" +
  ".rr{--rr-ink:#0d0d12;--rr-muted:#6b6b76;--rr-line:rgba(13,13,18,.1);--rr-card:#fff;--rr-bg:#f6f5f1;--rr-chip:rgba(13,13,18,.05);--ease:cubic-bezier(.22,1,.36,1);background:var(--rr-bg);color:var(--rr-ink);font-family:'Inter Tight',Inter,system-ui,-apple-system,sans-serif;max-height:min(88vh,980px);overflow:auto}" +
  "[data-theme=dark] .rr{--rr-ink:#f3f2ee;--rr-muted:#a9a6b6;--rr-line:rgba(255,255,255,.1);--rr-card:#17141f;--rr-bg:#0f0d15;--rr-chip:rgba(255,255,255,.06)}" +
  "[data-theme=dark] .avl button.avl-go,[data-theme=dark] .avl-steps b{background:#f3f2ee;color:#0d0d12}" +
  ".rr-pass{--acc:#16a34a;--acc-soft:rgba(22,163,74,.12)}.rr-near{--acc:#b45309;--acc-soft:rgba(180,83,9,.12)}.rr-low{--acc:#4f46e5;--acc-soft:rgba(79,70,229,.12)}.rr-wait{--acc:#7c3aed;--acc-soft:rgba(124,58,237,.12)}.rr-bad{--acc:#b91c1c;--acc-soft:rgba(185,28,28,.1)}" +
  ".rr-top{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 22px;background:color-mix(in srgb,var(--rr-bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--rr-line)}" +
  ".rr-top span{font:500 11.5px/1.3 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--rr-muted)}" +
  ".rr-top span b{color:var(--rr-ink);font-weight:600}" +
  ".rr-x{width:38px;height:38px;border-radius:50%;border:1px solid var(--rr-line);background:var(--rr-card);color:var(--rr-ink);font-size:16px;cursor:pointer;transition:transform .3s var(--ease)}" +
  ".rr-x:hover{transform:rotate(90deg)}" +
  ".rr-wrap{padding:26px 26px 30px;display:grid;gap:18px}" +
  ".rr-wrap>*{opacity:0;transform:translateY(16px);transition:opacity .6s var(--ease),transform .7s var(--ease)}" +
  ".rr.in .rr-wrap>*{opacity:1;transform:none}" +
  ".rr.in .rr-wrap>:nth-child(2){transition-delay:.06s}.rr.in .rr-wrap>:nth-child(3){transition-delay:.12s}.rr.in .rr-wrap>:nth-child(4){transition-delay:.18s}.rr.in .rr-wrap>:nth-child(5){transition-delay:.24s}.rr.in .rr-wrap>:nth-child(6){transition-delay:.3s}" +
  ".rr-hero{display:grid;grid-template-columns:168px 1fr;gap:26px;align-items:center;padding:22px;border-radius:22px;background:var(--rr-card);border:1px solid var(--rr-line)}" +
  ".rr-ring{position:relative;width:168px;height:168px}" +
  ".rr-ring svg{width:100%;height:100%;transform:rotate(-90deg)}" +
  ".rr-ring circle{fill:none;stroke-width:11}.rr-ring .t{stroke:var(--rr-chip)}" +
  ".rr-ring .v{stroke:url(#rrg);stroke-linecap:round;transition:stroke-dashoffset 1.6s var(--ease)}" +
  ".rr-pass .rr-ring .v{stroke:#16a34a}" +
  ".rr-ring .m{stroke:var(--rr-ink);stroke-width:2.5;opacity:.5}" +
  ".rr-num{position:absolute;inset:0;display:grid;place-content:center;text-align:center}" +
  ".rr-num strong{font-size:40px;font-weight:700;letter-spacing:-.05em;line-height:1}" +
  ".rr-num small{font:500 10px/1.4 'JetBrains Mono',monospace;color:var(--rr-muted);text-transform:uppercase;margin-top:6px}" +
  ".rr-chip{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:var(--acc-soft);color:var(--acc);font:600 11.5px/1 'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.04em}" +
  ".rr-chip::before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor}" +
  ".rr-goal{margin-left:6px;font:500 11.5px/1 'JetBrains Mono',monospace;color:var(--rr-muted);text-transform:uppercase;letter-spacing:.04em}" +
  ".rr-hero h2{margin:12px 0 8px;font-size:clamp(1.6rem,3.6vw,2.4rem);line-height:1.02;letter-spacing:-.045em;font-weight:650}" +
  ".rr-hero h2 em{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-weight:400;letter-spacing:-.01em;color:var(--acc)}" +
  ".rr-hero p{margin:0;color:var(--rr-muted);font-size:15px;line-height:1.55;max-width:560px}" +
  ".rr-stats{display:grid;grid-template-columns:repeat(5,1fr);border-radius:18px;overflow:hidden;border:1px solid var(--rr-line);background:var(--rr-card)}" +
  ".rr-stats div{padding:14px 16px;border-right:1px solid var(--rr-line)}.rr-stats div:last-child{border-right:0}" +
  ".rr-stats b{display:block;font-size:22px;letter-spacing:-.04em;font-weight:650}" +
  ".rr-stats span{font-size:12px;color:var(--rr-muted)}" +
  ".rr-stats .c b{color:#16a34a}.rr-stats .w b{color:#dc2626}" +
  ".rr-card{padding:20px 22px;border-radius:20px;background:var(--rr-card);border:1px solid var(--rr-line)}" +
  ".rr-card h3{margin:0 0 4px;font-size:17px;letter-spacing:-.025em}" +
  ".rr-card>p{margin:0 0 14px;color:var(--rr-muted);font-size:14px;line-height:1.5}" +
  ".rr-next{border-color:color-mix(in srgb,var(--acc) 40%,var(--rr-line));box-shadow:0 24px 50px -36px color-mix(in srgb,var(--acc) 80%,transparent)}" +
  ".rr-track{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:2px 0 4px;list-style:none;padding:0}" +
  ".rr-track li{position:relative;padding-top:30px;font-size:12.5px;color:var(--rr-muted);text-align:center}" +
  ".rr-track li::before{content:'';position:absolute;top:8px;left:50%;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:var(--rr-card);border:2px solid var(--rr-line);z-index:1;box-sizing:border-box}" +
  ".rr-track li::after{content:'';position:absolute;top:16px;left:-50%;width:100%;height:2px;background:var(--rr-line)}" +
  ".rr-track li:first-child::after{display:none}" +
  ".rr-track li.done{color:var(--rr-ink);font-weight:600}.rr-track li.done::before{background:#16a34a;border-color:#16a34a}.rr-track li.done::after{background:#16a34a}" +
  ".rr-track li.now{color:var(--acc);font-weight:700}.rr-track li.now::before{border-color:var(--acc);box-shadow:0 0 0 5px var(--acc-soft)}.rr-track li.now::after{background:linear-gradient(90deg,#16a34a,var(--acc))}" +
  ".rr-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:18px}" +
  ".rr-bar{margin-bottom:12px}.rr-bar p{display:flex;justify-content:space-between;margin:0 0 6px;font-size:14px}" +
  ".rr-bar p em{font-style:normal;font:600 10px/1 'JetBrains Mono',monospace;text-transform:uppercase;color:#b45309;background:rgba(180,83,9,.1);padding:3px 7px;border-radius:999px;margin-left:6px}" +
  ".rr-bar .b{height:8px;border-radius:99px;background:var(--rr-chip);overflow:hidden}" +
  ".rr-bar .b i{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#4f46e5,#7c3aed);transition:width 1.2s var(--ease)}" +
  ".rr-int{display:grid;gap:8px}" +
  ".rr-int div{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:12px;background:var(--rr-chip);font-size:13.5px}" +
  ".rr-int b{font-variant-numeric:tabular-nums}.rr-int .warn b{color:#b91c1c}" +
  ".rr-ok{display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:12px;background:rgba(22,163,74,.08);color:#15803d;font-weight:600;font-size:14px}" +
  ".rr-actions{display:flex;flex-wrap:wrap;gap:10px}" +
  ".rr-btn{display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 20px;border-radius:999px;border:1px solid var(--rr-line);background:transparent;color:var(--rr-ink);font:600 14px/1 'Inter Tight',Inter,sans-serif;text-decoration:none;cursor:pointer}" +
  ".rr-btn:hover{border-color:#4f46e5;color:#4f46e5}" +
  ".rr-foot{font:500 11.5px/1.5 'JetBrains Mono',monospace;color:var(--rr-muted)}" +
  "@media(max-width:760px){.rr-wrap{padding:18px 14px 24px}.rr-hero{grid-template-columns:1fr;justify-items:center;text-align:center}.rr-hero p{margin:0 auto}.rr-ring{width:150px;height:150px}.rr-stats{grid-template-columns:repeat(3,1fr)}.rr-stats div:nth-child(3){border-right:0}.rr-stats div:nth-child(-n+3){border-bottom:1px solid var(--rr-line)}.rr-grid{grid-template-columns:1fr}.rr-track li{font-size:11px}}" +
  "@media(prefers-reduced-motion:reduce){.rr-wrap>*{opacity:1!important;transform:none!important;transition:none!important}}";
  function injectCss() {
    if (document.getElementById("rr-css")) return;
    var s = document.createElement("style"); s.id = "rr-css"; s.textContent = css; document.head.appendChild(s);
  }

  /* ---------- environment video link form ---------- */
  function isYouTube(u) {
    try {
      var x = new URL(u), h = x.hostname.replace(/^www\./, "");
      return h === "youtu.be" || h === "youtube.com" || h === "m.youtube.com";
    } catch (e) { return false; }
  }
  function mountVideoLink(el, o) {
    injectCss();
    o = o || {};
    el.innerHTML =
      '<div class="avl">' +
        '<ol class="avl-steps"><li><b>1</b>Upload your phone video to YouTube</li><li><b>2</b>Visibility: <strong>Unlisted</strong></li><li><b>3</b>Paste the link here</li></ol>' +
        '<div class="avl-row"><input type="url" inputmode="url" autocomplete="url" placeholder="https://youtu.be/…" aria-label="YouTube Unlisted video link">' +
        '<button type="button" class="avl-go">Submit video link</button></div>' +
        '<div class="avl-msg" role="status" aria-live="polite"></div>' +
        '<div class="avl-tip">Use a new video for every attempt. ' + (global.AldovraEnvGuide ? '<a href="#" data-env-guide>▶ Watch the 30-sec guide</a>' : "") + "</div>" +
      "</div>";
    var input = el.querySelector("input"), btn = el.querySelector(".avl-go"), msg = el.querySelector(".avl-msg");
    function say(t, cls) { msg.textContent = t; msg.className = "avl-msg" + (cls ? " " + cls : ""); }
    input.addEventListener("input", function () { input.classList.remove("bad"); say(""); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });
    btn.addEventListener("click", function () {
      var url = String(input.value || "").trim();
      if (!url) { input.classList.add("bad"); input.focus(); return say("Paste your YouTube Unlisted video link first.", "err"); }
      if (!isYouTube(url)) { input.classList.add("bad"); input.focus(); return say("This doesn't look like a YouTube link. Copy it from YouTube → Share.", "err"); }
      btn.disabled = true; btn.textContent = "Saving…"; say("Saving your link…");
      o.db.functions.invoke("submit-environment-video-link", { body: { session_id: o.sessionId, youtube_url: url } })
        .then(function (res) {
          if (res.error) {
            var ctx = res.error.context;
            return (ctx && typeof ctx.json === "function" ? ctx.json().catch(function () { return {}; }) : Promise.resolve({})).then(function (p) {
              throw new Error((p && (p.error || p.message)) || res.error.message || "Could not save the video link.");
            });
          }
          if (!res.data || !res.data.success) throw new Error((res.data && res.data.error) || "Could not save the video link.");
          el.innerHTML = '<div class="avl-done"><i>✓</i><div>Video link submitted. Aldovra will review it and update your verification.</div></div>';
          if (o.onDone) o.onDone(res.data);
        })
        .catch(function (e) {
          btn.disabled = false; btn.textContent = "Submit video link";
          say((e && e.message) || "Could not save the link. Please check it and try again.", "err");
        });
    });
    return { focus: function () { input.focus(); } };
  }

  /* ---------- review panel ---------- */
  var EVENT_LABELS = {
    tab_hidden: "Left the exam tab", window_blur: "Switched window", fullscreen_exit: "Exited fullscreen",
    screen_share_stopped: "Stopped screen share", blocked_shortcut: "Blocked copy/paste shortcut"
  };

  function render(host, m, o) {
    injectCss();
    o = o || {};
    var modalBox = host.closest && host.closest(".assessment-result-modal");
    if (modalBox) modalBox.classList.add("rr-mode");
    var pct = Math.max(0, Math.min(100, Number(m.percentage) || 0));
    var pctText = (Math.round(pct * 10) / 10).toString();

    var state = m.evaluating ? "evaluating" : m.rejected ? "rejected" : m.videoPending ? "video" : m.underReview ? "review"
      : m.verified ? "verified" : m.unverified ? "unverified" : "reattempt";
    var tone = state === "verified" ? "pass" : state === "rejected" || state === "unverified" ? "bad"
      : (state === "video" || state === "review") && pct >= 75 ? "wait" : pct >= 75 ? "pass" : pct >= 65 ? "near" : "low";

    var head = {
      evaluating: ["Evaluating", "Scoring your <em>answers…</em>", "This usually takes a few seconds. Refresh if it doesn't update."],
      video: pct >= 75
        ? ["Almost verified", "You passed — <em>one step left.</em>", "Submit your exam environment video link to complete verification."]
        : ["Score ready", pct >= 65 ? "So close — <em>keep going.</em>" : "Good start — <em>let's level up.</em>", "Submit your environment video link to complete this attempt's record."],
      review: ["Under review", "Your video is <em>being reviewed.</em>", "Aldovra is checking your environment video. Your status updates here once the review is done."],
      verified: ["Verified", "Skill <em>verified.</em>", "Your score and environment video are approved. This skill now shows as verified to recruiters."],
      rejected: ["Video not approved", "Please <em>re-upload</em> your video.", "Your previous environment video was not approved. Record a new one and submit a different Unlisted link."],
      unverified: ["Not verified", "Verification <em>not approved.</em>", m.message || "Please review the feedback or contact Aldovra support."],
      reattempt: ["Reattempt needed", pct >= 65 ? "Almost there — <em>65%+.</em>" : "Good start — <em>let's level up.</em>", "75% is needed for verification. Practise your weaker topics and try again."]
    }[state];

    var stepIndex = state === "evaluating" ? 2 : state === "review" ? 4 : 3;
    var steps = ["Exam submitted", "Score ready", "Environment video", "Verified"];
    var track = '<ol class="rr-track">' + steps.map(function (s, i) {
      var n = i + 1, cls = state === "verified" || n < stepIndex ? "done" : n === stepIndex ? "now" : "";
      return '<li class="' + cls + '">' + esc(s) + "</li>";
    }).join("") + "</ol>";

    var nextHtml = "";
    if (state === "video" || state === "rejected") {
      nextHtml = '<section class="rr-card rr-next"><h3>' + (state === "rejected" ? "Upload a new environment video" : "Submit your environment video") + '</h3><p>Your phone recording of the exam room, uploaded to YouTube as Unlisted.</p>' + track + '<div data-rr-video style="margin-top:14px"></div></section>';
    } else if (state === "review") {
      nextHtml = '<section class="rr-card rr-next"><h3>What happens next</h3><p>Reviews usually finish within 24–48 hours. Keep the video Unlisted (not Private) until then.</p>' + track +
        (m.videoUrl ? '<div class="rr-actions" style="margin-top:14px"><a class="rr-btn" href="' + esc(m.videoUrl) + '" target="_blank" rel="noopener">▶ Open submitted video</a></div>' : "") + "</section>";
    } else if (state === "verified") {
      nextHtml = '<section class="rr-card rr-next"><h3>Make it count</h3><p>Verified skills earn Arena points and appear on your profile for recruiters.</p>' + track +
        '<div class="rr-actions" style="margin-top:14px"><a class="rr-btn" href="#jobs" data-rr-close>Explore fresher jobs →</a><a class="rr-btn" href="#leaderboard" data-rr-close>See your Arena rank</a></div></section>';
    } else if (state === "reattempt" || state === "unverified") {
      var feeLine = m.reattemptFee == null ? "" : (m.paymentsLive ? "Reattempt fee: <b>₹" + esc(m.reattemptFee) + "</b>" : "Reattempts are <b>free</b> right now");
      nextHtml = '<section class="rr-card rr-next"><h3>Plan your reattempt</h3><p>' + (m.reattemptFrom ? "Next attempt opens " + esc(m.reattemptFrom) + ". " : "") + feeLine + (feeLine ? ". " : "") + "Max 4 attempts per 30 days.</p>" + track + "</section>";
    }

    var cats = (m.categories || []).slice().sort(function (a, b) { return a[1] - b[1]; });
    var catHtml = cats.length ? cats.map(function (c, i) {
      return '<div class="rr-bar"><p><span>' + esc(c[0]) + (i === 0 && c[1] < 75 && cats.length > 1 ? "<em>Focus here</em>" : "") + "</span><b>" + esc(Math.round(c[1])) + '%</b></p><div class="b"><i style="--w:' + c[1] + '%"></i></div></div>';
    }).join("") : '<p style="color:var(--rr-muted);margin:0">Topic-wise scores are not available for this attempt.</p>';

    var R = 70, C = 2 * Math.PI * R;
    host.innerHTML =
      '<div class="rr rr-' + tone + '" role="document">' +
        '<div class="rr-top"><span>[ Aldovra ] Result · <b>' + esc(m.assessmentName) + '</b></span><button type="button" class="rr-x" aria-label="Close result">✕</button></div>' +
        '<div class="rr-wrap">' +
          '<section class="rr-hero">' +
            '<div class="rr-ring"><svg viewBox="0 0 168 168" aria-hidden="true"><defs><linearGradient id="rrg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#9d5cf6"/></linearGradient></defs>' +
              '<circle class="t" cx="84" cy="84" r="' + R + '"/><circle class="v" cx="84" cy="84" r="' + R + '" style="stroke-dasharray:' + C.toFixed(2) + ";stroke-dashoffset:" + C.toFixed(2) + '"/><line class="m" x1="84" y1="6" x2="84" y2="20"/></svg>' +
              '<div class="rr-num"><strong>' + (reduce ? pctText : "0") + '%</strong><small>Your score</small></div></div>' +
            '<div><span class="rr-chip">' + esc(head[0]) + "</span> <span class=\"rr-goal\">75% needed to verify</span><h2>" + head[1] + "</h2><p>" + esc(head[2]) + "</p></div>" +
          "</section>" +
          '<section class="rr-stats">' +
            '<div class="c"><b>' + esc(m.correct) + "</b><span>Correct</span></div>" +
            '<div class="w"><b>' + esc(m.incorrect) + "</b><span>Incorrect</span></div>" +
            "<div><b>" + esc(m.unanswered) + "</b><span>Unanswered</span></div>" +
            "<div><b>" + esc(m.duration) + "</b><span>Time taken</span></div>" +
            "<div><b>#" + esc(m.attemptNumber) + "</b><span>Attempt</span></div>" +
          "</section>" +
          nextHtml +
          '<div class="rr-grid">' +
            '<section class="rr-card"><h3>Topic breakdown</h3><p>Weakest topics first.</p>' + catHtml + "</section>" +
            '<section class="rr-card"><h3>Exam integrity</h3><p>Activity recorded by monitoring during your exam.</p><div class="rr-int" data-rr-integrity><div><span>Loading…</span></div></div></section>' +
          "</div>" +
          '<p class="rr-foot">' + esc(m.attemptedAt) + " · " + esc(m.questions) + " questions" + (m.attemptId ? " · Attempt ID " + esc(m.attemptId) : "") + "</p>" +
        "</div>" +
      "</div>";

    var root = host.querySelector(".rr");
    function close() { if (modalBox) modalBox.classList.remove("rr-mode"); if (o.onClose) o.onClose(); }
    root.querySelector(".rr-x").addEventListener("click", close);
    root.querySelectorAll("[data-rr-close]").forEach(function (a) { a.addEventListener("click", function () { close(); }); });

    var vm = root.querySelector("[data-rr-video]");
    if (vm && o.db && m.sessionId) mountVideoLink(vm, { db: o.db, sessionId: m.sessionId, onDone: function (d) { if (o.onSubmitted) setTimeout(function () { o.onSubmitted(d); }, 1400); } });

    // integrity summary
    var ib = root.querySelector("[data-rr-integrity]");
    var evs = Array.isArray(m.events) ? m.events : null;
    function paintIntegrity(list) {
      var counts = {};
      (list || []).forEach(function (e) { var t = e.event_type || e.type; if (EVENT_LABELS[t]) counts[t] = (counts[t] || 0) + 1; });
      var keys = Object.keys(EVENT_LABELS);
      var total = keys.reduce(function (s, k) { return s + (counts[k] || 0); }, 0);
      ib.innerHTML = (total ? "" : '<div class="rr-ok" style="background:rgba(22,163,74,.08)">✓ No integrity issues recorded</div>') +
        (total ? keys : []).map(function (k) {
          return '<div class="' + (counts[k] ? "warn" : "") + '"><span>' + esc(EVENT_LABELS[k]) + "</span><b>" + (counts[k] || 0) + "</b></div>";
        }).join("");
    }
    if (evs) paintIntegrity(evs);
    else if (o.db && m.sessionId) {
      o.db.from("assessment_monitor_events").select("event_type").eq("session_id", m.sessionId).limit(500)
        .then(function (r) { paintIntegrity(r.error ? [] : r.data); }, function () { paintIntegrity([]); });
    } else paintIntegrity([]);

    // animate
    requestAnimationFrame(function () {
      root.classList.add("in");
      var v = root.querySelector(".rr-ring .v");
      setTimeout(function () { v.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(2); }, reduce ? 0 : 250);
      setTimeout(function () { root.querySelectorAll(".rr-bar .b i").forEach(function (i) { i.style.width = i.style.getPropertyValue("--w"); }); }, reduce ? 0 : 500);
      if (!reduce) {
        var num = root.querySelector(".rr-num strong"), s0 = null;
        (function step(t) {
          if (!s0) s0 = t;
          var p = Math.min(1, (t - s0) / 1400), val = pct * (1 - Math.pow(1 - p, 3));
          num.textContent = (p === 1 ? pctText : (Math.round(val * 10) / 10).toString()) + "%";
          if (p < 1) requestAnimationFrame(step);
        })(performance.now() + 250);
      }
    });
    return root;
  }

  global.AldovraVideoLink = { mount: mountVideoLink };
  global.AldovraResultReview = { render: render };
})(window);
