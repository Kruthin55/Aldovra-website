import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://aldovra.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const cleanText = (value: unknown, max = 8000) =>
  String(value ?? "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim().slice(0, max);
const validHttpUrl = (value: unknown) => {
  try { const u = new URL(String(value ?? "")); return ["https:", "http:"].includes(u.protocol) ? u.href : null; }
  catch { return null; }
};
const workMode = (value: unknown, text: string) => {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("remote") || /\bremote\b/i.test(text)) return "Remote";
  if (v.includes("hybrid") || /\bhybrid\b/i.test(text)) return "Hybrid";
  if (v.includes("on.?site") || /\bon.?site\b/i.test(text)) return "On-site";
  return null;
};
const employment = (value: unknown, title: string, description: string) => {
  const v = String(value ?? "").toLowerCase().replace(/[_-]+/g, " ");
  const t = String(title ?? "").toLowerCase();
  const d = String(description ?? "").replace(/<[^>]*>/g, " ").toLowerCase();
  // Prefer the employer's structured employment type. Never infer Internship
  // from incidental mentions in a long description or boilerplate.
  if (/intern(ship)?/.test(v)) return "Internship";
  if (/contract|temporary|fixed term/.test(v)) return "Contract";
  if (/part\s*time/.test(v)) return "Part-time";
  if (/full\s*time|permanent/.test(v)) return "Full-time";
  if (/\b(intern(ship)?|apprentice(ship)?)\b/.test(t)) return "Internship";
  if (/\b(contract|contractor|temporary|fixed[- ]term)\b/.test(t)) return "Contract";
  if (/\bpart[- ]time\b/.test(t)) return "Part-time";
  if (/\bfull[- ]time\b/.test(t)) return "Full-time";
  // Use description-only signals only when they explicitly describe the role type.
  if (/\b(internship|apprenticeship) (position|opportunity|programme|program)\b/.test(d)) return "Internship";
  return null;
};
function normalize(source: any, row: any) {
  if (source.provider === "official_careers") {
    const title = cleanText(row.title || row.name, 240);
    const desc = cleanText(row.description || row.descriptionPlain || row.descriptionHtml);
    const location = cleanText(row.location || row.locationsText, 240);
    return {
      externalId: String(row.id || row.externalId || row.url || row.applyUrl || ""),
      title, company: source.company_name, location: location || null, description: desc,
      url: validHttpUrl(row.applyUrl || row.url),
      mode: workMode(row.workMode || row.workplaceType, desc + " " + location),
      employment: employment(row.employmentType || row.typeOfEmployment, title, desc),
      experience: isFresherEligibleJob({ title: title, description: desc }) ? "fresher" : null,
    };
  }
  if (source.provider === "smartrecruiters") {
    const rawSections = row.jobAd?.sections;
    const sections = Array.isArray(rawSections)
      ? rawSections.map((section: any) => section?.text || section?.content || section?.body || "").join(" ")
      : rawSections && typeof rawSections === "object"
        ? Object.values(rawSections).map((section: any) => section?.text || section?.content || section?.body || "").join(" ")
        : "";
    const location = row.location || {};
    const countryRaw = String(location.country || "");
    const country = /^(in|india)$/i.test(countryRaw) || String(location.countryCode || "").toLowerCase() === "in" ? "India" : countryRaw;
    const locationText = [location.city, location.region, country].filter(Boolean).join(", ");
    const title = cleanText(row.name || row.title, 240);
    const desc = cleanText(row.jobAd?.jobDescription || row.jobDescription || sections || row.description);
    return {
      externalId: String(row.id || row.uuid || ""), title, company: source.company_name,
      location: cleanText(locationText, 240) || null, description: desc,
      url: validHttpUrl(row.applyUrl || row.postingUrl || row.jobAd?.applyUrl),
      mode: workMode(location.remote ? "remote" : null, desc + " " + locationText),
      employment: employment(row.typeOfEmployment?.label, title, desc),
      experience: isFresherEligibleJob({ title: title, description: desc }) ? "fresher" : null,
    };
  }
  if (source.provider === "jobicy") {
    const title = cleanText(row.jobTitle || row.title, 240);
    const desc = cleanText(row.jobDescription || row.description || row.jobExcerpt);
    const location = cleanText(row.jobGeo || row.location || "Remote — India", 240);
    return {
      externalId: String(row.id || row.jobSlug || row.url || ""),
      title, company: cleanText(row.companyName || source.company_name, 200),
      location: location || "Remote — India", description: desc,
      url: validHttpUrl(row.url || row.applyUrl || row.jobUrl),
      mode: workMode(row.jobType || "remote", desc + " " + location),
      employment: employment(row.jobType || row.jobLevel, title, desc),
      experience: isFresherEligibleJob({ title, description: desc }) ? "fresher" : null,
    };
  }
  if (source.provider === "himalayas") {
    const title = cleanText(row.title || row.position, 240);
    const seniority = cleanText(row.seniority || row.level || row.experienceLevel || "", 120);
    const desc = cleanText([row.description || row.excerpt || "", seniority ? "Seniority: " + seniority : ""].filter(Boolean).join(" "));
    const restrictions = Array.isArray(row.locationRestrictions) ? row.locationRestrictions.map((x: any) => cleanText(x, 100)).filter(Boolean) : [];
    const allowsIndia = restrictions.some((x: string) => /^(india|in)$/i.test(x));
    const location = restrictions.length
      ? (allowsIndia ? "Remote — India" : "Remote — " + restrictions.join(", "))
      : "Remote — Worldwide";
    return {
      externalId: String(row.guid || row.id || row.slug || row.applicationLink || ""),
      title,
      company: cleanText(row.companyName || row.company || source.company_name, 200),
      location,
      description: desc,
      url: validHttpUrl(row.applicationLink),
      mode: "Remote",
      employment: employment(row.employmentType || row.type, title, desc),
      experience: isFresherEligibleJob({ title: title + " " + seniority, description: desc }) ? "fresher" : null,
    };
  }
  if (source.provider === "remoteok") {
    const title = cleanText(row.position || row.title, 240);
    const desc = cleanText(row.description || row.excerpt);
    const location = cleanText(row.location || "", 240) || "Remote";
    return {
      externalId: String(row.id || row.slug || row.url || ""),
      title,
      company: cleanText(row.company || row.company_name || source.company_name, 200),
      location,
      description: desc,
      url: validHttpUrl(row.url || row.apply_url),
      mode: "Remote",
      employment: employment(row.job_type || row.type, title, desc),
      experience: isFresherEligibleJob({ title, description: desc }) ? "fresher" : null,
    };
  }
  if (source.provider === "ashby") {
    const desc = cleanText(row.descriptionPlain || row.descriptionHtml || row.description);
    const title = cleanText(row.title, 240);
    const location = cleanText(row.location, 240) || (Array.isArray(row.secondaryLocations) ? row.secondaryLocations.map((x: any) => cleanText(x.location, 120)).filter(Boolean).join(", ") : "");
    return {
      externalId: String(row.id || row.jobUrl || row.applyUrl || ""),
      title, company: source.company_name, location: location || null, description: desc,
      url: validHttpUrl(row.applyUrl || row.jobUrl), mode: workMode(null, desc + " " + String(row.location || "")),
      employment: employment(row.employmentType, title, desc),
      experience: isFresherEligibleJob({ title: title, description: desc }) ? "fresher" : null,
    };
  }
  if (source.provider === "greenhouse") {
    const desc = cleanText(row.content);
    return {
      externalId: String(row.id ?? ""), title: cleanText(row.title, 240), company: source.company_name,
      location: cleanText(row.location?.name, 240) || null, description: desc,
      url: validHttpUrl(row.absolute_url), mode: workMode(null, desc),
      employment: employment(null, row.title, desc),
      experience: isFresherEligibleJob({ title: String(row.title ?? ""), description: desc }) ? "fresher" : null,
    };
  }
  const desc = cleanText(row.descriptionPlain || row.description);
  const title = cleanText(row.text, 240);
  return {
    externalId: String(row.id ?? ""), title, company: source.company_name,
    location: cleanText(row.categories?.location, 240) || null, description: desc,
    url: validHttpUrl(row.hostedUrl), mode: workMode(row.workplaceType, desc),
    employment: employment(row.categories?.commitment, title, desc),
      experience: isFresherEligibleJob({ title: title, description: desc }) ? "fresher" : null,
  };
}
function hasSkill(text: string, skill: string) {
  const escaped = skill.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z0-9+#.])" + escaped + "($|[^a-z0-9+#.])", "i").test(text);
}

