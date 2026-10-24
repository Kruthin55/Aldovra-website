/*!
 * Aldo — Aldovra's mascot. An original chibi Indian student in a purple Aldovra kurta.
 * Usage: const aldo = AldoMascot.create(hostEl, { size: 160, peek: false, bubble: "top" });
 *        aldo.say("Hi!"); aldo.mood("happy"); aldo.cover(true); aldo.wave(); aldo.jump();
 * No dependencies. Respects prefers-reduced-motion.
 */
(function (global) {
  "use strict";
  if (global.AldoMascot) return;

  var reduce = false;
  try { reduce = global.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var CSS = [
    ".aldo{position:relative;display:inline-block;width:var(--aldo-size,160px);line-height:0;-webkit-tap-highlight-color:transparent}",
    ".aldo svg{width:100%;height:auto;display:block;overflow:visible}",
    ".aldo g{transform-box:fill-box}",
    ".aldo-bob{animation:aldoBob 3.4s ease-in-out infinite;transform-origin:50% 100%}",
    ".aldo-shadow{animation:aldoShadow 3.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}",
    "@keyframes aldoBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}",
    "@keyframes aldoShadow{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.88)}}",
    ".aldo-head{transform-origin:50% 92%;transition:transform .35s cubic-bezier(.22,1,.36,1)}",
    ".aldo-pupil{transition:transform .14s ease-out}",
    ".aldo-eye{transform-origin:center;transition:transform .09s ease-in}",
    ".aldo.blink .aldo-eye{transform:scaleY(.08)}",
    ".aldo-ahoge{transform-origin:20% 100%;animation:aldoSway 2.8s ease-in-out infinite}",
    "@keyframes aldoSway{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(8deg)}}",
    ".aldo-arm{transition:transform .5s cubic-bezier(.22,1,.36,1),opacity .3s}",
    ".aldo-arm-l{transform-origin:85% 4%}.aldo-arm-r{transform-origin:15% 4%}",
    ".aldo-grip{opacity:0;transition:opacity .3s}",
    ".aldo.peek .aldo-grip{opacity:1}.aldo.peek .aldo-arm{opacity:0}",
    ".aldo-grip-r{transform-origin:50% 100%}",
    ".aldo-cover-l,.aldo-cover-r{transform:translateY(130px);opacity:0;transition:transform .55s cubic-bezier(.22,1,.36,1),opacity .25s}",
    ".aldo.covering .aldo-cover-l,.aldo.covering .aldo-cover-r{transform:translateY(0);opacity:1}",
    ".aldo.covering.peeking .aldo-cover-l{transform:translate(-6px,26px) rotate(-14deg)}",
    ".aldo.covering .aldo-arm,.aldo.covering .aldo-grip{opacity:0}",
    ".aldo.waving .aldo-arm-r{animation:aldoWave .42s ease-in-out 6 alternate}",
    "@keyframes aldoWave{from{transform:rotate(-150deg)}to{transform:rotate(-112deg)}}",
    ".aldo.peek.waving .aldo-grip-r{animation:aldoWaveGrip .38s ease-in-out 6 alternate}",
    "@keyframes aldoWaveGrip{from{transform:translateY(-14px) rotate(-22deg)}to{transform:translateY(-16px) rotate(18deg)}}",
    ".aldo-jump{transform-origin:50% 100%}",
    ".aldo.jumping .aldo-jump{animation:aldoJump .7s cubic-bezier(.3,1.5,.5,1)}",
    "@keyframes aldoJump{0%{transform:scale(1.06,.92)}35%{transform:translateY(-26px) scale(.96,1.05)}70%{transform:translateY(0) scale(1.05,.95)}100%{transform:none}}",
    ".aldo.shaking .aldo-head{animation:aldoShake .5s ease-in-out}",
    "@keyframes aldoShake{0%,100%{translate:0}20%{translate:-5px}40%{translate:5px}60%{translate:-4px}80%{translate:3px}}",
    ".aldo .m{display:none}.aldo .m-smile{display:inline}",
    ".aldo[data-mood=happy] .m-smile,.aldo[data-mood=excited] .m-smile,.aldo[data-mood=sad] .m-smile,.aldo[data-mood=surprised] .m-smile,.aldo[data-mood=shy] .m-smile,.aldo[data-mood=think] .m-smile{display:none}",
    ".aldo[data-mood=happy] .m-open,.aldo[data-mood=excited] .m-open{display:inline}",
    ".aldo[data-mood=sad] .m-sad{display:inline}",
    ".aldo[data-mood=surprised] .m-o,.aldo[data-mood=shy] .m-o{display:inline}",
    ".aldo[data-mood=think] .m-flat{display:inline}",
    ".aldo .eye-happy{display:none}",
    ".aldo[data-mood=excited] .eye-happy{display:inline}.aldo[data-mood=excited] .aldo-eye{display:none}",
    ".aldo-brow-l,.aldo-brow-r{transition:transform .3s}",
    ".aldo-brow-l{transform-origin:100% 50%}.aldo-brow-r{transform-origin:0 50%}",
    ".aldo[data-mood=sad] .aldo-brow-l{transform:translateY(-1px) rotate(-14deg)}.aldo[data-mood=sad] .aldo-brow-r{transform:translateY(-1px) rotate(14deg)}",
    ".aldo[data-mood=surprised] .aldo-brow-l,.aldo[data-mood=surprised] .aldo-brow-r{transform:translateY(-4px)}",
    ".aldo[data-mood=think] .aldo-brow-r{transform:translateY(-4px) rotate(-6deg)}",
    ".aldo-blush{transition:opacity .4s}.aldo[data-mood=shy] .aldo-blush,.aldo.covering .aldo-blush{opacity:.95}",
    ".aldo-bubble{position:absolute;z-index:3;left:50%;bottom:calc(100% - 4px);transform:translate(-50%,8px) scale(.9);transform-origin:50% 100%;min-width:120px;max-width:min(240px,70vw);width:max-content;padding:10px 14px;border-radius:16px;background:#0d0d12;color:#f6f5f0;font:500 13.5px/1.4 'Inter Tight',Inter,system-ui,sans-serif;letter-spacing:-.005em;text-align:left;opacity:0;pointer-events:none;transition:opacity .3s,transform .45s cubic-bezier(.22,1,.36,1);box-shadow:0 14px 34px -14px rgba(0,0,0,.5)}",
    ".aldo-bubble::after{content:'';position:absolute;left:50%;top:100%;margin-left:-7px;border:7px solid transparent;border-top-color:#0d0d12}",
    ".aldo-bubble.show{opacity:1;transform:translate(-50%,0) scale(1)}",
    ".aldo-bubble.left{left:auto;right:calc(100% - 10px);bottom:auto;top:12%;transform:translate(8px,0) scale(.9);transform-origin:100% 50%}",
    ".aldo-bubble.left.show{transform:none}",
    ".aldo-bubble.left::after{left:100%;top:18px;margin:0;border-top-color:transparent;border-left-color:#0d0d12}",
    "[data-theme=dark] .aldo-bubble{background:#f2f1ec;color:#0d0d12}",
    "[data-theme=dark] .aldo-bubble::after{border-top-color:#f2f1ec}",
    "[data-theme=dark] .aldo-bubble.left::after{border-top-color:transparent;border-left-color:#f2f1ec}",
    ".aldo svg{transition:transform .25s ease}",
    ".aldo.face-left svg{transform:scaleX(-1)}",
    ".aldo-foot{transform-box:fill-box;transform-origin:50% 0}",
    ".aldo.walking .aldo-bob{animation:aldoWalk .36s ease-in-out infinite}",
    ".aldo.walking .aldo-shadow{animation:none}",
    ".aldo.walking .aldo-foot-l{animation:aldoStep .36s ease-in-out infinite}",
    ".aldo.walking .aldo-foot-r{animation:aldoStep .36s ease-in-out infinite reverse}",
    ".aldo.walking .aldo-arm-l{animation:aldoSwing .36s ease-in-out infinite alternate}",
    ".aldo.walking .aldo-arm-r{animation:aldoSwing .36s ease-in-out infinite alternate-reverse}",
    "@keyframes aldoWalk{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-5px) rotate(2deg)}}",
    "@keyframes aldoStep{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}",
    "@keyframes aldoSwing{from{transform:rotate(-12deg)}to{transform:rotate(12deg)}}",
    ".aldo-bubble.edge-l{left:0;transform:translate(0,8px) scale(.9);transform-origin:15% 100%}",
    ".aldo-bubble.edge-l.show{transform:translate(0,0) scale(1)}",
    ".aldo-bubble.edge-l::after{left:44px}",
    ".aldo-bubble.edge-r{left:auto;right:0;transform:translate(0,8px) scale(.9);transform-origin:85% 100%}",
    ".aldo-bubble.edge-r.show{transform:translate(0,0) scale(1)}",
    ".aldo-bubble.edge-r::after{left:auto;right:44px;margin:0 -7px 0 0}",
    "@media (prefers-reduced-motion:reduce){.aldo *{animation:none!important}}"
  ].join("\n");

  function injectCss() {
    if (document.getElementById("aldo-mascot-css")) return;
    var s = document.createElement("style");
    s.id = "aldo-mascot-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var uid = 0;
  function svgMarkup(id) {
    var g = function (n) { return "aldo" + id + n; };
    var SKIN = "#f6d0b1", SKIN_D = "#ebbd98", HAND = "#f3c8a6", LINE = "#d9a07f", GOLD = "#f2b631", KAJAL = "#231a1f";
    var eye = function (x, side) {
      var fx = side * 12.5;
      return '<g transform="translate(' + x + ',104)">' +
        '<g class="aldo-eye">' +
          '<ellipse rx="12.5" ry="15" fill="' + KAJAL + '"/>' +
          '<g class="aldo-pupil">' +
            '<ellipse cy="2" rx="9" ry="11.4" fill="url(#' + g("iris") + ')"/>' +
            '<ellipse cy="6.5" rx="5.5" ry="3.6" fill="#ffe7c7" opacity=".28"/>' +
            '<circle cx="-3.6" cy="-4.8" r="3.8" fill="#fff"/>' +
            '<circle cx="3.6" cy="3.4" r="1.7" fill="#fff"/>' +
          "</g>" +
          '<path d="M-13.5,-9 Q0,-18.5 13.5,-9" stroke="' + KAJAL + '" stroke-width="3.8" stroke-linecap="round" fill="none"/>' +
          '<path d="M' + fx + ',-9 l' + side * 4.5 + ',-4.5 M' + (fx + side * 0.8) + ',-5 l' + side * 4.8 + ',-2" stroke="' + KAJAL + '" stroke-width="2" stroke-linecap="round" fill="none"/>' +
          '<path d="M-10,13.5 Q0,17.5 10,13.5" stroke="' + KAJAL + '" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".55"/>' +
        "</g>" +
        '<path class="eye-happy" d="M-9,3 Q0,-8 9,3" stroke="' + KAJAL + '" stroke-width="3.6" stroke-linecap="round" fill="none"/>' +
      "</g>";
    };
    var bangle = function (cx, cy, rot) {
      return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="7.5" ry="2.4" transform="rotate(' + rot + " " + cx + " " + cy + ')" fill="none" stroke="' + GOLD + '" stroke-width="2"/>' +
        '<ellipse cx="' + cx + '" cy="' + (cy + 3) + '" rx="7.5" ry="2.4" transform="rotate(' + rot + " " + cx + " " + (cy + 3) + ')" fill="none" stroke="#e05b8b" stroke-width="1.6"/>';
    };
    var jhumka = function (x) {
      return '<g><path d="M' + x + ',114 v5" stroke="' + GOLD + '" stroke-width="1.4"/>' +
        '<path d="M' + (x - 6) + ',127 Q' + x + ',115 ' + (x + 6) + ',127 Z" fill="' + GOLD + '"/>' +
        '<circle cx="' + x + '" cy="119" r="1.8" fill="#e05b8b"/>' +
        '<circle cx="' + (x - 5) + '" cy="129" r="1.3" fill="' + GOLD + '"/><circle cx="' + x + '" cy="130" r="1.3" fill="' + GOLD + '"/><circle cx="' + (x + 5) + '" cy="129" r="1.3" fill="' + GOLD + '"/></g>';
    };
    var braid = "";
    [[154, 142, 18], [155, 152, -18], [156, 162, 18], [157, 172, -18], [158, 182, 18], [158.5, 192, -18]].forEach(function (b) {
      braid += '<ellipse cx="' + b[0] + '" cy="' + b[1] + '" rx="7.2" ry="6.4" transform="rotate(' + b[2] + " " + b[0] + " " + b[1] + ')" fill="url(#' + g("hair") + ')" stroke="#3d2a33" stroke-width=".8"/>';
    });
    braid += '<rect x="153" y="197" width="11" height="4" rx="2" fill="#7c3aed"/><path d="M155,201 L158.5,212 L162,201 Z" fill="' + GOLD + '"/>';
    var gajra = "";
    [[159, 128], [162, 135], [164, 143], [165, 151], [165, 159]].forEach(function (f, k) {
      gajra += '<circle cx="' + f[0] + '" cy="' + f[1] + '" r="' + (k % 2 ? 2.6 : 3) + '" fill="#fffdf6" stroke="#efe6d2" stroke-width=".6"/><circle cx="' + f[0] + '" cy="' + f[1] + '" r=".9" fill="#f4d58d"/>';
    });
    gajra += '<path d="M157,126 q4,-4 7,-1" stroke="#4f9d55" stroke-width="2" stroke-linecap="round" fill="none"/>';
    return '' +
      '<svg viewBox="0 0 200 232" aria-hidden="true" focusable="false">' +
      "<defs>" +
        '<linearGradient id="' + g("hood") + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b6cff"/><stop offset="1" stop-color="#6d28d9"/></linearGradient>' +
        '<linearGradient id="' + g("iris") + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1f12"/><stop offset=".55" stop-color="#7a4a2a"/><stop offset="1" stop-color="#c99a6b"/></linearGradient>' +
        '<linearGradient id="' + g("hair") + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e1f26"/><stop offset="1" stop-color="#120b10"/></linearGradient>' +
      "</defs>" +
      '<ellipse class="aldo-shadow" cx="100" cy="224" rx="46" ry="6.5" fill="rgba(20,16,50,.12)"/>' +
      '<g class="aldo-jump"><g class="aldo-bob">' +
        // feet (little juttis)
        '<g class="aldo-foot aldo-foot-l"><ellipse cx="84" cy="220" rx="10" ry="5.5" fill="#3b2140"/><path d="M76,219 q8,-4 16,0" stroke="' + GOLD + '" stroke-width="1.4" fill="none"/></g>' +
        '<g class="aldo-foot aldo-foot-r"><ellipse cx="116" cy="220" rx="10" ry="5.5" fill="#3b2140"/><path d="M108,219 q8,-4 16,0" stroke="' + GOLD + '" stroke-width="1.4" fill="none"/></g>' +
        // arms (rest) with bangles
        '<g class="aldo-arm aldo-arm-l"><path d="M64,158 C47,168 37,186 37,202 L51,205 C52,192 58,180 72,170 Z" fill="url(#' + g("hood") + ')"/><circle cx="44" cy="207" r="8.5" fill="' + HAND + '"/>' + bangle(44.5, 199, 8) + "</g>" +
        '<g class="aldo-arm aldo-arm-r"><path d="M136,158 C153,168 163,186 163,202 L149,205 C148,192 142,180 128,170 Z" fill="url(#' + g("hood") + ')"/><circle cx="156" cy="207" r="8.5" fill="' + HAND + '"/>' + bangle(155.5, 199, -8) + "</g>" +
        // kurta
        '<rect x="91" y="136" width="18" height="20" rx="6" fill="' + SKIN_D + '"/>' +
        '<path d="M60,160 C64,147 136,147 140,160 L151,214 C151,222 49,222 49,214 Z" fill="url(#' + g("hood") + ')"/>' +
        '<path d="M86,149 L100,167 L114,149 Z" fill="' + SKIN_D + '"/>' +
        '<path d="M84,149 L100,169 L116,149" stroke="' + GOLD + '" stroke-width="2.4" stroke-linejoin="round" fill="none"/>' +
        '<g fill="' + GOLD + '"><circle cx="89" cy="157" r="1.4"/><circle cx="94.5" cy="164" r="1.4"/><circle cx="105.5" cy="164" r="1.4"/><circle cx="111" cy="157" r="1.4"/></g>' +
        '<path d="M100,170 V198" stroke="' + GOLD + '" stroke-width="1.4" opacity=".85"/>' +
        '<g fill="#fff7e0"><circle cx="100" cy="178" r="1.7"/><circle cx="100" cy="187" r="1.7"/><circle cx="100" cy="196" r="1.7"/></g>' +
        '<path d="M52,211 C80,216 120,216 148,211" stroke="' + GOLD + '" stroke-width="2.6" fill="none" opacity=".95"/>' +
        '<path d="M53,206 C80,211 120,211 147,206" stroke="' + GOLD + '" stroke-width="1" stroke-dasharray="1.5 3" fill="none" opacity=".8"/>' +
        '<g transform="translate(76,180)"><circle r="7.5" fill="#fff" opacity=".95"/><text y="3.6" text-anchor="middle" font-family="Inter Tight,Inter,Arial,sans-serif" font-size="9.5" font-weight="800" fill="#6d28d9">A</text></g>' +
        // edge-grip hands (peek mode)
        '<g class="aldo-grip"><g><path d="M62,200 L64,170 L76,170 L76,200 Z" fill="url(#' + g("hood") + ')"/><circle cx="69" cy="166" r="9.5" fill="' + HAND + '"/><path d="M63,160 v6 M69,158 v7 M75,160 v6" stroke="' + LINE + '" stroke-width="1.4" stroke-linecap="round"/>' + bangle(69.5, 175, 0) + "</g>" +
        '<g class="aldo-grip-r"><path d="M124,200 L124,170 L136,170 L138,200 Z" fill="url(#' + g("hood") + ')"/><circle cx="131" cy="166" r="9.5" fill="' + HAND + '"/><path d="M125,160 v6 M131,158 v7 M137,160 v6" stroke="' + LINE + '" stroke-width="1.4" stroke-linecap="round"/>' + bangle(130.5, 175, 0) + "</g></g>" +
        // head
        '<g class="aldo-head">' +
          '<path d="M40,100 C36,46 70,20 100,20 C130,20 164,46 160,100 C162,124 157,140 150,148 L148,112 L52,112 L50,148 C43,140 38,124 40,100 Z" fill="url(#' + g("hair") + ')"/>' +
          braid + gajra +
          '<ellipse cx="47" cy="106" rx="7" ry="10" fill="' + SKIN_D + '"/><ellipse cx="153" cy="106" rx="7" ry="10" fill="' + SKIN_D + '"/>' +
          '<ellipse cx="100" cy="98" rx="54" ry="51" fill="' + SKIN + '"/>' +
          '<g class="aldo-blush" opacity=".6"><ellipse cx="67" cy="124" rx="9" ry="4.8" fill="#ff8aa1"/><ellipse cx="133" cy="124" rx="9" ry="4.8" fill="#ff8aa1"/></g>' +
          eye(78, -1) + eye(122, 1) +
          '<path class="aldo-brow-l" d="M67,84 Q77,79 88,83" stroke="' + KAJAL + '" stroke-width="3" stroke-linecap="round" fill="none"/>' +
          '<path class="aldo-brow-r" d="M112,83 Q123,79 133,84" stroke="' + KAJAL + '" stroke-width="3" stroke-linecap="round" fill="none"/>' +
          '<circle cx="100" cy="91.5" r="2.7" fill="#d6285a"/><circle cx="99.2" cy="90.7" r=".8" fill="#fff" opacity=".7"/>' +
          '<path d="M98.5,114 Q100,116.5 101.5,114" stroke="' + LINE + '" stroke-width="1.3" stroke-linecap="round" fill="none"/>' +
          '<g transform="translate(100,128)">' +
            '<path class="m m-smile" d="M-7,-1 Q0,6.5 7,-1" stroke="#7a2140" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
            '<g class="m m-open"><path d="M-8.5,-2.5 Q0,13 8.5,-2.5 Z" fill="#7a2140"/><path d="M-4.5,4.5 Q0,9 4.5,4.5 Q0,2.5 -4.5,4.5" fill="#ff7a9a"/></g>' +
            '<path class="m m-sad" d="M-6.5,4 Q0,-2.5 6.5,4" stroke="#7a2140" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
            '<ellipse class="m m-o" rx="3.6" ry="4.4" fill="#7a2140"/>' +
            '<path class="m m-flat" d="M-5,1 Q1,-1 6,1.5" stroke="#7a2140" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
          "</g>" +
          '<path d="M44,96 C42,52 70,29 100,29 C132,29 158,52 156,96 C153,84 146,73 134,67 C122,61 108,58 101,47 C96,58 82,62 68,67 C56,72 48,82 44,96 Z" fill="url(#' + g("hair") + ')"/>' +
          '<path d="M44,92 C39,110 42,128 49,140 C50,124 51,108 54,95 Z M156,92 C161,110 158,128 151,140 C150,124 149,108 146,95 Z" fill="url(#' + g("hair") + ')"/>' +
          '<path d="M66,52 C76,41 90,37 104,37" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".2"/>' +
          jhumka(46) + jhumka(154) +
          '<path class="aldo-ahoge" d="M101,32 C95,13 110,3 123,9 C112,11 106,19 106,32 Z" fill="url(#' + g("hair") + ')"/>' +
        "</g>" +
        // hands covering eyes (with bangles)
        '<g class="aldo-cover-l"><path d="M58,216 C60,176 65,142 74,120 L90,126 C84,152 82,186 84,216 Z" fill="url(#' + g("hood") + ')"/><circle cx="80" cy="110" r="15" fill="' + HAND + '"/><path d="M71,100 l2,14 M79,97 v16 M87,99 l-1.5,14" stroke="' + LINE + '" stroke-width="1.5" stroke-linecap="round"/>' + bangle(80, 126, -18) + "</g>" +
        '<g class="aldo-cover-r"><path d="M142,216 C140,176 135,142 126,120 L110,126 C116,152 118,186 116,216 Z" fill="url(#' + g("hood") + ')"/><circle cx="120" cy="110" r="15" fill="' + HAND + '"/><path d="M129,100 l-2,14 M121,97 v16 M113,99 l1.5,14" stroke="' + LINE + '" stroke-width="1.5" stroke-linecap="round"/>' + bangle(120, 126, 18) + "</g>" +
      "</g></g>" +
      "</svg>";
  }

  function create(host, opts) {
    injectCss();
    opts = opts || {};
    var id = ++uid;
    var root = document.createElement("div");
    root.className = "aldo" + (opts.peek ? " peek" : "") + (opts.className ? " " + opts.className : "");
    root.setAttribute("data-mood", "idle");
    if (opts.size) root.style.setProperty("--aldo-size", typeof opts.size === "number" ? opts.size + "px" : opts.size);
    root.innerHTML = svgMarkup(id);
    var bubble = document.createElement("div");
    bubble.className = "aldo-bubble" + (opts.bubble === "left" ? " left" : "");
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");
    root.appendChild(bubble);
    host.appendChild(root);

    var svg = root.querySelector("svg");
    var pupils = root.querySelectorAll(".aldo-pupil");
    var head = root.querySelector(".aldo-head");
    var timers = {};
    var target = null; // {x,y} page point to look at, overrides mouse
    var mouse = null, lastMove = Date.now(), destroyed = false;

    function setPupils(dx, dy) {
      for (var i = 0; i < pupils.length; i++) pupils[i].setAttribute("transform", "translate(" + dx.toFixed(2) + "," + dy.toFixed(2) + ")");
    }
    function lookAtPoint(px, py) {
      var r = svg.getBoundingClientRect();
      if (!r.width) return;
      var cx = r.left + r.width * 0.5, cy = r.top + r.height * (98 / 232);
      var vx = px - cx, vy = py - cy;
      var d = Math.sqrt(vx * vx + vy * vy) || 1;
      var k = Math.min(1, d / 260);
      var nx = vx / d * k, ny = vy / d * k;
      setPupils(nx * 3.6, ny * 3.2);
      if (!reduce) head.style.transform = "rotate(" + (nx * 5).toFixed(2) + "deg) translate(" + (nx * 2).toFixed(1) + "px," + (ny * 1.5).toFixed(1) + "px)";
    }
    function update() {
      if (destroyed) return;
      if (target) lookAtPoint(target.x, target.y);
      else if (mouse) lookAtPoint(mouse.x, mouse.y);
    }
    function onMove(e) {
      var t = e.touches ? e.touches[0] : e;
      if (!t) return;
      mouse = { x: t.clientX, y: t.clientY };
      lastMove = Date.now();
      if (!target) requestAnimationFrame(update);
    }
    if (opts.track !== false) {
      global.addEventListener("mousemove", onMove, { passive: true });
      global.addEventListener("touchstart", onMove, { passive: true });
    }

    function blink() {
      if (destroyed) return;
      root.classList.add("blink");
      setTimeout(function () { root.classList.remove("blink"); }, 120);
      if (Math.random() < 0.22) setTimeout(function () { root.classList.add("blink"); setTimeout(function () { root.classList.remove("blink"); }, 110); }, 260);
      timers.blink = setTimeout(blink, 2400 + Math.random() * 3200);
    }
    timers.blink = setTimeout(blink, 1800);

    // Idle glances when nobody moves the mouse.
    function idle() {
      if (destroyed) return;
      if (!target && Date.now() - lastMove > 4500 && !root.classList.contains("covering")) {
        var a = Math.random() * Math.PI * 2;
        setPupils(Math.cos(a) * 3, Math.sin(a) * 2.4);
        if (!reduce) head.style.transform = "rotate(" + (Math.cos(a) * 3).toFixed(1) + "deg)";
      }
      timers.idle = setTimeout(idle, 2200 + Math.random() * 2400);
    }
    timers.idle = setTimeout(idle, 3000);

    function flag(cls, ms) {
      root.classList.remove(cls);
      void root.offsetWidth;
      root.classList.add(cls);
      clearTimeout(timers[cls]);
      timers[cls] = setTimeout(function () { root.classList.remove(cls); }, ms);
    }

    var typing = null;
    var api = {
      el: root,
      mood: function (m, ms) {
        root.setAttribute("data-mood", m || "idle");
        clearTimeout(timers.mood);
        if (ms) timers.mood = setTimeout(function () { root.setAttribute("data-mood", "idle"); }, ms);
        return api;
      },
      cover: function (on) { root.classList.toggle("covering", !!on); if (!on) root.classList.remove("peeking"); return api; },
      peekThrough: function (on) { root.classList.toggle("peeking", !!on); return api; },
      wave: function () { flag("waving", 2600); return api; },
      jump: function () { if (!reduce) flag("jumping", 720); return api; },
      shake: function () { if (!reduce) flag("shaking", 520); return api; },
      lookAt: function (x, y) { target = { x: x, y: y }; update(); return api; },
      lookAtElement: function (el, frac) {
        if (!el) return api;
        var r = el.getBoundingClientRect();
        var f = frac == null ? 0.5 : Math.max(0, Math.min(1, frac));
        return api.lookAt(r.left + 14 + (r.width - 28) * f, r.top + r.height / 2);
      },
      release: function () { target = null; update(); return api; },
      say: function (text, ms) {
        clearTimeout(timers.say); clearInterval(typing);
        if (!text) { bubble.classList.remove("show"); return api; }
        bubble.textContent = "";
        bubble.classList.add("show");
        if (reduce) bubble.textContent = text;
        else {
          var i = 0;
          typing = setInterval(function () { i += 2; bubble.textContent = text.slice(0, i); if (i >= text.length) clearInterval(typing); }, 22);
        }
        if (ms !== 0) timers.say = setTimeout(function () { bubble.classList.remove("show"); }, ms || Math.max(2600, text.length * 70));
        return api;
      },
      destroy: function () {
        destroyed = true;
        Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); });
        clearInterval(typing);
        global.removeEventListener("mousemove", onMove);
        global.removeEventListener("touchstart", onMove);
        root.remove();
      }
    };
    return api;
  }

  /* Walk along the bottom of the screen towards the mouse (desktop only). */
  function roam(dock, api, opts) {
    opts = opts || {};
    var fine = false;
    try { fine = global.matchMedia("(hover: hover) and (pointer: fine)").matches; } catch (e) {}
    if (reduce || !fine) return { active: false, pause: function () {}, resume: function () {} };
    var root = api.el, bubble = root.querySelector(".aldo-bubble");
    var speed = opts.speed || 240, gap = opts.gap || 70, minX = opts.minX || 8;
    var w = function () { return root.offsetWidth || 110; };
    var x = Math.max(minX, global.innerWidth - w() - 24), target = x, paused = false, last = performance.now(), walking = false, walked = 0;
    dock.classList.add("roaming");
    function apply() {
      dock.style.setProperty("--rx", x.toFixed(1) + "px");
      bubble.classList.toggle("edge-l", x < 140);
      bubble.classList.toggle("edge-r", x > global.innerWidth - w() - 140);
    }
    function setWalking(on) {
      if (on === walking) return;
      walking = on;
      root.classList.toggle("walking", on);
      if (!on) {
        if (walked > 260 && Math.random() < 0.35) api.wave();
        walked = 0;
      }
    }
    global.addEventListener("mousemove", function (e) {
      if (paused) return;
      var center = x + w() / 2;
      var dx = e.clientX - center;
      if (Math.abs(dx) < gap * 1.4) return;
      var t = e.clientX - w() / 2 - Math.sign(dx) * gap;
      target = Math.max(minX, Math.min(global.innerWidth - w() - 8, t));
    }, { passive: true });
    global.addEventListener("resize", function () { x = Math.min(x, global.innerWidth - w() - 8); target = Math.min(target, global.innerWidth - w() - 8); apply(); });
    (function frame(t) {
      var dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (!paused) {
        var d = target - x;
        if (Math.abs(d) > 2) {
          var step = Math.sign(d) * Math.min(Math.abs(d), speed * dt);
          x += step; walked += Math.abs(step);
          root.classList.toggle("face-left", d < 0);
          setWalking(true);
          apply();
        } else setWalking(false);
      } else setWalking(false);
      requestAnimationFrame(frame);
    })(last);
    apply();
    return {
      active: true,
      pause: function () { paused = true; },
      resume: function () { paused = false; }
    };
  }

  global.AldoMascot = { create: create, roam: roam };
})(window);
