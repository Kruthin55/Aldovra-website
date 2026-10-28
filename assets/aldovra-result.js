/* Aldovra post-exam result screen: full-screen, animated, with clear next steps. */
(function (global) {
  "use strict";
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtDate(d) { try { return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch (e) { return d.toDateString(); } }

  function band(pct, status) {
    if (status === "eligible" || pct >= 75) return "pass";
    if (pct >= 65) return "near";
    return "low";
  }

  function show(data, opts) {
    opts = opts || {};
    var pct = Math.max(0, Math.min(100, Number(data.percentage) || 0));
    var pctText = (Math.round(pct * 100) / 100).toString();
    var b = band(pct, data.verification_status);
    var paymentsLive = !!opts.paymentsLive;
    var fee = b === "near" ? 50 : 100;
    var retryDate = new Date(Date.now() + 864e5);
    var correct = data.score != null ? data.score : "—";
    var total = data.total_questions != null ? data.total_questions : (opts.total || "—");
    var title = opts.title || "Aldovra Skill Assessment";

    var copy = {
      pass: {
        chip: "Verified-eligible", head: "You did it! <em>Skill proven.</em>",
        sub: "You scored 75% or above. One last step makes it official on your profile.",
        aldo: "Yay! You're verified-eligible! 🎉",
        steps: [
          ["Submit your exam environment video", "Required to finish verification. Paste your YouTube Unlisted link in the box above."],
          ["Get verified on your profile", "Once the video is reviewed, your skill shows as verified to HRs and recruiters."],
          ["Earn Arena points & apply", "Your verified skill earns leaderboard points. Use it to apply for matching fresher jobs."]
        ]
      },
      near: {
        chip: "So close", head: "Almost there — <em>65%+!</em>",
        sub: "You're just below the 75% verification line. A focused reattempt can get you verified.",
        aldo: "So close! You've got this next time 💪",
        steps: [
          ["Submit your exam environment video", "Needed to complete this attempt's record. Paste the link in the box above."],
          ["Revise your weaker areas", "Check the category breakdown below and practise those topics this week."],
          ["Reattempt from " + fmtDate(retryDate), (paymentsLive ? "Reattempt fee: ₹50 (your 65–74% score gets the discounted price)." : "Reattempts are free for now while Aldovra launches.") + " Max 4 attempts per 30 days."]
        ]
      },
      low: {
        chip: "Keep going", head: "Good start — <em>let's level up.</em>",
        sub: "Every expert started here. Your result is saved; use it as a map of what to learn next.",
        aldo: "Every attempt makes you stronger. Let's go again! 🌱",
        steps: [
          ["Submit your exam environment video", "Needed to complete this attempt's record. Paste the link in the box above."],
          ["Learn the gaps", "Focus on the lowest categories below — free resources are linked from your dashboard."],
          ["Reattempt from " + fmtDate(retryDate), (paymentsLive ? "Reattempt fee: ₹100. Score 65%+ next time and later attempts drop to ₹50." : "Reattempts are free for now while Aldovra launches.") + " Max 4 attempts per 30 days."]
        ]
      }
    }[b];

    var cats = data.category_scores || {};
    var catRows = Object.keys(cats).map(function (k) { return [k, Math.max(0, Math.min(100, Number(cats[k]) || 0))]; })
      .sort(function (a, c) { return a[1] - c[1]; });

    var root = document.createElement("div");
    root.className = "arx arx-" + b;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Assessment result");
    var R = 54, C = 2 * Math.PI * R;
    root.innerHTML =
      '<div class="arx-bg"><i class="o1"></i><i class="o2"></i></div>' +
      (b === "pass" && !reduce ? '<div class="arx-confetti" aria-hidden="true">' + Array.from({ length: 42 }, function (_, i) { return '<span style="--x:' + (Math.random() * 100).toFixed(1) + '%;--d:' + (Math.random() * 1.2).toFixed(2) + 's;--r:' + Math.round(Math.random() * 360) + 'deg;--c:' + ["#4f46e5", "#7c3aed", "#f2b631", "#16a34a", "#e05b8b"][i % 5] + '"></span>'; }).join("") + "</div>" : "") +
      '<div class="arx-wrap">' +
        '<div class="arx-top"><span class="arx-label">[ Aldovra ] Assessment result</span><span class="arx-skill">' + esc(title) + "</span></div>" +
        '<div class="arx-hero">' +
          '<div class="arx-ring"><svg viewBox="0 0 128 128" aria-hidden="true"><defs><linearGradient id="arxg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#9d5cf6"/></linearGradient></defs>' +
            '<circle class="t" cx="64" cy="64" r="' + R + '"/><circle class="v" cx="64" cy="64" r="' + R + '" style="stroke-dasharray:' + C.toFixed(2) + ';stroke-dashoffset:' + C.toFixed(2) + '"/>' +
            '<line class="mark" x1="64" y1="4" x2="64" y2="16"/></svg>' +
            '<div class="arx-num"><strong data-to="' + pct + '">0%</strong><span>Your score</span><small>75% = verified</small></div></div>' +
          '<div class="arx-head"><span class="arx-chip">' + copy.chip + "</span><h1>" + copy.head + "</h1><p>" + copy.sub + "</p>" +
            (data.result_message ? '<p class="arx-msg">' + esc(data.result_message) + "</p>" : "") + "</div>" +
        "</div>" +
        '<div class="arx-stats">' +
          '<div><b>' + esc(correct) + '</b><span>Correct answers</span></div>' +
          '<div><b>' + esc(total) + '</b><span>Questions</span></div>' +
          '<div><b>' + esc(pctText) + '%</b><span>Accuracy</span></div>' +
          '<div><b>' + (b === "pass" ? "Eligible" : (paymentsLive ? "₹" + fee : "Free")) + '</b><span>' + (b === "pass" ? "Verification" : "Reattempt fee") + "</span></div>" +
        "</div>" +
        (opts.db && opts.sessionId && global.AldovraVideoLink ? '<div class="arx-video"><h2>Submit your environment video</h2><p>Upload the phone recording of your exam room to YouTube as <b>Unlisted</b>, then paste the link here.</p><div data-arx-video></div></div>' : "") +
        (catRows.length ? '<div class="arx-cats"><h2>Performance by category</h2>' + catRows.map(function (r, i) {
          return '<div class="arx-cat' + (i === 0 && r[1] < 75 ? " weak" : "") + '"><p><span>' + esc(r[0]) + (i === 0 && r[1] < 75 ? ' <em>focus here</em>' : "") + "</span><b>" + r[1] + '%</b></p><div class="bar"><i style="--w:' + r[1] + '%"></i></div></div>';
        }).join("") + "</div>" : "") +
        '<div class="arx-next"><h2>What happens next</h2><ol>' + copy.steps.map(function (s, i) {
          return '<li style="--i:' + i + '"><span class="n">0' + (i + 1) + "</span><div><strong>" + esc(s[0]) + "</strong><p>" + esc(s[1]) + "</p></div></li>";
        }).join("") + "</ol></div>" +
        '<div class="arx-actions">' +
          (opts.db && opts.sessionId && global.AldovraVideoLink
            ? '<a class="arx-btn primary" href="/dashboard.html#assessments">Go to my assessments <span>→</span></a>'
            : '<a class="arx-btn primary" href="/dashboard.html#assessments">Submit environment video <span>→</span></a>') +
          '<a class="arx-btn" href="/dashboard.html">Go to dashboard</a>' +
          (global.AldovraEnvGuide ? '<button type="button" class="arx-btn ghost" data-env-guide>▶ How to record the video</button>' : "") +
          '<a class="arx-btn ghost" href="/dashboard.html#jobs">Explore fresher jobs</a>' +
        "</div>" +
        '<p class="arx-foot">' + (data.attempt_id ? "Attempt ID " + esc(data.attempt_id) + " · " : "") + "Result saved securely to your Aldovra profile.</p>" +
      "</div>" +
      '<div class="arx-aldo" aria-hidden="true"></div>';

    document.body.appendChild(root);
    var videoMount = root.querySelector("[data-arx-video]");
    if (videoMount) {
      global.AldovraVideoLink.mount(videoMount, {
        db: opts.db, sessionId: opts.sessionId,
        onDone: function () {
          var first = root.querySelector(".arx-next li");
          if (first) { first.style.opacity = ".55"; var st = first.querySelector("strong"); if (st) st.textContent = "✓ Environment video submitted"; }
        }
      });
    }
    document.documentElement.style.overflow = "hidden";

    // Animate
    requestAnimationFrame(function () {
      root.classList.add("in");
      var val = root.querySelector(".arx-ring .v");
      setTimeout(function () { val.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(2); }, reduce ? 0 : 450);
      var num = root.querySelector(".arx-num strong");
      if (reduce) num.textContent = pctText + "%";
      else {
        var s = null;
        (function step(t) {
          if (!s) s = t;
          var p = Math.min(1, (t - s) / 1600), v = pct * (1 - Math.pow(1 - p, 3));
          num.textContent = (p === 1 ? pctText : (Math.round(v * 10) / 10).toString()) + "%";
          if (p < 1) requestAnimationFrame(step);
        })(performance.now() + 450);
      }
      setTimeout(function () { root.querySelectorAll(".arx-cat .bar i").forEach(function (i) { i.style.width = i.style.getPropertyValue("--w"); }); }, reduce ? 0 : 900);
    });

    // Aldo
    if (global.AldoMascot) {
      var a = global.AldoMascot.create(root.querySelector(".arx-aldo"), { bubble: "left" });
      setTimeout(function () {
        if (b === "pass") { a.mood("excited", 5000).jump(); setTimeout(function () { a.jump(); }, 900); }
        else if (b === "near") { a.mood("happy", 4000).wave(); }
        else { a.mood("happy", 4000).wave(); }
        a.say(copy.aldo, 6000);
      }, reduce ? 0 : 1800);
    }
    return root;
  }

  global.AldovraResult = { show: show };
})(window);
