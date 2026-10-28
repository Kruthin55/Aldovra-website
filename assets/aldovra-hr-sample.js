/* HR workspace pages that still show built-in example records get a clear "sample data" notice,
   so nobody mistakes the example candidates for real Aldovra students. Remove a page from this
   list once it loads live data. */
(function () {
  "use strict";
  var main = document.querySelector("main") || document.body;
  var note = document.createElement("div");
  note.className = "ald-sample-note";
  note.setAttribute("role", "note");
  note.innerHTML =
    '<span class="dot" aria-hidden="true"></span>' +
    '<div><strong>Preview workspace — sample data.</strong> ' +
    'The candidates, scores and calls on this page are examples to show how the HR workspace works. ' +
    'Real verified students appear in <a href="/hr-candidates.html">Candidates</a> once they opt in.</div>';
  var css = document.createElement("style");
  css.textContent =
    ".ald-sample-note{display:flex;gap:12px;align-items:flex-start;margin:0 0 18px;padding:12px 16px;border-radius:14px;" +
    "background:#fff8e6;border:1px solid #f2d27a;color:#5b4300;font-size:13.5px;line-height:1.5}" +
    ".ald-sample-note .dot{flex:none;width:9px;height:9px;margin-top:6px;border-radius:50%;background:#f2b631;box-shadow:0 0 0 4px rgba(242,182,49,.25)}" +
    ".ald-sample-note a{color:#4f46e5;font-weight:600}" +
    "[data-theme=dark] .ald-sample-note,body.dark .ald-sample-note{background:#2a2310;border-color:#5c4a17;color:#f5dc9a}";
  document.head.appendChild(css);
  main.insertBefore(note, main.firstElementChild);
})();
