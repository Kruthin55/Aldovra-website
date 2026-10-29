(function(){
  "use strict";

  var TIERS = [
    { name: "Bronze", min: 0, icon: "🥉" },
    { name: "Silver", min: 850, icon: "🥈" },
    { name: "Gold", min: 1800, icon: "🥇" },
    { name: "Platinum", min: 3000, icon: "💠" },
    { name: "Diamond", min: 4500, icon: "💎" }
  ];

  var state = {
    scope: "all_time",
    skillId: "",
    myCollegeOnly: false,
    rows: [],
    userId: null,
    myCollege: "",
    loading: false,
    loadedOnce: false,
    requestSeq: 0
  };

  function $(id){ return document.getElementById(id); }

  function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, function(c){
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmt(n){ return Number(n || 0).toLocaleString("en-IN"); }

  function tierFor(points){
    var t = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) if (points >= TIERS[i].min) t = TIERS[i];
    return t;
  }

  function nextTier(points){
    for (var i = 0; i < TIERS.length; i++) if (points < TIERS[i].min) return TIERS[i];
    return null;
  }

  function tierBadge(name){
    var t = TIERS.filter(function(x){ return x.name === name; })[0] || TIERS[0];
    return '<span class="arena-tier" data-tier="' + esc(t.name) + '">' + t.icon + " " + esc(t.name) + "</span>";
  }

  function initials(name){
    var parts = String(name || "A").trim().split(/\s+/);
    return esc(((parts[0] || "A")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase());
  }

  function sameCollege(a, b){
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase() && String(a || "").trim() !== "";
  }

  function seasonLabel(){
    var now = new Date();
    var month = now.toLocaleString("en-IN", { month: "short", timeZone: "Asia/Kolkata" });
    var year = now.toLocaleString("en-IN", { year: "numeric", timeZone: "Asia/Kolkata" });
    return state.scope === "month" ? month + " " + year + " season" : "All-time";
  }

  function goToAssessments(){
    var nav = document.querySelector('.sidebar .nav-item[data-section="assessments"]') ||
      document.querySelector('[data-section="assessments"]');
    if (nav) nav.click();
  }

  /* Keep the existing public-profile modal working: it reads exploreStudentsCache. */
  function syncProfileCache(rows){
    try {
      exploreStudentsCache = rows.map(function(r){
        return {
          student_id: r.student_id,
          full_name: r.display_name,
          role: "Student",
          college: r.college,
          overall_score: r.average_score,
          verified: true,
          verified_skills: r.verified_skills || [],
          rank: r.rank
        };
      });
    } catch (e) { /* profile modal not present */ }
  }

  async function ensureUser(){
    if (state.userId || typeof db === "undefined") return;
    try {
      var res = await db.auth.getUser();
      var user = res && res.data && res.data.user;
      if (!user) return;
      state.userId = user.id;
      var prof = await db.from("profiles").select("college").eq("id", user.id).maybeSingle();
      state.myCollege = (prof && prof.data && prof.data.college) || "";
    } catch (e) { /* stay anonymous */ }
  }

  async function loadSkillOptions(){
    var select = $("arenaSkillFilter");
    if (!select || select.dataset.loaded === "1" || typeof db === "undefined") return;
    try {
      var res = await db.from("assessments").select("skill_id, skills(id,name)").eq("is_active", true);
      var seen = {};
      var opts = [];
      (res.data || []).forEach(function(a){
        var s = a.skills;
        if (s && s.id && !seen[s.id]) { seen[s.id] = true; opts.push(s); }
      });
      opts.sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); });
      select.insertAdjacentHTML("beforeend", opts.map(function(s){
        return '<option value="' + esc(s.id) + '">' + esc(s.name) + "</option>";
      }).join(""));
      select.dataset.loaded = "1";
    } catch (e) { /* keep "All skills" only */ }
  }

  async function load(){
    if (typeof db === "undefined") return;
    var seq = ++state.requestSeq;
    state.loading = true;
    renderLoading();
    await ensureUser();
    var res = await db.rpc("get_competitive_leaderboard", {
      p_scope: state.scope,
      p_skill_id: state.skillId ? Number(state.skillId) : null,
      p_limit: 100
    });
    if (seq !== state.requestSeq) return;
    state.loading = false;
    state.loadedOnce = true;
    if (res.error) {
      console.error("Leaderboard loading error:", res.error);
      renderError();
      return;
    }
    state.rows = res.data || [];
    syncProfileCache(state.rows);
    render();
  }

  function renderLoading(){
    var list = $("arenaList");
    if (list && !state.loadedOnce) list.innerHTML = '<div class="arena-loading">Loading the arena…</div>';
  }

  function renderError(){
    $("arenaMe").innerHTML = "";
    $("arenaPodium").innerHTML = "";
    $("arenaList").innerHTML =
      '<div class="arena-empty"><strong>Leaderboard unavailable</strong>' +
      "We couldn't load rankings right now." +
      '<div><button type="button" class="arena-btn" data-arena-retry>Try again</button></div></div>';
  }

  function visibleRows(){
    if (!state.myCollegeOnly) return state.rows;
    return state.rows.filter(function(r){ return sameCollege(r.college, state.myCollege); });
  }

  function renderMe(){
    var box = $("arenaMe");
    var me = state.rows.filter(function(r){ return r.is_me; })[0];
    var scopeText = state.scope === "month" ? "this month" : "yet";

    if (!me) {
      box.innerHTML =
        '<div class="arena-me-cta"><div>' +
        "<h3>You're not on the board " + scopeText + "</h3>" +
        "<p>Pass any skill assessment at 75% or above and submit your exam environment video. Your verified skill instantly earns points and a rank.</p>" +
        '</div><button type="button" class="arena-btn" data-arena-assess>Take an assessment →</button></div>';
      return;
    }

    var points = Number(me.points || 0);
    var cur = tierFor(points);
    var nxt = nextTier(points);
    var pct = nxt ? Math.round(((points - cur.min) / (nxt.min - cur.min)) * 100) : 100;
    var progressText = nxt
      ? fmt(nxt.min - points) + " points to " + nxt.icon + " " + nxt.name + " — verify another skill or raise a score"
      : "Top tier reached. Defend your spot!";
    var collegeRank = "";
    if (state.myCollege) {
      var campus = state.rows.filter(function(r){ return sameCollege(r.college, state.myCollege); });
      var idx = campus.indexOf(me);
      if (idx >= 0) collegeRank = " · #" + (idx + 1) + " at your college";
    }

    box.innerHTML =
      '<div class="arena-me-grid">' +
        '<div class="arena-me-rank"><small>YOUR RANK</small>#' + esc(me.rank) + "</div>" +
        "<div>" +
          '<div class="arena-me-label">Top ' + esc(me.top_percent) + "% of " + fmt(me.total_competitors) + " verified students" + esc(collegeRank) + "</div>" +
          '<div class="arena-me-name">' + esc(me.display_name) + " " + tierBadge(me.tier) + "</div>" +
          '<div class="arena-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + Math.max(4, pct) + '%"></span></div>' +
          '<div class="arena-progress-text">' + esc(progressText) + "</div>" +
        "</div>" +
        '<div class="arena-me-points"><strong>' + fmt(points) + "</strong><span>points · " + esc(me.verified_skill_count) + " skill" + (me.verified_skill_count === 1 ? "" : "s") + " · avg " + esc(me.average_score) + "%</span></div>" +
      "</div>";
  }

  function rankLabel(r, index){
    return state.myCollegeOnly ? "#" + (index + 1) : "#" + r.rank;
  }

  function renderPodium(rows){
    var podium = $("arenaPodium");
    if (!rows.length) { podium.innerHTML = ""; return; }
    var top = rows.slice(0, 3);
    var order = top.length === 3 ? [1, 0, 2] : top.map(function(_, i){ return i; });
    var medals = ["🥇", "🥈", "🥉"];
    podium.innerHTML = order.map(function(i){
      var r = top[i];
      return '<button type="button" class="arena-podium-card explore-student-action place-' + (i + 1) + (r.is_me ? " is-me" : "") + '" data-student-id="' + esc(r.student_id) + '" aria-label="' + esc("Rank " + (i + 1) + ", " + r.display_name + ", " + r.points + " points") + '">' +
        '<div class="arena-medal" aria-hidden="true">' + medals[i] + "</div>" +
        '<div class="arena-avatar" aria-hidden="true">' + initials(r.display_name) + "</div>" +
        '<div class="arena-podium-name">' + esc(r.display_name) + (r.is_me ? ' <span class="arena-you">You</span>' : "") + "</div>" +
        '<div class="arena-podium-college">' + esc(r.college || "College not shared") + "</div>" +
        tierBadge(r.tier) +
        '<div class="arena-podium-points">' + fmt(r.points) + " <span>pts</span></div>" +
      "</button>";
    }).join("");
  }

  function rowHtml(r, index){
    var skills = (r.verified_skills || []).slice(0, 3).map(function(s){ return s.name; }).filter(Boolean).join(", ");
    var meta = [r.college || "College not shared", r.verified_skill_count + " verified skill" + (r.verified_skill_count === 1 ? "" : "s"), skills].filter(Boolean).join(" · ");
    return '<button type="button" class="arena-row explore-student-action' + (r.is_me ? " is-me" : "") + '" data-student-id="' + esc(r.student_id) + '">' +
      '<span class="arena-row-rank">' + esc(rankLabel(r, index)) + (state.myCollegeOnly ? "<small>#" + esc(r.rank) + " overall</small>" : "") + "</span>" +
      '<span class="arena-row-main"><span class="arena-row-name"><span>' + esc(r.display_name) + "</span>" + (r.is_me ? '<span class="arena-you">You</span>' : "") + "</span>" +
      '<span class="arena-row-meta">' + esc(meta) + "</span></span>" +
      tierBadge(r.tier) +
      '<span class="arena-row-points">' + fmt(r.points) + "<small>avg " + esc(r.average_score) + "%</small></span>" +
    "</button>";
  }

  function renderList(rows){
    var list = $("arenaList");
    if (!rows.length) {
      var title, body;
      if (state.myCollegeOnly) {
        title = "No one from your college is ranked yet";
        body = "Be the first from your campus to claim the top spot.";
      } else if (state.skillId) {
        title = "No verified students for this skill yet";
        body = "Pass this skill's assessment to become its first ranked student.";
      } else if (state.scope === "month") {
        title = "This month's season is wide open";
        body = "No one has verified a skill this month. Claim #1 before anyone else.";
      } else {
        title = "The arena is open";
        body = "No students have a verified skill yet. Be the first to claim #1 on the Aldovra leaderboard.";
      }
      list.innerHTML = '<div class="arena-empty"><strong>' + esc(title) + "</strong>" + esc(body) +
        '<div><button type="button" class="arena-btn" data-arena-assess>Start an assessment</button></div></div>';
      return;
    }

    var rest = rows.slice(3);
    var html = rest.map(function(r, i){ return rowHtml(r, i + 3); }).join("");

    /* When the student sits outside the shown range, pin their row at the bottom. */
    var me = rows.filter(function(r){ return r.is_me; })[0];
    var maxShownRank = 0;
    rows.forEach(function(r){ if (!r.is_me && r.rank > maxShownRank) maxShownRank = r.rank; });
    if (me && !state.myCollegeOnly && me.rank > maxShownRank + 1 && rows.indexOf(me) >= 3) {
      html = rest.filter(function(r){ return !r.is_me; }).map(function(r, i){ return rowHtml(r, i + 3); }).join("") +
        '<div class="arena-gap" aria-hidden="true">···</div>' + rowHtml(me, rows.indexOf(me));
    }

    /* Ranks after the podium live in a fixed-height panel that scrolls, so a long
       leaderboard never pushes the rest of the dashboard down. The student's own row
       stays pinned to the bottom of the panel until they scroll to it. */
    var count = rest.length;
    if (count > 6) {
      var last = rows[rows.length - 1];
      html = '<div class="arena-scroll-head"><span>Ranks 4–' + esc(state.myCollegeOnly ? rows.length : last.rank) + '</span><span>Scroll to see more</span></div>' +
        '<div class="arena-scroll" tabindex="0" role="region" aria-label="More ranked students">' + html + "</div>";
    }
    list.innerHTML = html;
    var scroller = list.querySelector(".arena-scroll");
    if (scroller) {
      var sync = function(){ scroller.classList.toggle("at-end", scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4); };
      scroller.addEventListener("scroll", sync, { passive: true });
      if (scroller.querySelector(".is-me")) scroller.classList.add("has-me");
      sync();
    }
  }

  function renderLegend(){
    var legend = $("arenaTierLegend");
    if (!legend || legend.dataset.done) return;
    legend.innerHTML = TIERS.map(function(t){
      return tierBadge(t.name).replace("</span>", " · " + fmt(t.min) + "+</span>");
    }).join("");
    legend.dataset.done = "1";
  }

  function render(){
    var rows = visibleRows();
    $("arenaSeasonLabel").textContent = seasonLabel();
    var toggle = $("arenaCollegeToggle");
    if (toggle) {
      toggle.disabled = !state.myCollege;
      toggle.title = state.myCollege ? "Show students from " + state.myCollege : "Add your college in your profile to use this filter";
    }
    renderMe();
    renderPodium(rows);
    renderList(rows);
    renderLegend();
  }

  document.addEventListener("click", function(event){
    var scopeBtn = event.target.closest("[data-arena-scope]");
    if (scopeBtn) {
      state.scope = scopeBtn.dataset.arenaScope;
      document.querySelectorAll("[data-arena-scope]").forEach(function(b){
        var on = b === scopeBtn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      });
      load();
      return;
    }
    if (event.target.closest("#arenaCollegeToggle")) {
      var t = $("arenaCollegeToggle");
      state.myCollegeOnly = !state.myCollegeOnly;
      t.setAttribute("aria-pressed", String(state.myCollegeOnly));
      render();
      return;
    }
    if (event.target.closest("[data-arena-assess]")) { goToAssessments(); return; }
    if (event.target.closest("[data-arena-retry]")) { load(); return; }
    if (event.target.closest('[data-section="explore"]')) { load(); }
  });

  document.addEventListener("change", function(event){
    if (event.target && event.target.id === "arenaSkillFilter") {
      state.skillId = event.target.value;
      load();
    }
  });

  function start(){
    if (!$("exploreSection") || !$("arenaList")) return;
    loadSkillOptions();
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
