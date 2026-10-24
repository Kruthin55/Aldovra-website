/* Aldovra auth pages: layout, motion and Aldo's reactions. Auth logic lives in the page itself. */
(function () {
  "use strict";
  var body = document.body;
  var mode = body.getAttribute("data-auth") || "login";
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  if (!reduce) body.classList.add("js-anim");

  var copy = {
    login: {
      label: "Log in", side: ["Welcome", "back.", "<em>Keep proving.</em>"],
      h1: "Welcome <em>back.</em>", kicker: "Secure login",
      hi: "Hi! Welcome back 👋", ok: "Yay! Taking you in 🚀", bad: "Hmm, that didn't work. Check your email and password?"
    },
    signup: {
      label: "Sign up", side: ["Your", "skills,", "<em>proven.</em>"],
      h1: "Create your <em>account.</em>", kicker: "Free to join",
      hi: "Hey! I'm Aldo. Let's set you up ✨", ok: "Welcome to Aldovra! 🎉", bad: "Oops — something needs fixing. Take a look below 👇"
    }
  }[mode];

  /* ---------- side panel ---------- */
  var side = document.createElement("aside");
  side.className = "auth-side";
  side.setAttribute("aria-hidden", "true");
  var skills = ["Python", "Java", "SQL", "React", "Data Analytics", "Machine Learning", "AWS", "Power BI", "JavaScript", "Docker", "Git", "System Design"];
  var chips = skills.concat(skills).map(function (s) { return "<span>" + s + "</span>"; }).join("");
  side.innerHTML =
    '<div class="auth-side-in">' +
      '<span class="auth-orb o1"></span><span class="auth-orb o2"></span><span class="auth-grid-lines"></span>' +
      '<div class="auth-label auth-reveal"><span><b>[ AL® ]</b> ' + copy.label + '</span><span>Skills verified / Better hiring</span></div>' +
      '<h2 class="auth-headline auth-split">' + copy.side.join(" ") + "</h2>" +
      "<div>" +
        '<ul class="auth-points auth-reveal" style="--d:300ms">' +
          '<li><span class="n">01</span>Free first assessment<span class="t">₹0</span></li>' +
          '<li><span class="n">02</span>Verified skill profile<span class="t">75%+</span></li>' +
          '<li><span class="n">03</span>Live fresher jobs<span class="t">Daily</span></li>' +
        "</ul>" +
        '<div class="auth-marquee auth-reveal" style="--d:420ms"><div class="auth-marquee-track">' + chips + "</div></div>" +
      "</div>" +
    "</div>";
  body.insertBefore(side, body.firstChild);

  /* ---------- heading ---------- */
  var card = $(".card");
  var heading = $(".heading", card);
  var h1 = heading && $("h1", heading);
  if (h1) {
    h1.innerHTML = copy.h1;
    h1.classList.add("auth-split");
    var k = document.createElement("div");
    k.className = "auth-kicker";
    k.innerHTML = "<i></i>" + copy.kicker;
    heading.insertBefore(k, h1);
  }

  /* split words for headline reveals */
  $$(".auth-split").forEach(function (el) {
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
    })(el);
  });

  /* ---------- stage + mascot ---------- */
  var stage = document.createElement("div");
  stage.className = "auth-stage";
  card.parentNode.insertBefore(stage, card);
  var holder = document.createElement("div");
  holder.className = "auth-mascot";
  holder.setAttribute("title", "Say hi to Aldo");
  stage.appendChild(holder);
  stage.appendChild(card);
  card.classList.add("auth-reveal");
  card.style.setProperty("--d", "120ms");

  var stagger = $$(".heading, .oauth-btn, .auth-divider, form .form-group, form .submit-btn, .signup-text, .login-text, .footer-note", card);
  stagger.forEach(function (el, i) { el.classList.add("auth-reveal"); el.style.setProperty("--d", 220 + i * 70 + "ms"); });

  var aldo = window.AldoMascot ? window.AldoMascot.create(holder, { peek: true, bubble: "left" }) : null;
  var A = aldo || { say: noop, mood: noop, cover: noop, peekThrough: noop, wave: noop, jump: noop, shake: noop, lookAtElement: noop, release: noop };
  function noop() { return A; }

  /* ---------- login: add a show-password toggle ---------- */
  var eyeSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  $$('input[type="password"]').forEach(function (input) {
    if (input.closest(".password-wrap")) return;
    var wrap = document.createElement("div");
    wrap.className = "password-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "password-toggle";
    btn.setAttribute("aria-label", "Show password");
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("data-ald-own-toggle", "");
    btn.innerHTML = eyeSvg;
    wrap.appendChild(btn);
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", show ? "true" : "false");
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      input.focus();
    });
  });

  /* ---------- reactions ---------- */
  var said = {};
  function once(key, text, ms) { if (said[key]) return; said[key] = 1; A.say(text, ms); }
  function caretFrac(input) {
    var chars = Math.max(1, (input.clientWidth - 30) / 8.6);
    return Math.min(1, (input.value || "").length / chars);
  }
  var pwInputs = $$('input[type="password"], #password, #confirmPassword');
  function isPw(el) { return pwInputs.indexOf(el) !== -1; }

  $$("input", card).forEach(function (input) {
    input.addEventListener("focus", function () {
      if (isPw(input)) {
        A.cover(true).peekThrough(input.type === "text").mood("shy");
        once("pw", "Don't worry, I'm not looking 🙈", 2600);
      } else {
        A.cover(false).mood("idle").lookAtElement(input, caretFrac(input));
      }
    });
    input.addEventListener("input", function () {
      if (isPw(input)) {
        if (mode === "signup" && input.id === "confirmPassword") {
          var p = $("#password").value, c = input.value;
          if (c.length >= p.length && p.length) {
            if (c === p) { A.mood("happy", 2200); A.say("They match! 🎉", 1800); }
            else { A.mood("sad", 2000); A.say("Hmm, passwords don't match yet 🤔", 2200); }
          }
        }
        return;
      }
      A.lookAtElement(input, caretFrac(input));
      if (input.type === "email" && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(input.value.trim())) {
        A.mood("happy", 1600);
        once("email", "Looks good! ✓", 1500);
      }
    });
    input.addEventListener("blur", function () {
      setTimeout(function () {
        var a = document.activeElement;
        if (!isPw(a)) A.cover(false).mood("idle");
        if (!a || a.tagName !== "INPUT") A.release();
      }, 30);
      if (input.id === "name" && input.value.trim()) {
        var first = input.value.trim().split(/\s+/)[0].slice(0, 18);
        once("name", "Nice to meet you, " + first + "! 😊", 2600);
        A.mood("happy", 2000);
      }
    });
  });

  $$(".password-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setTimeout(function () {
        var input = btn.parentNode.querySelector("input");
        var showing = input && input.type === "text";
        A.cover(true).peekThrough(showing);
        if (showing) A.say("Okay… just a tiny peek 👀", 1800);
      }, 0);
    });
  });

  var form = $("form", card);
  var submit = $(".submit-btn", card);
  if (submit) {
    submit.addEventListener("pointerdown", function (e) {
      if (reduce) return;
      var r = submit.getBoundingClientRect(), d = Math.max(r.width, r.height);
      var rip = document.createElement("span");
      rip.className = "ripple";
      rip.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (e.clientX - r.left - d / 2) + "px;top:" + (e.clientY - r.top - d / 2) + "px";
      submit.appendChild(rip);
      setTimeout(function () { rip.remove(); }, 700);
    });
  }
  if (form) form.addEventListener("submit", function () { A.cover(false).release().mood("think"); A.say("Checking… ⏳", 0); });

  var msg = $("#message");
  if (msg && window.MutationObserver) {
    new MutationObserver(function () {
      if (msg.classList.contains("error") && msg.textContent.trim()) {
        A.cover(false).mood("sad", 3800).shake();
        A.say(copy.bad, 3800);
        card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      } else if (msg.classList.contains("success") && msg.textContent.trim()) {
        A.cover(false).mood("excited", 4000).jump();
        A.say(/reset/i.test(msg.textContent) ? "Check your inbox 📬" : copy.ok, 3200);
      }
    }).observe(msg, { attributes: true, childList: true, characterData: true, subtree: true });
  }

  $$(".oauth-btn", card).forEach(function (b) {
    b.addEventListener("click", function () { A.mood("excited", 2500).jump(); A.say("Opening Google… 🚀", 2200); });
  });

  var tips = mode === "login"
    ? ["Your first assessment is free 🎁", "New fresher jobs land every day 💼", "Score 75%+ to get verified ✓", "Hehe, that tickles! 😆"]
    : ["Pick skills you can really prove 💪", "First assessment is on us 🎁", "Score 75%+ and recruiters can see you 👀", "Hehe! 😆"];
  var tipI = 0;
  holder.addEventListener("click", function () { A.cover(false).mood("excited", 1600).jump(); A.say(tips[tipI++ % tips.length], 2400); });

  /* ---------- go ---------- */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { body.classList.add("ready"); });
  });
  setTimeout(function () { A.wave(); A.mood("happy", 2200); A.say(copy.hi, 3200); }, reduce ? 200 : 1300);
})();
