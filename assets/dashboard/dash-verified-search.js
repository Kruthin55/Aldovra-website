(function(){
  const root=document.getElementById("premiumVerifiedSection");
  if(!root||typeof db==="undefined")return;
  const status=document.getElementById("verifiedJobSearchStatus");
  const verifyButton=root.querySelector("[data-vj-verify]");
  const matchesButton=root.querySelector("[data-vj-matches]");
  const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const assessmentSkill=attempt=>{
    const assessment=Array.isArray(attempt.assessments)?attempt.assessments[0]:(attempt.assessments||{});
    const skill=Array.isArray(assessment.skills)?assessment.skills[0]:(assessment.skills||{});
    const raw=skill.name||assessment.title||attempt.skill_name||"";
    return String(raw).replace(/\s+(?:Fundamentals\s+)?Assessment$/i,"").trim();
  };
  const goAssessments=()=>document.querySelector('.sidebar .nav-item[data-section="assessments"]')?.click();
  const goVerifiedMatches=()=>{
    const tab=document.querySelector('#aldovraJobsSection [data-ald-job-tab="verified"]');
    if(!tab||tab.disabled)return;
    document.getElementById("aldovraJobsSection")?.scrollIntoView({behavior:"smooth",block:"start"});
    tab.click();
  };
  verifyButton?.addEventListener("click",goAssessments);
  matchesButton?.addEventListener("click",goVerifiedMatches);

  async function load(){
    try{
      const {data:authData,error:authError}=await db.auth.getUser();
      const user=authData?.user||window.currentUser||null;
      if(authError||!user){
        status.innerHTML='<span class="ald-vj-status-pill">Sign in to check your verified skills</span><span>Regular jobs are still free to browse and apply for.</span>';
        verifyButton.textContent="Sign in / verify skills";
        verifyButton.addEventListener("click",()=>{window.location.href="/login.html";},{once:true});
        return;
      }
      const result=await db.from("assessment_attempts")
        .select("skill_name,passed,assessment_id,assessments(title,skill_id,skills(name))")
        .eq("user_id",user.id).eq("passed",true).limit(100);
      if(result.error)throw result.error;
      const skills=[...new Set((result.data||[]).map(assessmentSkill).filter(name=>name&&!/^aldovra skill assessment$/i.test(name)))];
      status.innerHTML=(skills.length
        ?'<span class="ald-vj-status-pill is-verified">✓ '+skills.length+' verified skill'+(skills.length===1?"":"s")+'</span><span>Verified Matches is unlocked. Matching jobs will be ranked first in that feed.</span>'
        :'<span class="ald-vj-status-pill">No verified skills yet</span><span>Pass your first assessment to unlock the Verified Matches feed.</span>');
      matchesButton.disabled=skills.length===0;
      matchesButton.textContent=skills.length?"Open Verified Matches →":"Verify skills to unlock";
      const tab=document.querySelector('#aldovraJobsSection [data-ald-job-tab="verified"]');
      if(tab){
        tab.disabled=skills.length===0;
        tab.textContent=skills.length?"Verified Matches ✓":"Verified Matches 🔒";
        tab.title=skills.length?"Jobs matched to skills you've verified":"Pass an Aldovra skill assessment to unlock verified matches";
      }
      if(skills.length===0)verifyButton.textContent="Start a skill assessment →";
      else verifyButton.textContent="Verify another skill";
    }catch(error){
      console.error("Verified job search status failed to load",error);
      status.innerHTML='<span class="ald-vj-status-pill">Verification status unavailable</span><span>Open Assessments to review your skill verification and try again.</span>';
      verifyButton.textContent="Open Assessments";
      matchesButton.disabled=true;
    }
  }
  load();
})();
