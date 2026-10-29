/* Aldovra content pages: logo, reveals, progress and Aldo the guide. Options via <body data-guide="..."> */
(function () {
  "use strict";
  var body = document.body;
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  if (!reduce && "IntersectionObserver" in window) body.classList.add("js-anim");

  /* real logo in place of the letter mark */
  $$(".brand-mark").forEach(function (m) {
    var img = document.createElement("img");
    img.src = "/aldovra-logo.png"; img.alt = ""; img.className = "ald-logo";
    m.replaceWith(img);
  });

  /* brand text without a logo → add the logo */
  $$("header .brand").forEach(function (b) {
    if (b.querySelector("img")) return;
    var img = document.createElement("img");
    img.src = "/aldovra-logo.png"; img.alt = ""; img.className = "ald-logo";
    b.insertBefore(img, b.firstChild);
  });

  /* progress bar + header state */
  var bar = document.createElement("div");
  bar.className = "ald-progress"; bar.setAttribute("aria-hidden", "true");
  body.appendChild(bar);
  var ticking = false;
  function onScroll() {
    var y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0) + ")";
    body.classList.toggle("scrolled", y > 10);
    ticking = false;
  }
  addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* split the main headline */
  var h1 = $("main h1");
  if (h1) {
    var n = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(" ")); return; }
            var w = document.createElement("span"); w.className = "w";
            var wi = document.createElement("span"); wi.className = "wi"; wi.textContent = p; wi.style.setProperty("--i", n++);
            w.appendChild(wi); frag.appendChild(w);
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1) walk(c);
      });
    })(h1);
    h1.classList.add("ald-split");
  }

  /* reveal blocks */
  var blocks = $$("main > .card, main > h2, main > p:not(:first-child), main > ul, main .eyebrow, main .hero-subtitle, main .notice, main .section-card, main .section h2, main .policy-card, main .rule-card, main .rule-info-card, main .guarantee-box, main .confirmation > *, footer .container > *");
  blocks.forEach(function (el) {
    el.classList.add("ald-rv");
    var sib = el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
    el.style.setProperty("--d", Math.min(sib, 5) * 80 + "ms");
  });
  if (body.classList.contains("js-anim")) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });
    blocks.forEach(function (el) { io.observe(el); });
    if (h1) requestAnimationFrame(function () { requestAnimationFrame(function () { h1.classList.add("in"); }); });
  }

  /* ---------- "On this page" index for long policy/info pages (wide screens only) ---------- */
  (function buildToc() {
    var main = $("main"); if (!main) return;
    var heads = $$("main > h2");
    if (heads.length < 4) return;
    var used = {};
    var nav = document.createElement("nav");
    nav.className = "ald-toc"; nav.setAttribute("aria-label", "On this page");
    var title = document.createElement("p"); title.className = "ald-toc-title"; title.textContent = "On this page";
    var list = document.createElement("ol");
    heads.forEach(function (h) {
      if (!h.id) {
        var base = h.textContent.toLowerCase().replace(/^\s*\d+\.\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
        var id = base, k = 2; while (used[id] || document.getElementById(id)) id = base + "-" + k++;
        h.id = id;
      }
      used[h.id] = 1;
      var li = document.createElement("li"), a = document.createElement("a");
      a.href = "#" + h.id; a.textContent = h.textContent.replace(/^\s*\d+\.\s*/, "");
      li.appendChild(a); list.appendChild(li);
    });
    nav.appendChild(title); nav.appendChild(list);
    body.appendChild(nav);
    body.classList.add("has-toc");
    function place() {
      var r = main.getBoundingClientRect();
      var room = r.left - 32;
      nav.classList.toggle("on", room >= 190);
      nav.style.left = Math.max(16, r.left - Math.min(240, room)) + "px";
      nav.style.width = Math.min(220, room - 16) + "px";
    }
    place(); addEventListener("resize", place);
    var links = $$("a", nav);
    if ("IntersectionObserver" in window) {
      var current = null;
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) current = e.target.id; });
        links.forEach(function (a) { var on = a.getAttribute("href") === "#" + current; a.classList.toggle("is-current", on); if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
      }, { rootMargin: "-20% 0px -70% 0px" });
      heads.forEach(function (h) { spy.observe(h); });
    }
  })();

  /* ---------- Aldo the guide ---------- */
  if (!window.AldoMascot || body.getAttribute("data-guide") === "off") return;
  var dock = document.createElement("div");
  dock.className = "ald-guide";
  var x = document.createElement("button");
  x.type = "button"; x.className = "ald-guide-x"; x.setAttribute("aria-label", "Hide Aldo");
  x.textContent = "–";
  dock.appendChild(x);
  body.appendChild(dock);
  var aldo = AldoMascot.create(dock, { bubble: "left" });
  var roamer = AldoMascot.roam(dock, aldo, {});
  if (roamer.active) dock.querySelector(".aldo-bubble").classList.remove("left");
  var minimized = store.get("aldovra-guide-min") === "1";
  function setMin(m) {
    minimized = m; dock.classList.toggle("min", m); store.set("aldovra-guide-min", m ? "1" : "0");
    x.textContent = m ? "+" : "–"; x.setAttribute("aria-label", m ? "Show Aldo" : "Hide Aldo");
    if (m) aldo.say("");
    if (roamer) { if (m) roamer.pause(); else roamer.resume(); }
  }
  x.addEventListener("click", function (e) { e.stopPropagation(); setMin(!minimized); });
  setTimeout(function () { dock.classList.add("on"); if (minimized) setMin(true); }, reduce ? 0 : 900);

  var page = body.getAttribute("data-guide") || "";
  var lines = {
    "before-you-begin": {
      hi: "Namaste! I'm Aldo. Please read this page carefully — it takes about 2 minutes 📖",
      tips: ["75%+ makes your profile verified-eligible ✓", "Your first attempt is free 🎁", "Reattempts are ₹50 or ₹100 depending on score", "Aldovra never guarantees a job — your skills do the talking 💪"]
    }
    ,
    about: { hi: "Namaste! I'm Aldo — welcome to our story 💜", tips: ["Aldovra helps freshers prove skills, not just list them 💪", "Your first assessment is free 🎁", "Score 75%+ to get verified ✓"] },
    contact: { hi: "Namaste! Questions? We're happy to help 📬", tips: ["Support: support@aldovra.com", "Partnerships: helloaldovra.com@gmail.com", "Follow us on Instagram @aldovra.in 📸"] },
    pricing: { hi: "Namaste! Good news — your first attempt is free 🎁", tips: ["Any price is always shown before you pay 🧾", "24-hour gap between reattempts ⏳", "Questions? support@aldovra.com"] },
    "thank-you": { hi: "Yay! Thank you 🎉", tips: ["Check your inbox for updates 📬", "Meanwhile, explore live fresher jobs 💼"] },
    "get-started": { hi: "Namaste! Let's get you started ✨", tips: ["It only takes a few minutes ⏱️", "Your first assessment is free 🎁"] }
  }[page] || { hi: "Namaste! I'm Aldo 👋", tips: ["Need help? Write to support@aldovra.com"] };

  setTimeout(function () { if (!minimized) { aldo.wave(); aldo.mood("happy", 2400); aldo.say(lines.hi, 5200); } }, reduce ? 300 : 2000);
  /* Phones: Aldo greets once, then tucks away while the visitor reads so she never covers text.
     Tapping her peeking head brings her back. */
  var isPhone = false;
  try { isPhone = matchMedia("(max-width: 760px)").matches; } catch (e) {}
  if (isPhone) {
    var tucked = false;
    var tuck = function () { if (!tucked && !minimized) { tucked = true; aldo.say(""); minimized = true; dock.classList.add("min"); } }; // not saved: next visit greets again
    setTimeout(tuck, reduce ? 4000 : 8000);
    addEventListener("scroll", function () { if (scrollY > 160) tuck(); }, { passive: true });
  }
  var ti = 0;
  var taps = 0, tapTimer = null;
  dock.querySelector(".aldo").addEventListener("click", function () {
    if (minimized) { setMin(false); return; }
    // every third tap in a row she dances; otherwise a tip
    taps++; clearTimeout(tapTimer); tapTimer = setTimeout(function () { taps = 0; }, 1400);
    if (taps >= 3 && aldo.dance) { taps = 0; aldo.dance(4300); aldo.say("Okay okay, one little dance 💃", 3200); return; }
    aldo.mood("excited", 1500).jump(); aldo.say(lines.tips[ti++ % lines.tips.length], 3200);
  });

  /* react to scroll milestones */
  var milestones = page !== "before-you-begin" ? [] : [[0.45, "You're halfway there! Keep going 🙌"], [0.85, "Almost done — just the confirmation left ✍️"]];
  addEventListener("scroll", function () {
    if (minimized) return;
    var max = document.documentElement.scrollHeight - innerHeight;
    var p = max > 0 ? scrollY / max : 0;
    while (milestones.length && p >= milestones[0][0]) { var m = milestones.shift(); aldo.mood("happy", 2000); aldo.say(m[1], 3000); }
  }, { passive: true });

  /* before-you-begin confirmation checkboxes */
  var checks = $$('.confirmation input[type="checkbox"]');
  checks.forEach(function (c) {
    c.addEventListener("change", function () {
      if (minimized) return;
      var all = checks.every(function (k) { return k.checked; });
      if (all) { aldo.mood("excited", 3500).jump(); aldo.say("You're all set! Let's go 🚀", 3200); }
      else if (c.checked) { aldo.mood("happy", 1800); aldo.say("Great ✓", 1400); }
      else { aldo.mood("sad", 1800); aldo.say("Oh! Please tick it when you're ready", 2200); }
    });
  });
})();