function isFresherEligibleJob(job: { title?: string | null; description?: string | null }) {
  const title = String(job.title ?? "").replace(/<[^>]*>/g, " ");
  const description = String(job.description ?? "").replace(/<[^>]*>/g, " ");
  const text = (title + " " + description).replace(/\s+/g, " ").trim();
  // Reject positive experience requirements regardless of phrasing or title.
  const positiveRange = /\b([1-9]\d*)\s*(?:-|–|to)\s*([1-9]\d*)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const positivePlus = /\b[1-9]\d*\s*\+\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const positiveYears = /\b(?:minimum|min\.?|at least|over|more than|must have|required minimum of)\s*(?:of\s*)?[1-9]\d*\s*(?:\+\s*)?(?:years?|yrs?)\b/i;
  const yearsExperience = /\b[1-9]\d*\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const seniorTitle = /\b(senior|staff|principal|lead|team leader|team lead|manager|director|head|chief|vice president|architect|mid[- ]level|engineer iii|engineer iv|engineer v|level 3|level 4|level 5)\b/i;
  if (positiveRange.test(text) || positivePlus.test(text) || positiveYears.test(text) || yearsExperience.test(text) || seniorTitle.test(title)) return false;
  const titleSignal = /\b(fresher|freshers|intern|internship|graduate trainee|management trainee|trainee|new grad(?:uate)?|entry[- ]level|associate(?: engineer| developer| analyst)?|campus hire|campus hiring|graduate program|graduate programme|apprentice|apprenticeship)\b/i.test(title);
  const noExperienceSignal = /\b(no experience required|no prior experience required|without prior experience|0 years? of experience|zero years? of experience|fresh graduates? (?:are )?welcome|suitable for freshers|open to freshers|recent graduates? encouraged|campus recruitment|early career program|early careers program)\b/i.test(text);
  const declaredSenioritySignal = /\bseniority:\s*(?:entry[- ]level|junior|intern(?:ship)?|graduate|early career|new grad)\b/i.test(description);
  return titleSignal || noExperienceSignal || declaredSenioritySignal;
}
function isHimalayasIndiaEligible(row: any) {
  const restrictions = Array.isArray(row?.locationRestrictions)
    ? row.locationRestrictions.map((value: any) => cleanText(value, 100)).filter(Boolean)
    : [];
  if (!restrictions.length) return true; // No restriction means worldwide eligibility in this API.
  return restrictions.some((value: string) => /^(india|in|worldwide|anywhere|anywhere in the world)$/i.test(value));
}
function isIndiaEligibleJob(job: { location?: string | null; description?: string | null; mode?: string | null }) {
  const location = String(job.location ?? "");
  const description = String(job.description ?? "").replace(/<[^>]*>/g, " ");
  const combined = location + " " + description + " " + String(job.mode ?? "");
  const indiaLocation = /\b(india|hyderabad|secunderabad|telangana|bengaluru|bangalore|karnataka|chennai|tamil nadu|pune|maharashtra|nellore|andhra pradesh|visakhapatnam|vizag|vijayawada|tirupati|guntur|kurnool|mumbai|gurugram|gurgaon|noida|new delhi|delhi ncr|kolkata|west bengal|ahmedabad|gujarat|kochi|kerala|coimbatore|jaipur|rajasthan|indore|bhopal|lucknow|chandigarh|mohali|bhubaneswar|odisha|mysuru|mysore|mangaluru|mangalore|thiruvananthapuram|madurai|trichy|nagpur|vadodara|surat|dehradun|ranchi|patna|guwahati)\b/i;
  if (indiaLocation.test(location)) return true;
  const trimmedLocation = location.trim();
  const genericRemoteLocation = /^(remote|distributed|work from anywhere|anywhere|worldwide)$/i.test(trimmedLocation);
  const worldwideLocation = /\b(worldwide|anywhere in the world|global remote)\b/i.test(trimmedLocation);
  // A role pinned to a non-India city/country is not India-eligible merely because
  // its description contains the word "remote". Only unpinned/global remote roles pass.
  if (trimmedLocation && !genericRemoteLocation && !worldwideLocation) return false;
  const remote = /\b(remote|distributed|work from anywhere|anywhere|worldwide)\b/i.test(combined);
  const indiaAllowed = /\b(remote(?:\s*[-:]?\s*(?:from|within|in)?\s*)?india|india remote|anywhere in india|indian residents|based in india|within india|india only|india timezone|india time zone|work from india|located in india|india[- ]based|worldwide|anywhere in the world|work from anywhere)\b/i.test(combined);
  const excludesIndia = /\b(except india|not available in india|excluding india|outside india only)\b/i.test(combined);
  return remote && indiaAllowed && !excludesIndia;
}

