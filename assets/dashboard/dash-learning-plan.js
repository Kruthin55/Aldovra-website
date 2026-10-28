(function(){
 const grid=document.getElementById("aldJobsGrid");if(!grid)return;
 const resources=[
  {re:/python/i,name:"Python",hours:"4–8 hours",url:"https://docs.python.org/3/tutorial/"},
  {re:/sql/i,name:"SQL",hours:"3–6 hours",url:"https://sqlbolt.com/"},
  {re:/javascript/i,name:"JavaScript",hours:"4–8 hours",url:"https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide"},
  {re:/typescript/i,name:"TypeScript",hours:"3–6 hours",url:"https://www.typescriptlang.org/docs/"},
  {re:/react/i,name:"React",hours:"4–8 hours",url:"https://react.dev/learn"},
  {re:/node/i,name:"Node.js",hours:"3–6 hours",url:"https://nodejs.org/en/learn"},
  {re:/java/i,name:"Java",hours:"5–10 hours",url:"https://dev.java/learn/"},
  {re:/c\+\+/i,name:"C++",hours:"5–10 hours",url:"https://www.learncpp.com/"},
  {re:/c#/i,name:"C#",hours:"4–8 hours",url:"https://learn.microsoft.com/en-us/dotnet/csharp/"},
  {re:/html|css/i,name:"HTML/CSS",hours:"3–6 hours",url:"https://developer.mozilla.org/en-US/docs/Learn"},
  {re:/excel/i,name:"Excel",hours:"3–5 hours",url:"https://support.microsoft.com/en-us/excel"},
  {re:/power bi/i,name:"Power BI",hours:"4–8 hours",url:"https://learn.microsoft.com/en-us/training/powerplatform/power-bi/"},
  {re:/tableau/i,name:"Tableau",hours:"3–6 hours",url:"https://www.tableau.com/learn/training"},
  {re:/aws/i,name:"AWS",hours:"4–8 hours",url:"https://skillbuilder.aws/"},
  {re:/azure/i,name:"Azure",hours:"4–8 hours",url:"https://learn.microsoft.com/en-us/training/azure/"},
  {re:/machine learning/i,name:"Machine Learning",hours:"6–12 hours",url:"https://developers.google.com/machine-learning/crash-course"},
  {re:/data analys/i,name:"Data Analysis",hours:"4–8 hours",url:"https://www.kaggle.com/learn"},
  {re:/git/i,name:"Git",hours:"2–4 hours",url:"https://git-scm.com/book/en/v2"},
  {re:/rest api/i,name:"REST APIs",hours:"3–6 hours",url:"https://developer.mozilla.org/en-US/docs/Web/HTTP"},
  {re:/spring boot/i,name:"Spring Boot",hours:"4–8 hours",url:"https://spring.io/guides"},
  {re:/django/i,name:"Django",hours:"4–8 hours",url:"https://docs.djangoproject.com/en/stable/intro/tutorial01/"},
  {re:/communication/i,name:"Communication",hours:"2–4 hours",url:"https://www.coursera.org/learn/wharton-communication-skills"}
 ];
 const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 function build(card){
  if(card.querySelector(".ald-learning-trigger"))return;
  const gap=[...card.querySelectorAll(".ald-job-skills")].find(el=>/Skill gaps:/i.test(el.textContent));
  if(!gap)return;
  const raw=gap.textContent.replace(/^.*?Skill gaps:\s*/i,"").split(/—|–/)[0].trim();
  const names=raw.split(",").map(s=>s.trim()).filter(Boolean).slice(0,4);
  if(!names.length)return;
  const btn=document.createElement("button");btn.type="button";btn.className="ald-learning-trigger";btn.textContent="Build a learning plan ↗";
  btn.addEventListener("click",()=>openPlan(card,names));
  const actions=card.querySelector(".ald-job-actions");(actions||gap).appendChild(btn);
 }
 function openPlan(card,names){
  document.querySelector(".ald-learning-overlay")?.remove();
  const title=card.querySelector(".ald-job-title")?.textContent||"this role";
  const items=names.map(n=>{const r=resources.find(x=>x.re.test(n));return {name:r?.name||n,hours:r?.hours||"2–6 hours to begin",url:r?.url||"https://www.google.com/search?q="+encodeURIComponent(n+" official documentation tutorial")};});
  const total=items.reduce((sum,x)=>sum+(parseInt((x.hours.match(/\d+/)||["3"])[0],10)||3),0);
  const overlay=document.createElement("div");overlay.className="ald-learning-overlay";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","Skill-gap learning plan");
  overlay.innerHTML='<section class="ald-learning-dialog"><button type="button" class="ald-learning-close" aria-label="Close">✕ Close</button><h2>Your skill-gap learning plan</h2><p>For <strong>'+esc(title)+'</strong>. Start with one missing skill, practise it in a small project, then add evidence to your profile or take the relevant Aldovra verification assessment.</p><p><strong>'+items.length+' skill(s) · roughly '+total+'+ study hours</strong> as a starter estimate, not a guarantee of job readiness.</p>'+items.map((x,i)=>'<div class="ald-learning-item"><strong>'+ (i+1)+'. '+esc(x.name)+' <span style="font-weight:400;color:#64748b">· '+esc(x.hours)+'</span></strong><a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">Open free learning resource ↗</a><p style="margin:7px 0 0">Practice task: build one small example using '+esc(x.name)+' and record what you completed.</p></div>').join("")+'<p class="ald-learning-note">Resources are external links. Time estimates are indicative; this plan does not claim the skill is verified or that an employer will accept an application.</p></section>';
  const close=()=>overlay.remove();overlay.addEventListener("click",e=>{if(e.target===overlay)close();});overlay.querySelector(".ald-learning-close").addEventListener("click",close);document.addEventListener("keydown",function escClose(e){if(e.key==="Escape"){close();document.removeEventListener("keydown",escClose);}});document.body.appendChild(overlay);overlay.querySelector(".ald-learning-close").focus();
 }
 const scan=()=>grid.querySelectorAll(".ald-job-card").forEach(build);
 new MutationObserver(scan).observe(grid,{childList:true,subtree:true});scan();
})();
