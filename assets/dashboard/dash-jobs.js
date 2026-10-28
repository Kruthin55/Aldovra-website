(function(){
const root=document.getElementById("aldovraJobsSection");if(!root||typeof db==="undefined")return;
const grid=document.getElementById("aldJobsGrid"),total=document.getElementById("aldJobsTotal"),search=document.getElementById("aldJobSearch"),loc=document.getElementById("aldJobLocation"),mode=document.getElementById("aldJobWorkMode"),type=document.getElementById("aldJobType"),level=document.getElementById("aldJobLevel"),posted=document.getElementById("aldJobPosted");
let jobs=[],skills=new Set(),skillNames=new Set(),verifiedExamSkills=new Set(),resumeTerms=new Set(),preferences={},tracker=[],tab="all",user=null,lastFeedRefreshAt=null;
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),norm=v=>String(v||"").trim().toLowerCase(),uniq=a=>[...new Set(a.filter(Boolean))].sort();
const indiaCompanyPattern=/\b(tcs|tata consultancy services|infosys|wipro|hcltech|tech mahindra|lti mindtree|ltimindtree|persistent systems|zoho|freshworks|razorpay|phonepe|paytm|swiggy|zomato|meesho|flipkart|groww|cred|dream11|inmobi|ola|makemytrip|policybazaar|delhivery|urban company|zerodha|browserstack|postman|druva|chargebee|juspay|darwinbox|highradius|cyient|valuelabs|reliance|jio|airtel|hdfc|icici|axis bank|kotak|tata motors|mahindra)\b/i;
  // Keep the student feed India-only. An Indian company can still have overseas roles.
  const indiaLocationPattern=/\b(india|hyderabad|secunderabad|telangana|bengaluru|bangalore|karnataka|chennai|tamil nadu|pune|maharashtra|nellore|andhra pradesh|visakhapatnam|vizag|vijayawada|tirupati|guntur|kurnool|mumbai|gurugram|gurgaon|noida|new delhi|delhi ncr|kolkata|west bengal|ahmedabad|gujarat|kochi|kerala|coimbatore|jaipur|rajasthan|indore|bhopal|lucknow|chandigarh|mohali|bhubaneswar|odisha|mysuru|mysore|mangaluru|mangalore|thiruvananthapuram|madurai|trichy|nagpur|vadodara|surat|dehradun|ranchi|patna|guwahati)\b/i;
  const indiaRemotePattern=/\b(remote|distributed|work from anywhere|anywhere)\b/i;
  function isIndiaEligibleJob(j){const location=String(j.location||"");const description=String(j.description||"").replace(/<[^>]*>/g," ");const combined=location+" "+description+" "+String(j.work_mode||"");if(indiaLocationPattern.test(location))return true;return indiaRemotePattern.test(combined)&&/\b(remote(?:\s*[-:]?\s*(?:from|within|in)?\s*)?india|india remote|anywhere in india|indian residents|based in india|within india|india only|india timezone|india time zone|work from india|located in india|india[- ]based)\b/i.test(combined);}
  function locationPriority(j){const location=norm(j.location),context=norm(j.description),mode=norm(j.work_mode),combined=location+" "+context;let score=0;if(/hyderabad|secunderabad|telangana/.test(location))score+=120;else if(/bengaluru|bangalore/.test(location))score+=110;else if(/\bnellore\b/.test(location))score+=105;else if(/\bpune\b/.test(location))score+=100;else if(/chennai/.test(location))score+=100;else if(/\bindia\b|mumbai|gurugram|gurgaon|noida|new delhi|kolkata|ahmedabad|kochi|coimbatore|jaipur|indore|vijayawada|visakhapatnam|tirupati/.test(location))score+=75;if(/remote/.test(mode)&&/\bindia\b|india only|within india|india remote|work from india/.test(combined))score=Math.max(score,80);if(indiaCompanyPattern.test(j.company_name||""))score+=5;return score;}
  function locationPriorityLabel(j){const location=norm(j.location),combined=location+" "+norm(j.description),mode=norm(j.work_mode);if(/hyderabad|secunderabad|telangana/.test(location))return "🇮🇳 Hyderabad priority";if(/bengaluru|bangalore/.test(location))return "🇮🇳 Bengaluru priority";if(/\bnellore\b/.test(location))return "🇮🇳 Nellore priority";if(/\bpune\b/.test(location))return "🇮🇳 Pune priority";if(/chennai/.test(location))return "🇮🇳 Chennai priority";if(indiaLocationPattern.test(location))return "🇮🇳 India priority";if(/remote/.test(mode)&&/\bindia\b|india only|within india|india remote|work from india/.test(combined))return "🇮🇳 India remote priority";return "";}
function inferredRequirements(j){const text=norm([j.title,j.description,...(j._skills||[]).map(s=>s.name)].join(" "));const catalog=[["Java",/\bjava\b/],["Python",/\bpython\b/],["SQL",/\bsql\b|postgresql|mysql/],["JavaScript",/javascript|\bjs\b/],["TypeScript",/typescript/],["React",/\breact\b/],["Node.js",/node\.?js/],["C++",/c\+\+/],["C#",/c#|\bcsharp\b/],["HTML/CSS",/html|css/],["Excel",/\bexcel\b/],["Power BI",/power bi/],["Tableau",/tableau/],["AWS",/\baws\b|amazon web services/],["Azure",/\bazure\b/],["Machine Learning",/machine learning|\bml\b/],["Data Analysis",/data analy[st]sis|data analytics/],["Git",/\bgit\b|github/],["REST APIs",/rest api|restful/],["Spring Boot",/spring boot/],["Django",/django/],["Communication",/communication skills|verbal and written/]];const explicit=(j._skills||[]).map(s=>s.name).filter(Boolean);const found=catalog.filter(([name,re])=>re.test(text)).map(([name])=>name);return [...new Set([...explicit,...found])].slice(0,10);}
function jobEligibility(j){
const title=String(j.title||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().toLowerCase();
const description=String(j.description||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().toLowerCase();
const levelText=String(j.experience_level||"").toLowerCase();
const typeText=String(j.employment_type||"").toLowerCase();
const low=[title,levelText,typeText].join(" ");
const allText=[title,levelText,typeText,description].join(" ");
const years=[];
const rangeRe=/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/gi;
let m;
const ranges=[];while((m=rangeRe.exec(allText))!==null){ranges.push({min:Number(m[1]),max:Number(m[2])});years.push(Number(m[2]));}const allowedEntryRange=ranges.some(r=>r.min===0&&r.max<=2);
const textWithoutRanges=allText.replace(rangeRe," ");
const re=/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/gi;
while((m=re.exec(textWithoutRanges))!==null)years.push(Number(m[1]));
const maxYears=years.length?Math.max(...years):null;
const qualificationText=description.split(/(?:minimum qualifications|basic qualifications|requirements|experience requirements|what you.ll need)\s*:?/i).slice(1).join(" ");
const mandatoryExperience=/\b(?:must have|required minimum of|minimum of|minimum|min\.?|at least|over|more than)\s*(?:of\s*)?[1-9]\d*\s*(?:\+\s*)?(?:years?|yrs?)\b/i.test(textWithoutRanges)||/\b[1-9]\d*\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+)?(?:experience|exp)\s+(?:is\s+)?(?:required|mandatory|needed|must)\b/i.test(textWithoutRanges)||/\b(?:must have|required minimum of)\s*[1-9]\d*\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|professional\s+)?experience\b/i.test(textWithoutRanges)||/\b[1-9]\d*\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+)?(?:experience|exp)\b/i.test(qualificationText.replace(rangeRe," "));
const internship=/\bintern(ship)?\b/i.test(title+" "+typeText);
const senior=!internship&&/\b(senior|staff|principal|lead|manager|director|head|chief|vice president|architect)\b/i.test(title);
const entryTitle=/\b(junior|fresher|graduate trainee|new grad|entry[ -]?level|associate(?: engineer| developer| analyst)?|trainee|apprentice)\b/i.test(title);
const explicitNoExperience=/\b(no experience required|without prior experience|0\s*(?:-|to)\s*1\s+years?\s+(?:of\s+)?experience|recent graduates? (?:are )?welcome|freshers? (?:can|may) apply)\b/i.test(description);
const taggedFresher=/\b(fresher|entry[ -]?level|graduate|new grad|early career)\b/i.test(levelText);
const fresher=!internship&&!senior&&!mandatoryExperience&&(maxYears!==null?(maxYears<=1||(allowedEntryRange&&maxYears<=2)):(entryTitle||explicitNoExperience||taggedFresher));
const experienced=senior||mandatoryExperience||(maxYears!==null&&maxYears>=2&&!(allowedEntryRange&&maxYears<=2));
const requiredTerms=/\b(required|must have|minimum qualifications|basic qualifications|you will need|requirements)\b/i.test(description);
const preferredTerms=/\b(preferred|nice to have|bonus points|good to have|desirable)\b/i.test(description);
let level=internship?"Internship":senior?"Experienced / Senior":fresher?"Fresher / Graduate":experienced?(maxYears!==null?maxYears+"+ years experience":"Experienced role"):(j.experience_level||"Experience not specified");
return {level,maxYears,internship,fresher,senior,experienced,mandatoryExperience,allowedEntryRange,requiredTerms,preferredTerms,eligibility:internship?"Internship role":senior?"Likely not entry-level":fresher?"Entry-level signals found":maxYears!==null?maxYears+"+ years may be required":"Check employer description"};
}
function noExperienceEligible(j){
  const e=jobEligibility(j);
  const text=[j.title,j.description,j.experience_level].map(v=>String(v||"").replace(/<[^>]*>/g," ")).join(" ").replace(/\s+/g," ").replace(/\byears?\s*\(\s*s\s*\)/gi,"years");
  const positiveRange=/\b([1-9]\d*)\s*(?:-|–|to)\s*([1-9]\d*)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const positivePlus=/\b[1-9]\d*\s*\+\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const positiveYears=/\b(?:minimum|min\.?|at least|over|more than|must have|required minimum of)\s*(?:of\s*)?[1-9]\d*\s*(?:\+\s*)?(?:years?|yrs?)\b/i;
  const yearsExperience=/(?<!\b0\s*(?:-|–|to)\s*)\b[1-9]\d*\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const labelledYears=/\b(?:years? of (?:relevant |work |professional |total )?experience|(?:total |work |relevant )?experience(?: required)?)\s*[:\-–]\s*(?:minimum\s*|min\.?\s*|at least\s*)?[1-9]\d*\s*(?:\+|(?:-|–|to)\s*\d+)?\s*(?:years?|yrs?)?\b/i;
  if(labelledYears.test(text)||/\bsr\.?\s/i.test(String(j.title||"")+" "))return false;
  return !positiveRange.test(text)&&!positivePlus.test(text)&&!positiveYears.test(text)&&!yearsExperience.test(text)&&!e.senior&&!e.mandatoryExperience&&!e.experienced&&(e.maxYears===null||e.allowedEntryRange)&&(e.fresher||e.internship);
}
function requirementMatch(j){const req=inferredRequirements(j);const known=[...skillNames,...verifiedExamSkills];const resumeHit=n=>{const words=norm(n).split(/[^a-z0-9+#.]+/).filter(w=>w.length>2);return words.length>0&&words.every(w=>resumeTerms.has(w));};const examHit=n=>verifiedExamSkills.has(norm(n));const profileHit=n=>known.some(k=>norm(k)===norm(n)||norm(k).includes(norm(n))||norm(n).includes(norm(k)));const hits=req.filter(n=>profileHit(n)||resumeHit(n));return {requirements:req,matched:hits,missing:req.filter(n=>!hits.includes(n)),verified:hits.filter(examHit),fromResume:hits.filter(resumeHit)};}
function sourceLabel(j){const p=norm(j.source_provider);const names={greenhouse:"Greenhouse",lever:"Lever",ashby:"Ashby",jobicy:"Jobicy",smartrecruiters:"SmartRecruiters",remoteok:"Remote OK",himalayas:"Himalayas"};let host="";try{host=new URL(j.source_url||j.application_url||"").hostname.replace(/^www\./,"");}catch{}return {label:names[p]||"Company listing",host};}
function match(j){const req=(j._skills||[]).filter(s=>s.required),opt=(j._skills||[]).filter(s=>!s.required),normName=n=>norm(n),profileHas=name=>{const target=normName(name);return !!target&&[...skillNames,...verifiedExamSkills].some(k=>{const key=normName(k);return !!key&&(key===target||key.includes(target)||target.includes(key));})},resumeHas=name=>{const words=normName(name).split(/[^a-z0-9+#.]+/).filter(w=>w.length>2);return words.length>0&&words.every(w=>resumeTerms.has(w));},hit=s=>skills.has(String(s.skill_id))||profileHas(s.name)||resumeHas(s.name),a=req.filter(hit),b=opt.filter(hit),n=req.length+opt.length,inferred=n?[]:inferredRequirements(j),inferredMatched=inferred.filter(name=>profileHas(name)||resumeHas(name)),inferredExamHits=inferred.filter(name=>verifiedExamSkills.has(normName(name))).length,base=n?Math.round((a.length+b.length*.5)/n*100):inferred.length?Math.round(inferredMatched.length/inferred.length*70):0,text=norm([j.title,j.description,...(j._skills||[]).map(s=>s.name)].join(" ")),resumeHits=inferredRequirements(j).filter(resumeHas).length,resumeBonus=Math.min(12,resumeHits*3),examHits=(j._skills||[]).filter(s=>verifiedExamSkills.has(normName(s.name))).length+(n?0:inferredExamHits),examBonus=Math.min(18,examHits*6),roles=Array.isArray(preferences.target_roles)?preferences.target_roles:[],roleBonus=roles.some(r=>text.includes(norm(r)))?8:0,preferredLocations=Array.isArray(preferences.preferred_locations)?preferences.preferred_locations:[],locationBonus=preferredLocations.some(l=>norm(j.location).includes(norm(l)))?4:0,score=n?Math.min(99,Math.round(base*.7+Math.min(100,base+examBonus)*.15+Math.min(100,base+resumeBonus)*.1+roleBonus+locationBonus)):inferred.length?Math.min(89,Math.round(base*.7+Math.min(100,base+examBonus)*.15+Math.min(100,base+resumeBonus)*.1+roleBonus+locationBonus)):Math.min(65,resumeBonus+examBonus+roleBonus+locationBonus),missing=n?req.filter(s=>!hit(s)):inferred.filter(name=>!profileHas(name)&&!resumeHas(name)).map(name=>({name}));return{score,missing,resumeHits,examHits,inferredOnly:!n&&inferred.length>0,breakdown:{requiredMatched:a.length,requiredTotal:req.length,optionalMatched:b.length,optionalTotal:opt.length,verifiedEvidence:examHits,resumeEvidence:resumeHits,targetRole:roleBonus>0,preferredLocation:locationBonus>0,estimated:!n&&inferred.length>0}};}
function verifiedSkillNamesForJob(j){
  const explicit=(j._skills||[]).filter(skill=>skill.name&&verifiedExamSkills.has(norm(skill.name))).map(skill=>skill.name);
  const inferred=inferredRequirements(j).filter(name=>verifiedExamSkills.has(norm(name)));
  return uniq([...explicit,...inferred]);
}
function tracked(j){return tracker.find(t=>String(t.opportunity_id||"")===String(j.id)||(!t.opportunity_id&&norm(t.job_title)===norm(j.title)&&norm(t.company_name)===norm(j.company_name)));}
function jobAgeLabel(value){const ts=Date.parse(value||"");if(!Number.isFinite(ts)||ts<=0)return "Added date unavailable";const days=Math.max(0,Math.floor((Date.now()-ts)/86400000));if(days===0)return "Added to Aldovra today";if(days===1)return "Added to Aldovra 1 day ago";if(days<30)return "Added to Aldovra "+days+" days ago";const months=Math.floor(days/30);return "Added to Aldovra "+months+" month"+(months===1?"":"s")+" ago";}
function renderJobFeedStats(){const todayEl=document.getElementById("aldJobsToday"),weekEl=document.getElementById("aldJobsWeek"),availableEl=document.getElementById("aldJobsAvailable"),refreshEl=document.getElementById("aldJobsLastRefresh");const now=new Date(),startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate()),startWeek=new Date(startToday);startWeek.setDate(startWeek.getDate()-((startWeek.getDay()+6)%7));const addedToday=jobs.filter(j=>{const d=Date.parse(j.created_at||"");return Number.isFinite(d)&&d>=startToday.getTime()&&d<=now.getTime();}).length,addedWeek=jobs.filter(j=>{const d=Date.parse(j.created_at||"");return Number.isFinite(d)&&d>=startWeek.getTime()&&d<=now.getTime();}).length;if(todayEl)todayEl.textContent=String(addedToday);if(weekEl)weekEl.textContent=String(addedWeek);if(availableEl)availableEl.textContent=jobs.length.toLocaleString("en-IN");if(refreshEl)refreshEl.textContent=lastFeedRefreshAt?lastFeedRefreshAt.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):"Loading…";}
const ALD_CITY_FILTERS=["Hyderabad","Bengaluru","Chennai","Pune","Mumbai","Gurugram","Noida","Delhi","Kolkata","Ahmedabad","Kochi","Coimbatore","Visakhapatnam","Vijayawada","Jaipur","Indore","Chandigarh","Thiruvananthapuram","Mysuru","Nagpur","Vadodara","Bhubaneswar"];
const ALD_CITY_ALIASES={bengaluru:["bengaluru","bangalore"],gurugram:["gurugram","gurgaon"],delhi:["delhi","new delhi"],mysuru:["mysuru","mysore"],thiruvananthapuram:["thiruvananthapuram","trivandrum"],visakhapatnam:["visakhapatnam","vizag"],kochi:["kochi","cochin"],hyderabad:["hyderabad","secunderabad"]};
function cityOptionsHtml(list){const counts=ALD_CITY_FILTERS.map(c=>{const keys=ALD_CITY_ALIASES[c.toLowerCase()]||[c.toLowerCase()];return {c,n:list.filter(j=>keys.some(k=>norm(j.location).includes(k))).length};}).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);const remote=list.filter(j=>norm(j.work_mode)==="remote").length;return '<option value="">All locations</option>'+counts.map(x=>'<option value="'+esc(x.c.toLowerCase())+'">'+esc(x.c)+' ('+x.n+')</option>').join("")+(remote?'<option value="remote">Remote ('+remote+')</option>':'');}
function jobAddedTime(j){const t=Date.parse(j.created_at||"");const p=j.posting_date?Date.parse(j.posting_date+"T00:00:00+05:30"):NaN;return Math.max(Number.isFinite(t)?t:0,Number.isFinite(p)?p:0);}
function isNewJob(j){const t=jobAddedTime(j);return t>0&&Date.now()-t<36*3600000;}
function prettyLevel(v){const x=String(v||"").toLowerCase();if(x==="fresher")return "Fresher";if(x==="entry level")return "Entry level · 0–2 yrs";return String(v||"");}
function dedupeJobs(list){const seen=new Set();return list.filter(j=>{const key=norm(j.company_name)+"|"+norm(j.title).replace(/\s+/g," ")+"|"+norm(j.location);if(seen.has(key))return false;seen.add(key);return true;});}
function filtered(){
  // Collapse repeat requisitions of the same role in browse tabs; keep every tracked job in Saved/Applied.
  let a=(tab==="saved"||tab==="applied")?[...jobs]:dedupeJobs([...jobs].sort((x,y)=>jobAddedTime(y)-jobAddedTime(x)));
  const priority=j=>verifiedExamSkills.size&&verifiedSkillNamesForJob(j).length?14:0;
  if(tab==="recommended")a=a.filter(j=>{return noExperienceEligible(j)&&match(j).score>0;}).sort((x,y)=>(priority(y)+match(y).score+locationPriority(y)*.35)-(priority(x)+match(x).score+locationPriority(x)*.35)||new Date(y.created_at)-new Date(x.created_at));
  else if(tab==="verified")a=a.filter(j=>{return noExperienceEligible(j)&&verifiedSkillNamesForJob(j).length>0;}).sort((x,y)=>(verifiedSkillNamesForJob(y).length*100+match(y).score+locationPriority(y)*.35)-(verifiedSkillNamesForJob(x).length*100+match(x).score+locationPriority(x)*.35)||new Date(y.created_at)-new Date(x.created_at));
  else if(tab==="saved")a=a.filter(j=>noExperienceEligible(j)&&tracked(j));
  else if(tab==="applied")a=a.filter(j=>noExperienceEligible(j)&&tracked(j)?.status==="applied");
  else if(tab==="all")a=a.filter(noExperienceEligible).sort((x,y)=>locationPriority(y)-locationPriority(x)||new Date(y.created_at)-new Date(x.created_at));
  const q=norm(search.value),l=norm(loc.value),m=norm(mode.value),t=norm(type.value),lv=norm(level&&level.value),days=Number(posted&&posted.value)||0;
  const cutoff=days?Date.now()-days*86400000:0;
  return a.filter(j=>(!q||[j.title,j.company_name,j.description,j.location,...(j._skills||[]).map(s=>s.name)].join(" ").toLowerCase().includes(q))&&(!l||(l==="remote"?norm(j.work_mode)==="remote":(ALD_CITY_ALIASES[l]||[l]).some(k=>norm(j.location).includes(k))))&&(!m||norm(j.work_mode)===m)&&(!t||norm(j.employment_type)===t)&&(!lv||norm(j.experience_level)===lv)&&(!cutoff||jobAddedTime(j)>=cutoff));
}
function renderTrackerInsights(){const box=document.getElementById("aldApplicationInsights");if(!box)return;const count=status=>tracker.filter(t=>t.status===status).length;const saved=count("saved"),preparing=count("preparing"),applied=count("applied"),interview=count("interview"),rejected=count("rejected"),withdrawn=count("withdrawn"),totalTracked=tracker.length,active=saved+preparing+count("ready")+applied+interview,rate=totalTracked?Math.round((applied+interview+count("rejected")+count("withdrawn"))/totalTracked*100):0;const card=(label,value,sub)=>'<div class="ald-insight-card"><div class="ald-insight-label">'+esc(label)+'</div><div class="ald-insight-value">'+value+'</div><div class="ald-insight-sub">'+esc(sub)+'</div></div>';box.innerHTML=card("Saved",saved,"Jobs bookmarked")+card("Applied",applied,"Student-confirmed")+card("Interview",interview,"Tracked interview stage")+'<div class="ald-insight-progress" role="progressbar" aria-label="Applications moved beyond saved stage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+rate+'"><span style="width:'+rate+'%"></span></div><div class="ald-insight-summary">'+(totalTracked?totalTracked+" tracked jobs · "+preparing+" preparing · "+rejected+" rejected · "+withdrawn+" withdrawn. Opening an employer page does not mean an application was submitted.":'Your application analytics will appear here after you save your first job.')+'</div>';}
let visibleJobLimit=30;function render(){renderTrackerInsights();renderJobFeedStats();const allList=filtered();const list=allList.slice(0,visibleJobLimit);total.textContent=allList.length.toLocaleString("en-IN")+" matching job"+(allList.length===1?"":"s");if(!list.length){const h=tab==="recommended"?"No strong skill matches yet":tab==="verified"?(verifiedExamSkills.size?"No jobs match your verified skills yet":"Verify a skill to unlock Verified Matches") :tab==="saved"?"No saved or tracked jobs yet":tab==="applied"?"No applications marked yet":"No jobs match these filters",b=tab==="recommended"?"Try Explore all jobs, or add skills and complete assessments to improve recommendations.":tab==="verified"?(verifiedExamSkills.size?"Try changing the role, location or work-mode filters. We'll show jobs when listed requirements match your verified skills.":"Pass an Aldovra skill assessment first. Your normal free job search remains available while you verify skills.") :tab==="saved"?"Save a job or open its application to track it here.":tab==="applied"?"Open a job application, then use Mark applied to keep it in this list.":"Change your search or filters. New active listings will appear here when available.";grid.innerHTML='<div class="ald-jobs-state"><strong>'+esc(h)+'</strong>'+esc(b)+'</div>';return;}grid.innerHTML=list.map((j,ix)=>{const mt=match(j),tr=tracked(j),url=j.application_url||j.source_url||"",valid=/^https?:\/\//i.test(url),desc=String(j.description||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim(),ss=(j._skills||[]).slice(0,7).map(s=>s.name).filter(Boolean);
const rm=requirementMatch(j),el=jobEligibility(j),vs=tab==="verified"?verifiedSkillNamesForJob(j):[],showScore=tab!=="all"&&tab!=="applied"&&mt.score;
const co=String(j.company_name||"Company"),ini=(co.replace(/[^A-Za-z0-9 ]/g," ").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("")||"•").toUpperCase();let hue=0;for(const ch of co)hue=(hue*31+ch.charCodeAt(0))%360;
const IC={pin:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',mode:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/></svg>',type:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',cap:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2.5 9 9.5-5 9.5 5-9.5 5Z"/><path d="M6.5 11v5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-5"/></svg>',money:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h10M7 9h10M10 5c4.5 0 4.5 8 0 8H7l7 6"/></svg>',save:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4Z"/></svg>',flag:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4.5M5 4.5h11l-2 4 2 4H5"/></svg>'};
const chip=(ic,t)=>'<span class="ald-job-chip ajc-chip">'+ic+esc(t)+'</span>';
const skillsHtml=rm.requirements.length?rm.requirements.slice(0,6).map(n=>{const ok=rm.matched.includes(n);return '<span class="ajc-skill'+(ok?' ok':'')+'">'+(ok?'✓ ':'')+esc(n)+'</span>';}).join("")+(rm.requirements.length>6?'<span class="ajc-skill more">+'+(rm.requirements.length-6)+'</span>':""):ss.slice(0,6).map(n=>'<span class="ajc-skill">'+esc(n)+'</span>').join("");
const ring=showScore?'<div class="ajc-match" title="'+esc(mt.inferredOnly?"Estimated match from your profile":"Skill match with your profile")+'"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="t" cx="20" cy="20" r="16"/><circle class="v" cx="20" cy="20" r="16" pathLength="100" style="stroke-dasharray:'+Math.max(0,Math.min(100,mt.score))+' 100"/></svg><b>'+mt.score+'%</b><small>'+(mt.inferredOnly?'est. match':'match')+'</small></div>':'';
return '<article class="ald-job-card ajc" style="--h:'+hue+';--i:'+Math.min(ix,14)+'">'
+'<div class="ald-job-top ajc-top"><div class="ajc-logo" aria-hidden="true">'+esc(ini)+'</div><div class="ajc-head"><div class="ald-job-company">'+esc(co)+(isNewJob(j)?'<span class="ald-job-new">New</span>':'')+'</div><h3 class="ald-job-title">'+esc(j.title)+'</h3></div>'+ring+'</div>'
+'<div class="ald-job-meta ajc-meta">'+(j.location?chip(IC.pin,j.location):"")+(j.work_mode?chip(IC.mode,j.work_mode):"")+(j.employment_type?chip(IC.type,j.employment_type):"")+(()=>{const lv=(j.experience_level&&norm(j.experience_level)!=="fresher")?prettyLevel(j.experience_level):el.level;return lv&&norm(lv)!==norm(j.employment_type||"")?chip(IC.cap,lv):"";})()+(j.salary_text?chip(IC.money,j.salary_text):"")+(locationPriorityLabel(j)?'<span class="ald-job-chip ajc-chip ajc-prio">'+esc(locationPriorityLabel(j))+'</span>':"")+'</div>'
+(skillsHtml?'<div class="ajc-skills">'+skillsHtml+'</div>':"")
+(vs.length?'<div class="ald-vj-job-reason"><strong>Why this is a verified match</strong><span>Your passed assessment covers: '+esc(vs.join(", "))+'. Review the remaining job requirements before applying.</span></div>':"")
+'<details class="ajc-more"><summary><span>Details &amp; eligibility</span><i aria-hidden="true"></i></summary><div class="ajc-more-body">'
+(desc?'<p class="ald-job-description">'+esc(desc.slice(0,420))+(desc.length>420?"…":"")+'</p>':"")
+(rm.requirements.length?'<div class="ald-job-skills"><b>Your profile:</b> '+(rm.matched.length?rm.matched.map(esc).join(", "):"No direct match in saved skills yet")+'</div>':"")
+'<div class="ald-job-skills"><b>Eligibility:</b> '+esc(el.eligibility)+(el.requiredTerms?' · Required qualifications mentioned':"")+(el.preferredTerms?' · Preferred skills mentioned':"")+'</div>'
+(ss.length&&rm.requirements.length?'<div class="ald-job-skills"><b>Skills:</b> '+ss.map(esc).join(" · ")+'</div>':"")
+(mt.missing.length&&tab==="recommended"?'<div class="ald-job-skills"><b>Skill gaps:</b> '+mt.missing.slice(0,4).map(s=>esc(s.name||"required skill")).join(", ")+' — not found in your resume, saved skills, or passed exams. Add evidence to your profile or pass the related verification exam to improve your match.</div>':"")
+'<div class="ajc-foot-note">'+((["remoteok","himalayas"].includes(norm(j.source_provider))&&/^https?:\/\//i.test(String(j.source_url||"")))?'<a href="'+esc(j.source_url)+'" target="_blank" rel="noopener noreferrer">Source: '+esc(sourceLabel(j).label)+' ↗</a> · ':"")+'Application opens on the employer site — verify details there.</div>'
+'</div></details>'
+'<div class="ald-job-actions ajc-actions">'
+'<button type="button" class="ald-job-btn ajc-save'+(tr?' is-saved':'')+'" data-ald-save="'+esc(j.id)+'" '+(tr?'disabled aria-disabled="true"':'')+'>'+IC.save+'<span>'+(tr?"Tracked":"Save")+'</span></button>'
+(valid?'<button type="button" class="ald-job-btn ald-job-btn-primary ajc-apply" data-ald-apply="'+esc(j.id)+'">Apply now <span class="ajc-arr" aria-hidden="true">↗</span></button>':'<button type="button" class="ald-job-btn" disabled>Link unavailable</button>')
+(tr&&tr.status==="ready"?'<button type="button" class="ald-job-btn" data-ald-mark-applied="'+esc(tr.id)+'">Mark applied ✓</button>':"")
+(tr?'<span class="ald-job-chip ajc-status">'+esc(tr.status)+'</span>':"")
+'<span class="ajc-spacer"></span><span class="ald-job-age ajc-age">'+esc(jobAgeLabel(j.created_at))+'</span>'
+'<button type="button" class="ald-job-btn ajc-icon" data-ald-report-job="'+esc(j.id)+'" title="Report issue" aria-label="Report an issue with this job">'+IC.flag+'</button>'
+'</div></article>';
}).join("")+(allList.length>list.length?'<div class="ald-jobs-load-more-wrap"><button type="button" class="ald-job-btn ald-job-btn-primary" data-ald-load-more>Load more jobs (' +(allList.length-list.length).toLocaleString("en-IN")+" remaining)</button></div>":"");}
let initialJobLoadPromise=null;
let backgroundJobLoadPromise=null;
let jobLoadGeneration=0;
const JOBS_INITIAL_PAGE_SIZE=300;
const JOBS_BACKGROUND_PAGE_SIZE=1000;
async function load(forceReload=false){
  if(initialJobLoadPromise){
    if(!forceReload)return initialJobLoadPromise;
    try{await initialJobLoadPromise;}catch{}
  }
  if(forceReload&&backgroundJobLoadPromise){
    try{await backgroundJobLoadPromise;}catch{}
  }
  const generation=++jobLoadGeneration;
  initialJobLoadPromise=(async()=>{
    const columns="id,title,company_name,location,work_mode,employment_type,description,experience_level,salary_text,application_url,active,created_at,source_provider,source_url,source_last_seen_at";
    const firstPagePromise=db.from("student_active_opportunities").select(columns).order("created_at",{ascending:false}).order("id",{ascending:false}).range(0,JOBS_INITIAL_PAGE_SIZE-1);
    const authPromise=db.auth.getUser();
    const firstPageResult=await firstPagePromise;
    if(firstPageResult.error)throw firstPageResult.error;
    if(generation!==jobLoadGeneration)return;
    const firstPage=(firstPageResult.data||[]).filter(j=>!String(j.application_url||"").includes("example.com/test-job"));
    jobs=firstPage.sort((a,b)=>(Number(isIndiaEligibleJob(b))-Number(isIndiaEligibleJob(a)))||locationPriority(b)-locationPriority(a)||new Date(b.created_at)-new Date(a.created_at));
    lastFeedRefreshAt=new Date();
    render();
    total.textContent=jobs.length.toLocaleString("en-IN")+" jobs loaded · fetching more in background…";
    const auth=await authPromise;
    user=auth?.data?.user||window.currentUser||null;
    const profilePromise=(async()=>{
      if(!user)return;
      const [sr,pr,tr,ar,rr]=await Promise.all([
        db.from("student_skills").select("skill_id,status,skills(name)").eq("user_id",user.id),
        db.from("career_preferences").select("target_roles,preferred_locations,preferred_work_modes,employment_types,experience_level").eq("user_id",user.id).maybeSingle(),
        db.from("job_application_tracker").select("id,user_id,opportunity_id,job_title,company_name,application_url,status,applied_at,created_at").eq("user_id",user.id).order("updated_at",{ascending:false}).limit(500),
        db.from("assessment_attempts").select("skill_name,passed,percentage,submitted_at,assessment_id,assessments(title,skill_id,skills(name))").eq("user_id",user.id).eq("passed",true).order("submitted_at",{ascending:false}).limit(100),
        db.from("student_resumes").select("parsed_data,status,uploaded_at").eq("user_id",user.id).order("uploaded_at",{ascending:false}).limit(1)
      ]);
      (sr.data||[]).forEach(s=>{skills.add(String(s.skill_id));if(s.skills?.name)skillNames.add(norm(s.skills.name));});
      if(ar.error)console.warn("Verified assessment evidence could not be loaded",ar.error);
      (ar.data||[]).forEach(a=>{
        const assessment=Array.isArray(a.assessments)?a.assessments[0]:(a.assessments||{});
        const relatedSkill=Array.isArray(assessment.skills)?assessment.skills[0]:(assessment.skills||{});
        const rawName=relatedSkill.name||assessment.title||a.skill_name||"";
        const skillName=String(rawName).replace(/\s+(?:Fundamentals\s+)?Assessment$/i,"").trim();
        if(skillName&&!/^aldovra skill assessment$/i.test(skillName))verifiedExamSkills.add(norm(skillName));
      });
      window.__aldovraVerifiedSkillNames=[...verifiedExamSkills];
      preferences=pr.data||{};
      const resume=(rr.data||[]).find(r=>r.parsed_data&&r.status!=="deleted");
      if(resume){const raw=typeof resume.parsed_data==="string"?resume.parsed_data:JSON.stringify(resume.parsed_data);raw.toLowerCase().split(/[^a-z0-9+#.]+/).filter(w=>w.length>2).forEach(w=>resumeTerms.add(w));}
      tracker=tr.data||[];
      window.__aldovraJobPreferences=preferences;
      render();
    })();
    const enrichJobs=async rows=>{
      const batches=[];
      for(let i=0;i<rows.length;i+=200)batches.push(rows.slice(i,i+200).map(j=>j.id));
      const results=await Promise.all(batches.map(ids=>db.from("opportunity_skills").select("opportunity_id,skill_id,required,importance,skills(name)").in("opportunity_id",ids)));
      const map=new Map();
      results.forEach(result=>{
        if(result.error){console.warn("Some job skill links could not load",result.error);return;}
        (result.data||[]).forEach(row=>{
          const key=String(row.opportunity_id),list=map.get(key)||[];
          list.push({skill_id:row.skill_id,required:row.importance?row.importance==="required":row.required!==false,name:row.skills?.name||""});
          map.set(key,list);
        });
      });
      rows.forEach(j=>j._skills=map.get(String(j.id))||[]);
      if(generation===jobLoadGeneration)render();
    };
    await Promise.all([profilePromise,enrichJobs(jobs)]);
    loc.innerHTML=cityOptionsHtml(jobs);
    render();
    backgroundJobLoadPromise=(async()=>{
      let offset=JOBS_INITIAL_PAGE_SIZE;
      while(generation===jobLoadGeneration){
        const result=await db.from("student_active_opportunities").select(columns).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+JOBS_BACKGROUND_PAGE_SIZE-1);
        if(result.error)throw result.error;
        const page=(result.data||[]).filter(j=>!String(j.application_url||"").includes("example.com/test-job"));
        if(!page.length)break;
        const existing=new Set(jobs.map(j=>String(j.id)));
        const fresh=page.filter(j=>!existing.has(String(j.id)));
        if(fresh.length){
          jobs.push(...fresh);
          jobs.sort((a,b)=>(Number(isIndiaEligibleJob(b))-Number(isIndiaEligibleJob(a)))||locationPriority(b)-locationPriority(a)||new Date(b.created_at)-new Date(a.created_at));
          render();
          enrichJobs(fresh).catch(err=>console.warn("Background job skills could not load",err));
        }
        offset+=JOBS_BACKGROUND_PAGE_SIZE;
        if((result.data||[]).length<JOBS_BACKGROUND_PAGE_SIZE)break;
      }
      if(generation===jobLoadGeneration){
        total.textContent=jobs.length.toLocaleString("en-IN")+" active jobs";
        loc.innerHTML=cityOptionsHtml(jobs);
        render();
      }
    })().catch(error=>console.error("Aldovra background jobs loading error",error)).finally(()=>{if(generation===jobLoadGeneration)backgroundJobLoadPromise=null;});
  })().catch(e=>{
    console.error("Aldovra jobs load error",e);
    grid.innerHTML='<div class="ald-jobs-state"><strong>Jobs could not be loaded right now</strong>Refresh the dashboard. If this continues, check opportunities table permissions and the Supabase connection.</div>';
    total.textContent="Unable to load";
  }).finally(()=>{initialJobLoadPromise=null;});
  return initialJobLoadPromise;
}
let refreshCooldownUntil=0,refreshCooldownTimer=null;
function updateRefreshButton(button){if(!button)return;const remaining=Math.max(0,Math.ceil((refreshCooldownUntil-Date.now())/1000));if(remaining>0){button.disabled=true;button.textContent="Refresh in "+Math.ceil(remaining/60)+"m "+String(remaining%60).padStart(2,"0")+"s";}else{button.disabled=false;button.textContent="Refresh jobs ↻";if(refreshCooldownTimer){clearInterval(refreshCooldownTimer);refreshCooldownTimer=null;}}}
function startRefreshCooldown(seconds=300){refreshCooldownUntil=Date.now()+Math.max(1,seconds)*1000;const button=root.querySelector("[data-ald-refresh-jobs]");updateRefreshButton(button);if(refreshCooldownTimer)clearInterval(refreshCooldownTimer);refreshCooldownTimer=setInterval(()=>updateRefreshButton(button),1000);}
root.addEventListener("click",async e=>{const more=e.target.closest("[data-ald-load-more]");if(more){visibleJobLimit+=30;render();return;}const aiRefresh=e.target.closest("[data-ald-ai-refresh-jobs]");if(aiRefresh){if(!user){alert("Please sign in to load the latest curated fresher jobs.");return;}if(aiRefresh.disabled)return;aiRefresh.disabled=true;aiRefresh.textContent="Loading daily jobs…";try{await load(true);aiRefresh.textContent="Daily jobs loaded ✓";setTimeout(()=>{aiRefresh.textContent="Daily curated jobs ✨";},1800);}catch(err){console.error("Aldovra curated daily jobs refresh failed",err);alert("Could not reload the latest daily jobs. Your existing listings are unchanged.");aiRefresh.textContent="Daily curated jobs ✨";}finally{aiRefresh.disabled=false;}return;}const refresh=e.target.closest("[data-ald-refresh-jobs]");if(refresh){if(!user){alert("Please sign in to refresh job recommendations.");return;}if(refresh.disabled||Date.now()<refreshCooldownUntil)return;refresh.disabled=true;refresh.textContent="Refreshing…";let completed=false;try{const sessionResult=await db.auth.getSession(),token=sessionResult?.data?.session?.access_token;if(!token)throw new Error("Your session has expired. Please sign in again.");const result=await db.functions.invoke("student-job-discovery",{body:{}});if(result.error){let status=result.error.context?.status||0,details=null;try{details=await result.error.context?.clone?.().json();}catch{}if(status===429){const wait=Number(details?.retry_after_seconds||300);startRefreshCooldown(wait);throw new Error("Job refresh is on cooldown. Please wait "+Math.ceil(wait/60)+" minute(s) before trying again.");}if(status===401){throw new Error("Your session has expired. Please sign in again.");}if(status===503){throw new Error(details?.error||"Job discovery is temporarily unavailable. Please try again later.");}throw new Error(details?.error||"Job refresh failed (HTTP "+(status||"unknown")+"). Your current job list is unchanged.");}const payload=result.data||{};if(payload.error){if(Number(payload.retry_after_seconds)>0){startRefreshCooldown(Number(payload.retry_after_seconds));}throw new Error(payload.error+(payload.retry_after_seconds?" Try again in "+Math.ceil(payload.retry_after_seconds/60)+" minute(s).":""));}await load(true);completed=true;startRefreshCooldown(300);const importedCount=Number(payload.imported||0);const sourceErrors=Array.isArray(payload.errors)?payload.errors.filter(Boolean):[];if(payload.success===false||sourceErrors.length){const details=sourceErrors.slice(0,4).join("\n");alert("Job refresh partially completed. Imported "+importedCount+" new or updated jobs. Some sources could not be refreshed."+(details?"\n\nDetails:\n"+details:""));}else{alert("Job refresh complete. Imported "+importedCount+" new or updated jobs.");}}catch(err){console.error("Aldovra job refresh failed",err);alert(err?.message||"Job refresh failed. Your current job list is unchanged.");}finally{if(!completed&&Date.now()>=refreshCooldownUntil){refresh.disabled=false;refresh.textContent="Refresh jobs ↻";}else{updateRefreshButton(refresh);}}return;}const tb=e.target.closest("[data-ald-job-tab]");if(tb){tab=tb.dataset.aldJobTab;root.querySelectorAll("[data-ald-job-tab]").forEach(b=>b.setAttribute("aria-pressed",String(b===tb)));render();return;}const report=e.target.closest("[data-ald-report-job]");
if(report){
  if(!user){alert("Please sign in to report a job application issue.");return;}
  const reportJob=jobs.find(job=>String(job.id)===String(report.dataset.aldReportJob));
  if(!reportJob)return;
  const dialog=document.getElementById("aldJobIssueModal");
  const form=document.getElementById("aldJobIssueForm");
  form.dataset.jobId=String(reportJob.id);
  document.getElementById("aldJobIssueJobName").textContent=(reportJob.company_name||"Company")+" · "+(reportJob.title||"Job listing");
  document.getElementById("aldJobIssueStatus").textContent="";
  document.getElementById("aldJobIssueDetails").value="";
  document.getElementById("aldMissingCollegeName").value="";
  document.getElementById("aldMissingCollegeGroup").hidden=true;
  form.querySelectorAll('input[name="aldIssueType"]').forEach(input=>{input.checked=false;input.disabled=false;});
  document.getElementById("aldJobIssueDetails").disabled=false;
  const sendButton=document.getElementById("aldJobIssueSubmit");
  sendButton.disabled=false;sendButton.textContent="Send report";
  dialog.hidden=false;
  form.querySelector('input[name="aldIssueType"]')?.focus();
  return;
}
const mb=e.target.closest("[data-ald-mark-applied]"),sb=e.target.closest("[data-ald-save]"),ab=e.target.closest("[data-ald-apply]");if(!sb&&!ab&&!mb)return;if(!user){alert("Please sign in to save jobs and track applications.");return;}if(mb){const row=tracker.find(x=>String(x.id)===String(mb.dataset.aldMarkApplied));if(!row)return;if(row.status==="applied")return;mb.disabled=true;const updated=await db.from("job_application_tracker").update({status:"applied",applied_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id).eq("user_id",user.id).select().single();if(updated.error){mb.disabled=false;console.error(updated.error);alert("Could not update application status. Please try again.");return;}tracker=tracker.map(x=>String(x.id)===String(row.id)?updated.data:x);render();return;}const id=(sb||ab).dataset.aldSave||(sb||ab).dataset.aldApply,j=jobs.find(x=>String(x.id)===String(id));if(!j)return;const old=tracker.find(x=>String(x.opportunity_id||"")===String(j.id));if(sb){if(old){alert("This job is already tracked ("+old.status+").");return;}sb.disabled=true;const r=await db.from("job_application_tracker").insert({user_id:user.id,opportunity_id:j.id,job_title:j.title,company_name:j.company_name||"Company",application_url:j.application_url||j.source_url||null,status:"saved"}).select().single();sb.disabled=false;if(r.error){console.error(r.error);alert("Could not save this job. Check job tracker permissions.");return;}tracker.unshift(r.data);render();return;}const url=j.application_url||j.source_url||"";if(!/^https?:\/\//i.test(url)){alert("No valid application link is available for this listing yet.");return;}const applicationWindow=window.open(url,"_blank");if(!applicationWindow){alert("Your browser blocked the application tab. Allow pop-ups for Aldovra and try again; your application tracker was not changed.");return;}try{applicationWindow.opener=null;}catch{}if(old){if(old.status==="saved"){const upd=await db.from("job_application_tracker").update({status:"ready",application_url:url,updated_at:new Date().toISOString()}).eq("id",old.id).eq("user_id",user.id).select().single();if(upd.error){console.error("Could not update tracker",upd.error);alert("The employer application opened, but Aldovra could not update your tracking status. Please retry from Saved & tracked.");}else tracker=tracker.map(x=>x.id===old.id?upd.data:x);}}else{const ins=await db.from("job_application_tracker").insert({user_id:user.id,opportunity_id:j.id,job_title:j.title,company_name:j.company_name||"Company",application_url:url,status:"ready"}).select().single();if(ins.error){console.error("Could not create tracker row",ins.error);alert("The employer application opened, but Aldovra could not save this application to your tracker.");}else tracker.unshift(ins.data);}render();});

const issueDialog=document.getElementById("aldJobIssueModal");
const issueForm=document.getElementById("aldJobIssueForm");
const issueStatus=document.getElementById("aldJobIssueStatus");
const missingCollegeGroup=document.getElementById("aldMissingCollegeGroup");
issueForm?.querySelectorAll('input[name="aldIssueType"]').forEach(input=>input.addEventListener("change",()=>{
  missingCollegeGroup.hidden=input.value!=="application-form-blocked" || !input.checked;
}));

issueDialog?.addEventListener("click",event=>{if(event.target===issueDialog||event.target.closest("[data-close-issue]"))issueDialog.hidden=true;});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&issueDialog&&!issueDialog.hidden)issueDialog.hidden=true;});
issueForm?.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!user){issueStatus.textContent="Please sign in before submitting a report.";return;}
  const checked=issueForm.querySelector('input[name="aldIssueType"]:checked');
  if(!checked){issueStatus.textContent="Choose the issue type first.";return;}
  const submit=document.getElementById("aldJobIssueSubmit");
  submit.disabled=true;issueStatus.textContent="Sending report…";
  const result=await db.from("job_application_issue_reports").insert({
    user_id:user.id,
    opportunity_id:issueForm.dataset.jobId,
    issue_type:checked.value,
    details:[
      document.getElementById("aldMissingCollegeName").value.trim()
        ? "College/university reported missing from employer form: "+document.getElementById("aldMissingCollegeName").value.trim()
        : "",
      document.getElementById("aldJobIssueDetails").value.trim()
    ].filter(Boolean).join("\n\n")||null
  });
  submit.disabled=false;
  if(result.error){
    if(result.error.code==="23505"){issueStatus.textContent="You already reported this issue for this job. Thanks for helping keep listings accurate.";return;}
    console.error("Job issue report failed",result.error);
    issueStatus.textContent="We couldn't submit this report. Please try again.";
    return;
  }
  issueStatus.textContent="Report received. Aldovra will review this listing; thank you.";
  issueForm.querySelectorAll('input[name="aldIssueType"]').forEach(input=>input.disabled=true);
  document.getElementById("aldJobIssueDetails").disabled=true;
  submit.disabled=true;
});

[search,loc,mode,type,level,posted].filter(Boolean).forEach(el=>el.addEventListener("input",()=>{visibleJobLimit=30;render();}));let initialLoadRetryCount=0;let initialLoadWatchdog=null;const startInitialJobLoad=()=>{if(initialLoadWatchdog)clearInterval(initialLoadWatchdog);const begin=()=>{load();initialLoadWatchdog=setInterval(()=>{const stillLoading=grid&&/Finding opportunities|Loading active jobs|Loading jobs/i.test(grid.textContent||"");if(stillLoading&&document.visibilityState==="visible"&&initialLoadRetryCount<3){initialLoadRetryCount++;console.warn("Aldovra initial jobs feed still loading; automatic retry "+initialLoadRetryCount+"/3.");load();}else if(!stillLoading&&initialLoadWatchdog){clearInterval(initialLoadWatchdog);initialLoadWatchdog=null;}},12000);};if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",begin,{once:true});}else{begin();}};startInitialJobLoad();setInterval(()=>{if(document.visibilityState==="visible")load();},5*60*60*1000);
})();