type OfficialCareerConfig = { company: string; hosts: string[]; listingUrls: string[]; sitemapUrls?: string[] };
const OFFICIAL_CAREER_BOARDS: Record<string, OfficialCareerConfig> = {
  infosys: {
    company:"Infosys", hosts:["career.infosys.com"],
    listingUrls:[
      "https://career.infosys.com/jobs?companyhiringtype=IL&countrycode=IN&searchJob=INFOSYS",
      "https://career.infosys.com/joblist",
    ],
    sitemapUrls:["https://career.infosys.com/sitemap.xml"],
  },
  capgemini: {
    company:"Capgemini", hosts:["careers.capgemini.com","jobs.capgemini.com"],
    listingUrls:["https://careers.capgemini.com/search/?q=&locationsearch=India&searchResultView=LIST","https://careers.capgemini.com/job","https://jobs.capgemini.com/viewalljobs/","https://jobs.capgemini.com/in-en?locale=en_US"],
    sitemapUrls:["https://careers.capgemini.com/sitemap.xml","https://careers.capgemini.com/sitemap_index.xml"],
  },
  cognizant: {
    company:"Cognizant", hosts:["careers.cognizant.com"],
    listingUrls:[
      "https://careers.cognizant.com/india-en/jobs/?ccode=IN&cname=India&page=1&pagesize=50",
      "https://careers.cognizant.com/india-en/jobs/?ccode=IN&cname=India&page=2&pagesize=50",
      "https://careers.cognizant.com/india-en/jobs/?ccode=IN&cname=India&page=3&pagesize=50",
    ],
    sitemapUrls:[],
  },
  hcltech: {
    company:"HCLTech", hosts:["careers.hcltech.com"],
    listingUrls:[
      "https://careers.hcltech.com/search/?q=&locationsearch=India&searchResultView=LIST",
      "https://careers.hcltech.com/go/India/9553955/?_wrapper_format=html&page=0",
      "https://careers.hcltech.com/job/",
    ],
    sitemapUrls:["https://careers.hcltech.com/sitemap.xml"],
  },
  techmahindra: {
    company:"Tech Mahindra", hosts:["careers.techmahindra.com"],
    listingUrls:[
      "https://careers.techmahindra.com/",
      "https://careers.techmahindra.com/CurrentOpportunity.aspx",
      "https://careers.techmahindra.com/CurrentOpportunity.aspx?page=2",
    ],
    sitemapUrls:["https://careers.techmahindra.com/sitemap.xml"],
  },
  wipro: {
    company:"Wipro", hosts:["careers.wipro.com"],
    listingUrls:[
      "https://careers.wipro.com/search/?q=&locationsearch=India&searchResultView=LIST",
      "https://careers.wipro.com/viewalljobs/?locale=en_IN",
      "https://careers.wipro.com/viewalljobs/?locale=en_IN&page=2",
    ],
    sitemapUrls:["https://careers.wipro.com/sitemap.xml"],
  },
};
function safeDecodeHtml(value:unknown){
  return String(value??"").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<")
   .replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
   .replace(/&#(\d+);/g,(_m,n)=>String.fromCodePoint(Number(n)))
   .replace(/&#x([0-9a-f]+);/gi,(_m,n)=>String.fromCodePoint(parseInt(n,16)));
}
function collectJobPostingJsonLd(html:string,pageUrl:string){
  const jobs:any[]=[];
  const visit=(node:any)=>{
    if(!node||typeof node!=="object")return;
    const types=Array.isArray(node["@type"])?node["@type"]:[node["@type"]];
    if(types.some((t:any)=>String(t).toLowerCase()==="jobposting")){
      const rawLoc=Array.isArray(node.jobLocation)?node.jobLocation[0]:node.jobLocation;
      const address=rawLoc?.address||rawLoc||{};
      const country=typeof address.addressCountry==="object"?address.addressCountry?.name:address.addressCountry;
      const url=validHttpUrl(node.url||node.sameAs)||pageUrl;
      jobs.push({id:node.identifier?.value||node.identifier||node.jobId||url,title:cleanText(node.title,240),
        description:cleanText(node.description||node.descriptionTeaser),
        location:cleanText([address.addressLocality,address.addressRegion,country].filter(Boolean).join(", "),240),
        employmentType:Array.isArray(node.employmentType)?node.employmentType.join(", "):node.employmentType,applyUrl:url});
      return;
    }
    if(Array.isArray(node)){node.forEach(visit);return;}
    ["@graph","itemListElement","item","mainEntity","hasPart"].forEach(k=>{if(node[k])visit(node[k]);});
  };
  for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{visit(JSON.parse(safeDecodeHtml(m[1])));}catch{/* malformed publisher metadata */}
  }
  return jobs;
}
const OFFICIAL_INDIA_CITIES=["Hyderabad","Secunderabad","Bengaluru","Bangalore","Chennai","Pune","Nellore","Visakhapatnam","Vizag","Vijayawada","Tirupati","Guntur","Kurnool","Mumbai","Navi Mumbai","Gurugram","Gurgaon","Noida","New Delhi","Delhi","Kolkata","Ahmedabad","Gandhinagar","Kochi","Coimbatore","Jaipur","Indore","Bhopal","Lucknow","Chandigarh","Mohali","Bhubaneswar","Mysuru","Mysore","Mangaluru","Mangalore","Thiruvananthapuram","Madurai","Trichy","Nagpur","Vadodara","Surat","Dehradun","Ranchi","Patna","Guwahati","Aurangabad","Jamshedpur","Amritsar","Kanpur","Agra","Rajkot","Jodhpur","Udaipur"];
function inferOfficialIndiaLocation(value:string){
  const text=safeDecodeHtml(value).replace(/<[^>]*>/g," ");
  for(const city of [...OFFICIAL_INDIA_CITIES].sort((a,b)=>b.length-a.length))if(text.toLowerCase().includes(city.toLowerCase()))return city+", India";
  if(/\bIndia\b/i.test(text))return "India";
  return "";
}
function readHtmlMeta(html:string,key:string,attribute:"name"|"property"="name"){
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
    const attr=tag.match(new RegExp("\\b"+attribute+"\\s*=\\s*['\"]([^'\"]+)['\"]","i"));
    if(String(attr?.[1]||"").toLowerCase()!==key.toLowerCase())continue;
    const content=tag.match(/\bcontent\s*=\s*(['"])(.*?)\1/i);
    if(content?.[2])return cleanText(safeDecodeHtml(content[2]),4000);
  }
  return "";
}
function isOfficialHost(url:string,cfg:OfficialCareerConfig){
  try{const host=new URL(url).hostname;return cfg.hosts.some(allowed=>host===allowed||host.endsWith("."+allowed));}catch{return false;}
}
function isOfficialJobDetailUrl(value:string,cfg:OfficialCareerConfig){
  let url:URL;try{url=new URL(value);}catch{return false;}
  if(!isOfficialHost(url.href,cfg))return false;
  const path=url.pathname.toLowerCase(),query=url.searchParams,company=cfg.company.toLowerCase();
  const queryVal=(name:string)=>{for(const [key,value] of query.entries())if(key.toLowerCase()===name.toLowerCase())return value;return "";};
  const hasQuery=(name:string)=>[...query.keys()].some(key=>key.toLowerCase()===name.toLowerCase());
  if(company==="infosys")return (path==="/jobdesc"&&/^INFSYS-EXTERNAL-/i.test(queryVal("jobReferenceCode")))||(path==="/joblist"&&/^\d{5,}$/.test(queryVal("postingId")));
  if(company==="capgemini")return /^\/job\/[^/]+\/\d{5,}(?:-en_us)?\/?$/i.test(url.pathname);
  if(company==="cognizant")return /^\/india-en\/jobs\/\d{8,}\/[^/]+\/?$/i.test(url.pathname);
  if(company==="hcltech")return /^\/job\/[^/]+\/\d{5,}(?:-en_us)?\/?$/i.test(url.pathname);
  if(company==="wipro")return /^\/job\/[^/]+\/\d{5,}(?:-en_us)?\/?$/i.test(url.pathname);
  if(company==="tech mahindra")return /\/jobdetails\.aspx$/i.test(path)&&query.size>0;
  return false;
}
function officialJobLinkLooksRelevant(url:URL,label:string,listing:URL,cfg:OfficialCareerConfig){
  if(url.href.split("#")[0]===listing.href.split("#")[0])return false;
  return isOfficialJobDetailUrl(url.href,cfg);
}
function officialAnchorContext(html:string,index:number){
  const start=Math.max(0,index-1800),before=html.slice(start,index),row=before.lastIndexOf("<tr");
  if(row>=0&&index-(start+row)<1400){const end=html.indexOf("</tr>",index);if(end>=0)return html.slice(start+row,end+5);}
  const block=[before.lastIndexOf("<article"),before.lastIndexOf("<li")].filter(p=>p>=0).sort((a,b)=>b-a);
  if(block.length){const absolute=start+block[0],ends=["</article>","</li>"].map(t=>html.indexOf(t,index)).filter(p=>p>=0);if(ends.length)return html.slice(absolute,Math.min(...ends)+10);}
  return html.slice(Math.max(0,index-400),Math.min(html.length,index+900));
}
function extractOfficialJobLinks(html:string,pageUrl:string,cfg:OfficialCareerConfig){
  const listing=new URL(pageUrl),out:any[]=[],seen=new Set<string>();
  for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)){
    let target:URL;try{target=new URL(safeDecodeHtml(m[2]),pageUrl);}catch{continue;}
    if(!isOfficialHost(target.href,cfg))continue;
    const label=cleanText(safeDecodeHtml(m[3]),240);
    if(!officialJobLinkLooksRelevant(target,label,listing,cfg))continue;
    const url=target.href.split("#")[0];if(seen.has(url))continue;seen.add(url);
    const context=officialAnchorContext(html,m.index??0);
    out.push({url,anchorTitle:label,context,location:inferOfficialIndiaLocation(context)||(/locationsearch=India|\/india-en\//i.test(pageUrl)?"India":"")});
  }
  return out;
}
function fallbackOfficialJobTitle(html:string,fallback:string){
  const h1=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if(h1?.[1]){const t=cleanText(safeDecodeHtml(h1[1]),240);if(t&&!/^(careers|job search|search jobs|career opportunities|job details?|job information|job description|job posting|job overview|position details|view job|apply now)$/i.test(t))return t;}
  const title=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if(title?.[1]){const t=cleanText(safeDecodeHtml(title[1]),240).split(/\s+[|–—-]\s+/)[0].trim();if(t&&!/^(careers|job search|search jobs|career opportunities|job details?|job information|job description|job posting|job overview|position details|view job|apply now)$/i.test(t))return t;}
  return fallback;
}
async function fetchOfficialCareerJobs(boardToken:string):Promise<any[]>{
  const cfg=OFFICIAL_CAREER_BOARDS[boardToken.toLowerCase()];
  if(!cfg)throw new Error("Unknown official India careers source key");
  // Infosys now serves its live public India jobs through this JSON endpoint.
  // Prefer the official feed over parsing the Angular-rendered search page.
  const pages=await Promise.all(cfg.listingUrls.map(async url=>{
    let lastStatus=0;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const r=await fetch(url,{headers:{"Accept":"text/html,application/xhtml+xml,application/ld+json;q=0.9,*/*;q=0.8","User-Agent":"Mozilla/5.0 (compatible; AldovraIndiaJobs/1.1; +https://aldovra.com)"},signal:AbortSignal.timeout(11000)});
        lastStatus=r.status;
        if(r.ok)return{url:r.url||url,html:await r.text(),status:r.status};
        if(![429,500,502,503,504].includes(r.status))break;
      }catch{lastStatus=0;}
    }
    return{url,html:"",status:lastStatus};
  }));
  const valid=pages.filter(p=>p.html.length>500);
  if(!valid.length){const code=pages.map(p=>p.status).find(n=>n)||"network/timeout";throw new Error("Official careers page unavailable (HTTP "+code+")");}
  const jobs:any[]=[],seen=new Set<string>(),links:any[]=[];
  for(const page of valid){
    for(const job of collectJobPostingJsonLd(page.html,page.url)){if(!job.location&&/locationsearch=India|\/india-en\/|\/go\/India\//i.test(page.url))job.location="India";if(!job.title||!job.description||!job.applyUrl||!isOfficialJobDetailUrl(job.applyUrl,cfg)||!isOfficialHost(job.applyUrl,cfg))continue;const key=String(job.id||job.applyUrl);if(!seen.has(key)){seen.add(key);jobs.push(job);}}
    for(const link of extractOfficialJobLinks(page.html,page.url,cfg)){if(links.length<100&&!links.some(x=>x.url===link.url))links.push(link);}
  }
  // Read company-published sitemaps/robots declarations as a fallback for JavaScript-only job search pages.
  // Do not follow arbitrary hosts: every discovered URL must match the company's strict job-detail route.
  const sitemapQueue=[...(cfg.sitemapUrls||[]),new URL("/robots.txt",cfg.listingUrls[0]).href];
  const sitemapVisited=new Set<string>();
  const discoveredJobUrls:string[]=[];
  let sitemapDepth=0;
  let pendingSitemaps=sitemapQueue;
  while(sitemapDepth<2&&pendingSitemaps.length){
    const current=pendingSitemaps.splice(0,6).filter(url=>!sitemapVisited.has(url));
    current.forEach(url=>sitemapVisited.add(url));
    const results=await Promise.all(current.map(async url=>{
      try{
        const r=await fetch(url,{headers:{"Accept":"application/xml,text/xml,text/plain,text/html;q=0.8,*/*;q=0.5","User-Agent":"Mozilla/5.0 (compatible; AldovraIndiaJobs/1.1; +https://aldovra.com)"},signal:AbortSignal.timeout(9000)});
        if(!r.ok)return{url,body:""};
        return{url,body:await r.text()};
      }catch{return{url,body:""};}
    }));
    const nextSitemaps:string[]=[];
    for(const result of results){
      if(!result.body)continue;
      if(/robots\.txt(?:$|\?)/i.test(result.url)){
        for(const match of result.body.matchAll(/^\s*sitemap:\s*(https?:\/\/\S+)/gim)){
          const candidate=match[1].trim();
          if(isOfficialHost(candidate,cfg))nextSitemaps.push(candidate);
        }
        continue;
      }
      for(const match of result.body.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)){
        const candidate=safeDecodeHtml(match[1]).trim();
        if(!isOfficialHost(candidate,cfg))continue;
        if(isOfficialJobDetailUrl(candidate,cfg))discoveredJobUrls.push(candidate);
        else if(/sitemap/i.test(candidate)&&!sitemapVisited.has(candidate))nextSitemaps.push(candidate);
      }
      for(const link of extractOfficialJobLinks(result.body,result.url,cfg))discoveredJobUrls.push(link.url);
    }
    pendingSitemaps=[...new Set(nextSitemaps)];
    sitemapDepth++;
  }
  for(const url of discoveredJobUrls.slice(0,120)){
    if(!links.some(link=>link.url===url)){
      let anchorTitle="";
      try{anchorTitle=decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).slice(-2,-1)[0]||cfg.company);}catch{anchorTitle=cfg.company;}
      links.push({url,anchorTitle,context:"",location:inferOfficialIndiaLocation(new URL(url).pathname)});
    }
  }

  const pending=links.filter(link=>!jobs.some(job=>String(job.applyUrl||"").split("#")[0]===link.url)).slice(0,30);
  const detailDiagnostics={attempted:0,httpOk:0,httpFailures:0,emptyTitles:0,shortDescriptions:0,jsonLd:0};
  for(let offset=0;offset<pending.length;offset+=6){
    const batch=pending.slice(offset,offset+6);
    const details=await Promise.all(batch.map(async link=>{
      detailDiagnostics.attempted++;
      try{
        let r:Response|null=null;
        for(let attempt=0;attempt<2;attempt++){
          try{
            r=await fetch(link.url,{headers:{"Accept":"text/html,application/xhtml+xml,application/ld+json;q=0.9,*/*;q=0.8","User-Agent":"Mozilla/5.0 (compatible; AldovraIndiaJobs/1.1; +https://aldovra.com)"},signal:AbortSignal.timeout(8000)});
            if(r.ok||![429,500,502,503,504].includes(r.status))break;
          }catch{if(attempt===1)return null;}
        }
        if(!r?.ok){detailDiagnostics.httpFailures++;return null;}detailDiagnostics.httpOk++;const html=await r.text(),jsonJobs=collectJobPostingJsonLd(html,link.url);if(jsonJobs.length){detailDiagnostics.jsonLd++;return jsonJobs[0];}
        const title=fallbackOfficialJobTitle(html,link.anchorTitle);
        const description=readHtmlMeta(html,"description")||readHtmlMeta(html,"og:description","property")||cleanText(html,6000);
        const locationFromUrl=inferOfficialIndiaLocation(new URL(link.url).pathname);
        const plain=safeDecodeHtml(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ");
        const labelled=plain.match(/(?:job\s+location|primary\s+location|location|city)\s*[:\-–]\s*([^\n|]{2,100})/i)?.[1]||"";
        let location=inferOfficialIndiaLocation(link.context)||locationFromUrl||inferOfficialIndiaLocation(labelled);if(!location){const visibleJobHeader=plain.slice(0,2600);location=inferOfficialIndiaLocation(visibleJobHeader);}
        if(!title||/^(careers|job search|search jobs|view job|apply now|access denied|just a moment)$/i.test(title)){detailDiagnostics.emptyTitles++;return null;}if(description.length<80){detailDiagnostics.shortDescriptions++;return null;}
        return{id:link.url,title,description,location,applyUrl:link.url,employmentType:/intern|internship/i.test(title)?"Internship":null};
      }catch{return null;}
    }));
    for(const job of details){if(!job?.title||!job?.description||!job?.applyUrl)continue;const key=String(job.id||job.applyUrl);if(!seen.has(key)){seen.add(key);jobs.push(job);}}
  }
  if(!jobs.length)throw new Error("No official job details parsed (listingPages="+valid.length+", detailLinks="+links.length+", sitemapDetails="+discoveredJobUrls.length+", detailAttempts="+detailDiagnostics.attempted+", httpOk="+detailDiagnostics.httpOk+", httpFailures="+detailDiagnostics.httpFailures+", emptyTitles="+detailDiagnostics.emptyTitles+", shortDescriptions="+detailDiagnostics.shortDescriptions+", jsonLd="+detailDiagnostics.jsonLd+"). Source remains enabled; no job records were changed.");
  return jobs;
}

async function validatePublicBoard(provider: string, boardToken: string): Promise<{ error?: string; rows?: any[]; sample_titles?: string[] }> {
  if (provider === "official_careers") {
    const rows = await fetchOfficialCareerJobs(boardToken);
    return { rows, sample_titles: rows.slice(0,5).map((row:any)=>cleanText(row.title,160)).filter(Boolean),
      error: rows.length ? undefined : "No public job records could be extracted from this official career page yet." };
  }
  const endpoint = provider === "himalayas"
    ? "https://himalayas.app/jobs/api?limit=20"
    : provider === "remoteok"
      ? "https://remoteok.com/api"
      : provider === "greenhouse"
      ? "https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(boardToken) + "/jobs"
      : provider === "lever"
        ? "https://api.lever.co/v0/postings/" + encodeURIComponent(boardToken) + "?mode=json"
        : provider === "smartrecruiters"
          ? "https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(boardToken) + "/postings?limit=100&offset=0&country=in"
          : "https://api.ashbyhq.com/posting-api/job-board/" + encodeURIComponent(boardToken);
  let response = await fetch(endpoint, {
    headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  // Greenhouse has regional public board clusters. Retry EU only after a default
  // endpoint 404; do not retry rate limits, server errors, or network failures.
  if (provider === "greenhouse" && response.status === 404) {
    const regional = await fetch("https://boards-api.eu.greenhouse.io/v1/boards/" + encodeURIComponent(boardToken) + "/jobs", {
      headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (regional.ok) response = regional;
  }
  if (!response.ok) return { error: "Board validation failed (HTTP " + response.status + "). Check the official board token." };
  const payload = await response.json();
  const rows = provider === "greenhouse" || provider === "ashby"
    ? (Array.isArray(payload?.jobs) ? payload.jobs : null)
    : provider === "smartrecruiters"
      ? (Array.isArray(payload?.content) ? payload.content : null)
      : provider === "remoteok"
        ? (Array.isArray(payload) ? payload.filter((item: any) => item && (item.id || item.position || item.title)) : null)
        : provider === "himalayas"
          ? (Array.isArray(payload?.jobs) ? payload.jobs : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : null)
          : (Array.isArray(payload) ? payload : null);
  if (!rows) return { error: "Provider response was not a valid public jobs feed" };
  return {
    rows,
    sample_titles: rows.slice(0, 3).map((row: any) => cleanText(provider === "greenhouse" || provider === "ashby" ? row.title : provider === "smartrecruiters" ? row.name : provider === "remoteok" ? (row.position || row.title) : provider === "himalayas" ? row.title : row.text, 160)).filter(Boolean),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 500);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Authentication required" }, 401);
  const cronSecret = Deno.env.get("ALDOVRA_CRON_SECRET");
  if (!cronSecret) return json({ error: "Cron authentication is not configured" }, 500);
  const isCron = token === cronSecret;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Scheduled invocations use a dedicated random cron secret stored in Edge Function Secrets.
  // Browser/manual invocations must be a valid signed-in admin user session.
  if (!isCron) {
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
    const { data: adminRow, error: adminError } = await admin.from("admin_users").select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (adminError || !adminRow) return json({ error: "Admin access required" }, 403);
  }

  let requestBody: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) requestBody = parsed;
  } catch {
    return json({ error: "A JSON request body is required" }, 400);
  }

  const action = String(requestBody.action ?? "");
  // Fast, non-mutating probe used to verify cron-secret authentication without running a full sync.
  if (action === "health_check") {
    if (!isCron) return json({ error: "Cron authentication required" }, 401);
    return json({ success: true, auth: "cron", function_version: 72 });
  }
  // The cron secret is reserved for scheduled sync only; source mutations require a real admin session.
  if (isCron && ["validate_source", "save_source", "set_enabled"].includes(action)) {
    return json({ error: "A signed-in admin session is required for source management." }, 403);
  }

  // Validate against fixed official ATS API hosts; never accept arbitrary URLs.
  if (action === "validate_source" || action === "save_source") {
    const provider = requestBody.provider;
    const boardToken = String(requestBody.board_token ?? "").trim();
    const companyName = String(requestBody.company_name ?? "").trim();
    if (!["greenhouse", "lever", "ashby", "smartrecruiters", "official_careers", "remoteok", "himalayas"].includes(String(provider))) return json({ error: "Unsupported provider" }, 400);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(boardToken)) return json({ error: "Invalid board token format" }, 400);
    if (action === "save_source" && (!companyName || companyName.length > 200)) {
      return json({ error: "Company name is required and must be 200 characters or fewer." }, 400);
    }
    try {
      const validation = await validatePublicBoard(provider, boardToken);
      if (validation.error) return json({ success: false, validation_error: true, error: validation.error });
      const rows = validation.rows as any[];
      if (action === "save_source" && rows.length === 0) {
        return json({ success: false, validation_error: true, error: "Board has no current public listings; source was not saved." });
      }
      if (action === "save_source") {
        const { data: saved, error: saveError } = await admin.from("job_sources").upsert({
          provider, board_token: boardToken, company_name: companyName, enabled: true, updated_at: new Date().toISOString(),
        }, { onConflict: "provider,board_token" }).select("id").single();
        if (saveError || !saved) return json({ error: "Board validated but could not be saved." }, 500);
      }
      return json({
        success: true, provider, board_token: boardToken, current_listings: rows.length,
        sample_titles: validation.sample_titles,
        message: action === "save_source" ? "Public board validated and saved." : "Public board API validated. Review the employer's official careers page before saving.",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "network or timeout error";
      return json({
        success: false,
        validation_error: true,
        error: "Could not reach the public board API (" + reason.slice(0, 120) + "). No source was saved.",
      });
    }
  }

  if (action === "set_enabled") {
    const sourceId = String(requestBody.source_id ?? "");
    const enabled = requestBody.enabled;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId) || typeof enabled !== "boolean") {
      return json({ error: "A valid source ID and boolean enabled value are required." }, 400);
    }
    const { error: updateError } = await admin.from("job_sources").update({ enabled, updated_at: new Date().toISOString() }).eq("id", sourceId);
    if (updateError) return json({ error: "Could not update source." }, 500);
    return json({ success: true, source_id: sourceId, enabled });
  }

  // Process a very small rotating batch per invocation to stay within gateway time limits.
  // Oldest/never-synced sources go first; last_synced_at is refreshed after each provider attempt.
  const { data: sources, error: sourceError } = await admin.from("job_sources")
    .select("id,provider,board_token,company_name,last_synced_at,cursor_token").eq("enabled", true)
    .order("last_synced_at", { ascending: true, nullsFirst: true }).limit(100);
  if (sourceError) return json({ error: "Could not load approved sources" }, 500);
  if (!sources?.length) return json({ success: true, message: "No approved job sources are enabled yet.", sources_checked: 0, imported: 0, skipped: 0 });
  const indiaFirstCompanies = new Set(["phonepe", "freshworks", "servicenow", "bosch group", "jitterbit", "razorpay", "swiggy", "zoho", "paytm", "meesho", "flipkart", "zerodha", "groww", "cred", "dream11", "infosys", "tcs", "wipro", "hcltech", "tech mahindra", "browserstack", "chargebee", "juspay", "darwinbox", "storable india", "redwood software", "accordion india", "zenoti", "doordash india", "tide", "sarvam", "100ms", "capgemini", "cognizant", "hevo data", "weekday", "famapp", "sprinto", "drivetrain", "ahead", "commure", "certifyos", "almabase", "aiprise", "cartesia", "zeta"]);
  const selectedSources = [...sources].sort((a: any, b: any) => {
    const at = a.last_synced_at ? Date.parse(a.last_synced_at) : 0;
    const bt = b.last_synced_at ? Date.parse(b.last_synced_at) : 0;
    if (at !== bt) return at - bt;
    const ai = indiaFirstCompanies.has(String(a.company_name ?? "").toLowerCase()) ? 1 : 0;
    const bi = indiaFirstCompanies.has(String(b.company_name ?? "").toLowerCase()) ? 1 : 0;
    return bi - ai || String(a.company_name ?? "").localeCompare(String(b.company_name ?? ""));
  }).slice(0, 4);
  const { data: skills, error: skillsError } = await admin.from("skills").select("id,name").limit(1000);
  if (skillsError) return json({ error: "Could not load skill catalogue" }, 500);
  const skillRows = (skills ?? []).filter((s: any) => String(s.name ?? "").trim().length >= 2);
  let imported = 0, skipped = 0, checked = 0, deactivated = 0;
  const errors: string[] = [];

  for (const source of selectedSources) {
    checked++;
    const sourceErrorStart = errors.length;
    try {
      let rows: any[] = [];
      let feedComplete = false;
      if (source.provider === "official_careers") {
        rows = await fetchOfficialCareerJobs(source.board_token);
      } else {
      const endpoint = source.provider === "greenhouse"
        ? "https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(source.board_token) + "/jobs?content=true"
        : source.provider === "lever"
          ? "https://api.lever.co/v0/postings/" + encodeURIComponent(source.board_token) + "?mode=json&skip=0&limit=100"
          : source.provider === "smartrecruiters"
             ? "https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(source.board_token) + "/postings?limit=100&country=in"
             : source.provider === "jobicy"
               ? "https://jobicy.com/api/v2/remote-jobs?count=50"
               : source.provider === "remoteok"
                 ? "https://remoteok.com/api"
                 : source.provider === "himalayas"
                   ? "https://himalayas.app/jobs/api?limit=20"
                   : "https://api.ashbyhq.com/posting-api/job-board/" + encodeURIComponent(source.board_token) + "?includeCompensation=true";
      let response = await fetch(endpoint, {
        headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      // Mirror validation fallback during scheduled/manual sync so EU-hosted
      // Greenhouse boards do not remain permanently marked as HTTP 404.
      if (source.provider === "greenhouse" && response.status === 404) {
        const regional = await fetch("https://boards-api.eu.greenhouse.io/v1/boards/" + encodeURIComponent(source.board_token) + "/jobs?content=true", {
          headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (regional.ok) response = regional;
      }
      if (!response.ok) throw new Error("Provider returned HTTP " + response.status);
      let payload = await response.json();
      rows = source.provider === "greenhouse" || source.provider === "ashby" || source.provider === "jobicy"
        ? (Array.isArray(payload?.jobs) ? payload.jobs : [])
        : source.provider === "smartrecruiters"
          ? (Array.isArray(payload?.content) ? payload.content : [])
          : source.provider === "remoteok"
            ? (Array.isArray(payload) ? payload.filter((item: any) => item && (item.id || item.position || item.title)) : [])
            : source.provider === "himalayas"
              ? (Array.isArray(payload?.jobs) ? payload.jobs : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : [])
              : (Array.isArray(payload) ? payload : []);
      if (source.provider === "himalayas") {
        // Himalayas permits use on an operated job board with visible source credit.
        // Its feed is refreshed daily; follow opaque cursors and never guess page tokens.
        let nextCursor = payload?.nextCursor || payload?.next_cursor || null;
        const totalCount = typeof payload?.totalCount === "number" ? payload.totalCount : null;
        let pageCount = 1;
        while (nextCursor && pageCount < 10) {
          const pageUrl = "https://himalayas.app/jobs/api?limit=20&cursor=" + encodeURIComponent(String(nextCursor));
          const pageResponse = await fetch(pageUrl, {
            headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (!pageResponse.ok) throw new Error("Himalayas feed returned HTTP " + pageResponse.status);
          const pagePayload = await pageResponse.json();
          const pageRows = Array.isArray(pagePayload?.jobs) ? pagePayload.jobs
            : Array.isArray(pagePayload?.data) ? pagePayload.data
            : Array.isArray(pagePayload?.items) ? pagePayload.items : [];
          if (!pageRows.length) { feedComplete = false; break; }
          rows.push(...pageRows);
          nextCursor = pagePayload?.nextCursor || pagePayload?.next_cursor || null;
          pageCount++;
        }
        feedComplete = !nextCursor && (totalCount === null || rows.length >= totalCount);
      } else if (source.provider === "remoteok") {
        // The unfiltered feed is small and often lacks explicit entry-level signals.
        // Pull several documented tag feeds, merge by stable posting ID, and keep
        // Remote OK's required source link in each listing. These feeds are capped,
        // so they are deliberately never used as a complete snapshot for deactivation.
        const tags = ["internship", "junior", "entry-level", "graduate"];
        const taggedFeeds = await Promise.all(tags.map(async (tag) => {
          try {
            const taggedResponse = await fetch("https://remoteok.com/api?tag=" + encodeURIComponent(tag), {
              headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
              signal: AbortSignal.timeout(10000),
            });
            if (!taggedResponse.ok) return [];
            const taggedPayload = await taggedResponse.json();
            return Array.isArray(taggedPayload)
              ? taggedPayload.filter((item: any) => item && (item.id || item.position || item.title))
              : [];
          } catch {
            return [];
          }
        }));
        const byId = new Map<string, any>();
        for (const item of [...rows, ...taggedFeeds.flat()]) {
          const id = String(item?.id || item?.slug || item?.url || "");
          if (id && !byId.has(id)) byId.set(id, item);
        }
        rows = [...byId.values()];
      }
      feedComplete = false;

      // Lever's public postings endpoint is paginated; fetch all pages before
      // using its result to mark previously imported jobs as closed.
      if (source.provider === "lever") {
        let offset = rows.length;
        let pageCount = 1;
        feedComplete = Array.isArray(payload) && rows.length < 100;
        while (!feedComplete && pageCount < 25) {
          const pageUrl = "https://api.lever.co/v0/postings/" + encodeURIComponent(source.board_token) +
            "?mode=json&skip=" + offset + "&limit=100";
          const pageResponse = await fetch(pageUrl, {
            headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (!pageResponse.ok) break;
          const pageRows = await pageResponse.json();
          if (!Array.isArray(pageRows)) break;
          rows.push(...pageRows);
          pageCount++;
          offset += pageRows.length;
          if (pageRows.length < 100) feedComplete = true;
          if (pageRows.length === 0) feedComplete = true;
        }
      } else if (source.provider === "greenhouse") {
        // Greenhouse returns meta.total; only trust a snapshot that covers it.
        feedComplete = Array.isArray(payload?.jobs) &&
          (typeof payload?.meta?.total !== "number" || rows.length >= payload.meta.total);
      } else if (source.provider === "ashby") {
        // Ashby's public posting API is the current published job-board feed.
        feedComplete = Array.isArray(payload?.jobs) && Boolean(payload?.apiVersion);
      } else if (source.provider === "jobicy") {
        // Public Jobicy API is a rolling global remote-jobs snapshot; India eligibility must be assessed from each listing, not an unsupported geo=India filter.
        // Never deactivate existing jobs based on this partial feed.
        feedComplete = false;
      } else if (source.provider === "remoteok") {
        // Remote OK exposes a capped recent-postings feed, not a complete board snapshot.
        // Never deactivate older jobs merely because they are outside this response.
        feedComplete = false;
      } else if (source.provider === "smartrecruiters") {
        const expectedTotal = typeof payload?.totalFound === "number" ? payload.totalFound : null;
        feedComplete = Array.isArray(payload?.content) && expectedTotal !== null;
        let offset = rows.length;
        let pageCount = 1;
        while (feedComplete && rows.length < (expectedTotal as number) && pageCount < 25) {
          const pageUrl = "https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(source.board_token) +
            "/postings?limit=100&offset=" + offset + "&country=in";
          const pageResponse = await fetch(pageUrl, {
            headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (!pageResponse.ok) { feedComplete = false; break; }
          const pagePayload = await pageResponse.json();
          if (!Array.isArray(pagePayload?.content) || pagePayload.totalFound !== expectedTotal) {
            feedComplete = false;
            break;
          }
          const pageRows = pagePayload.content as any[];
          if (!pageRows.length && rows.length < (expectedTotal as number)) { feedComplete = false; break; }
          rows.push(...pageRows);
          offset += pageRows.length;
          pageCount++;
        }
        feedComplete = feedComplete && rows.length >= (expectedTotal as number);
      }


      }
      let sourceCount = 0;
      let sourceFailureCount = 0;
      const indiaPriority = (raw: any) => {
        const job = normalize(source, raw);
        const loc = String(job.location || "").toLowerCase();
        if (/hyderabad|secunderabad|telangana/.test(loc)) return 120;
        if (/bengaluru|bangalore/.test(loc)) return 110;
        if (/\bnellore\b/.test(loc)) return 105;
        if (/\bpune\b|chennai/.test(loc)) return 100;
        if (/india|mumbai|gurugram|gurgaon|noida|visakhapatnam|vijayawada|tirupati|kochi|coimbatore|jaipur|indore/.test(loc)) return 75;
        return 10;
      };
      const candidateRows = rows
        .filter((raw: any) => source.provider !== "ashby" || raw?.isListed !== false)
        .filter((raw: any) => source.provider === "smartrecruiters" || isIndiaEligibleJob(normalize(source, raw)))
        .filter((raw: any) => source.provider !== "himalayas" || isHimalayasIndiaEligible(raw))
        .sort((a: any, b: any) => indiaPriority(b) - indiaPriority(a));
      if (source.provider === "official_careers" && rows.length > 0 && candidateRows.length === 0) {
        sourceFailureCount++;
        errors.push(source.company_name + ": parsed " + rows.length + " official pages but none had a reliable India location; no jobs imported");
      }
      for (const raw of candidateRows.slice(0, source.provider === "smartrecruiters" ? 15 : 150)) {
        if (source.provider === "ashby" && raw?.isListed === false) { skipped++; continue; }
        let row = raw;
        if (source.provider === "smartrecruiters") {
          const detailResponse = await fetch("https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(source.board_token) + "/postings/" + encodeURIComponent(String(raw.id || raw.uuid || "")), {
            headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (!detailResponse.ok) {
            skipped++;
            sourceFailureCount++;
            errors.push(source.company_name + ": SmartRecruiters detail returned HTTP " + detailResponse.status);
            continue;
          }
          row = await detailResponse.json();
        }
        const job = normalize(source, row);
        if (!isIndiaEligibleJob(job)) { skipped++; continue; }
        // Reject generic page headings instead of publishing them as job titles.
        // Official career parsers sometimes encounter templates headed "Job Details";
        // these are not a usable title and must not reach student-facing listings.
        if (/^(careers?|job search|search jobs|career opportunities|job details?|job information|job description|job posting|job overview|position details|view job|apply now|job opportunity|untitled)$/i.test(String(job.title || "").trim())) {
          skipped++;
          sourceFailureCount++;
          errors.push(source.company_name + ": skipped a generic page title; parser needs a real role title");
          continue;
        }
        // Publish only jobs with a positive fresher/graduate signal and no explicit
        // multi-year experience requirement. Unknown experience is not treated as fresher.
        if (!isFresherEligibleJob(job)) { skipped++; continue; }
        job.experience = "fresher";
        if (!job.externalId || !job.title || !job.url || !job.description) {
          skipped++;
          sourceFailureCount++;
          errors.push(source.company_name + ": job detail missing external ID, title, description, or application URL");
          continue;
        }
        const searchable = (job.title + " " + job.description).toLowerCase();
        const matchedSkills = skillRows.filter((s: any) => hasSkill(searchable, String(s.name))).slice(0, 20);
        // Keep valid employer listings even when the local skill catalogue has no direct match.
        // The dashboard labels inferred matches as estimates and leaves unclassified jobs browseable.
        // Empty skill arrays are supported by the atomic upsert; they must not imply a skill match.
        const { data: savedId, error: atomicSaveError } = await admin.rpc("upsert_job_opportunity_atomic", {
          p_job: {
            source_provider: source.provider,
            source_board_token: source.board_token,
            source_external_id: job.externalId,
            source_url: job.url,
            source_last_seen_at: new Date().toISOString(),
            title: job.title,
            company_name: job.company,
            location: job.location,
            work_mode: job.mode,
            employment_type: job.employment,
            description: job.description,
            experience_level: job.experience,
            application_url: job.url,
          },
          p_skill_ids: matchedSkills.map((s: any) => Number(s.id)),
        });
        if (atomicSaveError || !savedId) {
          skipped++;
          sourceFailureCount++;
          const saveReason = atomicSaveError?.message ? " (" + String(atomicSaveError.message).slice(0, 120) + ")" : "";
          errors.push(source.company_name + ": atomic job/skill save failed" + saveReason);
          continue;
        }
        imported++; sourceCount++;
      }
      // Reconcile active records against the full provider feed; never use age alone.
      // Importing the top 150 is a throughput cap, not the set of jobs still live.
      if (source.provider === "official_careers" || source.provider === "remoteok" || source.provider === "himalayas" || source.provider === "jobicy") {
        // Partial/capped feeds must never deactivate unseen jobs.
      } else if (feedComplete) {
        const liveExternalIds = (source.provider === "smartrecruiters"
          ? rows.map((raw: any) => String(raw?.id || raw?.uuid || ""))
          : candidateRows.map((raw: any) => String(normalize(source, raw).externalId || "")))
          .filter((id: string) => Boolean(id));
        const { data: reconciledCount, error: reconcileError } = await admin.rpc("reconcile_job_source_feed", {
          p_source_provider: source.provider,
          p_board_token: source.board_token,
          p_live_external_ids: liveExternalIds,
          p_feed_complete: true,
        });
        if (reconcileError) {
          sourceFailureCount++;
          errors.push(source.company_name + ": active job reconciliation failed");
        } else {
          deactivated += Number(reconciledCount || 0);
        }
      } else {
        sourceFailureCount++;
        errors.push(source.company_name + ": provider feed was incomplete; skipped closed-job reconciliation");
      }
      await admin.from("job_sources").update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: sourceFailureCount > 0 ? ("partial: " + errors.slice(sourceErrorStart).join(" | ").slice(0, 150)) : "success",
        last_sync_count: sourceCount, updated_at: new Date().toISOString(),
      }).eq("id", source.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown provider error";
      errors.push(source.company_name + ": " + message.slice(0, 180));
      await admin.from("job_sources").update({
        last_synced_at: new Date().toISOString(), last_sync_status: "error: " + message.slice(0, 180),
        updated_at: new Date().toISOString(),
      }).eq("id", source.id);
    }
  }
  return json({ success: errors.length === 0, sources_checked: checked, imported, skipped, deactivated, errors });
});
