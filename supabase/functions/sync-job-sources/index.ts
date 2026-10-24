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
  if (/\b(?:employment type|job type|type of employment)\s*[:\-]?\s*full[- ]?time\b/.test(d) || /\bfull[- ]time (?:role|position|opportunity|job|employment)\b/.test(d)) return "Full-time";
  if (/\b(?:employment type|job type)\s*[:\-]?\s*(?:internship|intern)\b/.test(d)) return "Internship";
  return null;
};
function extractPostingDate(source: any, row: any): string | null {
  // Prefer explicit publication/creation fields supplied by the employer/provider.
  // Never use last-updated timestamps as publication dates.
  const candidates: unknown[] = [];
  if (source.provider === "greenhouse") candidates.push(row?.first_published, row?.created_at, row?.createdAt);
  else if (source.provider === "lever") candidates.push(row?.createdAt, row?.created_at);
  else if (source.provider === "ashby") candidates.push(row?.publishedAt, row?.published_at, row?.createdAt, row?.created_at);
  else if (source.provider === "smartrecruiters") candidates.push(row?.releasedDate, row?.released_date, row?.createdOn, row?.created_at);
  else if (source.provider === "jobicy") candidates.push(row?.pubDate, row?.publishedAt, row?.published_at, row?.datePosted, row?.date);
  else if (source.provider === "remoteok") candidates.push(row?.date, row?.datePosted, row?.publishedAt);
  else if (source.provider === "himalayas") candidates.push(row?.pubDate, row?.publishedAt, row?.published_at, row?.createdAt, row?.created_at);
  else if (source.provider === "workday") candidates.push(row?.jobPostingInfo?.startDate);
  else if (source.provider === "adzuna") candidates.push(row?.created);
  else if (source.provider === "jooble") candidates.push(row?.updated);
  else candidates.push(row?.postingDate, row?.posting_date, row?.publishedAt, row?.published_at, row?.datePosted, row?.date);
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    let d: Date;
    if (typeof candidate === "number" || /^\d{10,13}$/.test(String(candidate))) {
      let n = Number(candidate);
      if (String(Math.trunc(n)).length <= 10) n *= 1000;
      d = new Date(n);
    } else {
      d = new Date(String(candidate));
    }
    if (!Number.isFinite(d.getTime())) continue;
    const iso = d.toISOString().slice(0, 10);
    // Ignore clearly invalid/future dates instead of letting one bad provider field hide a job.
    const today = new Date().toISOString().slice(0, 10);
    if (iso >= "2000-01-01" && iso <= today) return iso;
  }
  return null;
}
function normalize(source: any, row: any) {
  if (source.provider === "workday") {
    const info = row?.jobPostingInfo || row || {};
    const title = cleanText(info.title, 240);
    const desc = cleanText(info.jobDescription);
    const places = [info.location, ...(Array.isArray(info.additionalLocations) ? info.additionalLocations : [])]
      .map((x: any) => cleanText(x, 120)).filter(Boolean);
    const indiaPlaces = places.filter((p: string) => INDIA_PLACE_RE.test(p));
    const country = cleanText(info.country?.descriptor || "", 60);
    let location = (indiaPlaces.length ? indiaPlaces : places).slice(0, 4).join(" · ");
    if (location && /^india$/i.test(country) && !/india/i.test(location)) location += ", India";
    if (!location && /^india$/i.test(country)) location = "India";
    const tenant = String(row?._tenant || "");
    return {
      externalId: tenant + ":" + String(info.jobReqId || info.id || row?._externalPath || ""),
      title, company: source.company_name, location: location || null, description: desc,
      url: validHttpUrl(info.externalUrl),
      mode: workMode(info.remoteType || null, desc + " " + location),
      employment: employment(info.timeType || null, title, desc),
      experience: classifyExperience({ title, description: desc }),
      postingDate: info.startDate || null,
      salary: null as string | null,
    };
  }
  if (source.provider === "adzuna") {
    const title = cleanText(row.title, 240);
    const desc = cleanText(row.description, 4000);
    const location = cleanText(row.location?.display_name || "", 240);
    const predicted = String(row.salary_is_predicted ?? "1") === "1";
    const min = Number(row.salary_min), max = Number(row.salary_max);
    const salary = predicted ? null : (formatInr(min) && formatInr(max) && min !== max ? formatInr(min) + " – " + formatInr(max) : formatInr(min || max));
    return {
      externalId: String(row.id || ""),
      title, company: cleanText(row.company?.display_name || "Company", 200),
      location: location ? (/india/i.test(location) ? location : location + ", India") : "India",
      description: desc,
      url: validHttpUrl(row.redirect_url),
      mode: workMode(null, title + " " + desc),
      employment: employment(row.contract_time === "part_time" ? "part time" : row.contract_type === "contract" ? "contract" : row.contract_time === "full_time" ? "full time" : null, title, desc),
      experience: classifyExperience({ title, description: desc }),
      postingDate: row.created || null,
      salary,
    };
  }
  if (source.provider === "jooble") {
    const title = cleanText(row.title, 240);
    const desc = cleanText(row.snippet, 4000);
    const location = cleanText(row.location || "", 240);
    return {
      externalId: String(row.id || row.link || ""),
      title, company: cleanText(row.company || "Company", 200),
      location: location ? (/india/i.test(location) ? location : location + ", India") : "India",
      description: desc,
      url: validHttpUrl(row.link),
      mode: workMode(row.type, title + " " + desc),
      employment: employment(row.type, title, desc),
      experience: classifyExperience({ title, description: desc }),
      postingDate: row.updated || null,
      salary: cleanText(row.salary || "", 120) || null,
    };
  }
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
// Common alternate spellings employers use for catalogue skills. Matching on
// these raises skill-tag coverage without inventing skills the job never names.
const SKILL_ALIASES: Record<string, string[]> = {
  "javascript": ["js", "es6", "ecmascript"],
  "node.js": ["node", "nodejs"],
  "react": ["react.js", "reactjs"],
  "next.js": ["nextjs"],
  "vue.js": ["vue", "vuejs"],
  "express.js": ["express", "expressjs"],
  "postgresql": ["postgres", "psql"],
  "mongodb": ["mongo"],
  "kubernetes": ["k8s"],
  "google cloud": ["gcp", "google cloud platform"],
  "aws": ["amazon web services"],
  "azure": ["microsoft azure"],
  "machine learning": ["ml", "machine-learning"],
  "deep learning": ["neural networks", "pytorch", "tensorflow"],
  "nlp": ["natural language processing"],
  "generative ai": ["genai", "gen ai", "llm", "llms", "large language models", "large language model"],
  "data analytics": ["data analysis", "data analyst"],
  "data science": ["data scientist"],
  "power bi": ["powerbi"],
  "spring boot": ["springboot", "spring framework"],
  "c++": ["cpp"],
  "go": ["golang"],
  "cybersecurity": ["cyber security", "information security", "infosec"],
  "manual testing": ["manual qa", "manual tester"],
  "api testing": ["postman", "rest assured", "restassured"],
  "microservices": ["microservice", "micro-services"],
  "angular": ["angularjs"],
  "git": ["version control"],
};
// Single-letter / common-word skill names need case-sensitive, list-context
// matching so "Series C" or "go-to-market" never tag C or Go.
const SPECIAL_SKILL_PATTERNS: Record<string, RegExp[]> = {
  "go": [/\bgolang\b/i, /(?:^|[,\/(]\s*)Go\b(?!-)/, /\bGo\s*(?:,|\/|\band\b|\bor\b)\s*[A-Z]/, /\bGo (?:language|programming|developer|services)\b/],
  "c": [/(?:^|[,\/(]\s*)C\b(?![+#-])/, /\bC\s*(?:,|\/)\s*(?:C\+\+|Python|Java|Embedded)/, /\bC (?:programming|language)\b/, /\bembedded C\b/i],
};
function escapeRegExp(value: string) { return value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&"); }
function hasSkill(text: string, skill: string) {
  const key = String(skill).trim().toLowerCase();
  if (SPECIAL_SKILL_PATTERNS[key]) return SPECIAL_SKILL_PATTERNS[key].some((re) => re.test(text));
  const terms = [key, ...(SKILL_ALIASES[key] || [])];
  return terms.some((term) => new RegExp("(^|[^a-z0-9+#.])" + escapeRegExp(term) + "($|[^a-z0-9+#.])", "i").test(text));
}

/* ---------------- Workday public career sites ---------------- */
// Workday's ISO country ID for India is shared across tenants.
const WORKDAY_INDIA_ID = "c4f78be1a8f14da0ab49ce1162348a5e";
const INDIA_PLACE_RE = /\b(india|bengaluru|bangalore|hyderabad|secunderabad|pune|chennai|mumbai|navi mumbai|thane|gurugram|gurgaon|noida|delhi|new delhi|kolkata|ahmedabad|kochi|cochin|coimbatore|jaipur|indore|chandigarh|mohali|vadodara|nagpur|thiruvananthapuram|trivandrum|mysuru|mysore|visakhapatnam|bhubaneswar|vijayawada|madurai|lucknow|goa)\b/i;
// Rotating keyword searches. Each run takes the next few so a tenant with
// thousands of India roles is covered gradually without huge single runs.
const WORKDAY_QUERIES = ["intern", "graduate", "trainee", "fresher", "entry level", "associate", "junior", "apprentice", "analyst", "engineer"];
const WORKDAY_QUERIES_PER_RUN = 3;
const WORKDAY_PAGES_PER_QUERY = 3;
const WORKDAY_DETAILS_PER_RUN = 24;

function parseWorkdayToken(token: string) {
  const m = String(token).match(/^([A-Za-z0-9-]+)__(wd\d{1,3})__([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error("Invalid Workday board token (expected tenant__wdN__site)");
  return { tenant: m[1], shard: m[2], site: m[3], base: "https://" + m[1] + "." + m[2] + ".myworkdayjobs.com/wday/cxs/" + m[1] + "/" + m[3] };
}
async function workdaySearch(base: string, body: Record<string, unknown>) {
  const response = await fetch(base + "/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Language": "en-US", "User-Agent": "AldovraJobDiscovery/1.0" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Workday search returned HTTP " + response.status);
  return await response.json();
}
// Find the India filter for this tenant: a country-level facet value when one
// exists, otherwise every India city value in its locations facet.
function findWorkdayIndiaFacets(facets: any[]): Record<string, string[]> | null {
  const cityMatches: Record<string, string[]> = {};
  const walk = (list: any[], parentParam: string | null) => {
    for (const facet of Array.isArray(list) ? list : []) {
      const param = facet?.facetParameter || parentParam;
      for (const value of Array.isArray(facet?.values) ? facet.values : []) {
        if (value?.facetParameter) { walk([value], value.facetParameter); continue; }
        const id = String(value?.id || "");
        const descriptor = String(value?.descriptor || "");
        if (!param || !id) continue;
        if (id === WORKDAY_INDIA_ID || /^india$/i.test(descriptor.trim())) {
          throw { found: { [param]: [id] } };
        }
        if (/location/i.test(param) && INDIA_PLACE_RE.test(descriptor)) {
          (cityMatches[param] ||= []).push(id);
        }
      }
    }
  };
  try { walk(facets, null); } catch (signal: any) { if (signal?.found) return signal.found; throw signal; }
  const params = Object.keys(cityMatches);
  if (!params.length) return null;
  const best = params.sort((a, b) => cityMatches[b].length - cityMatches[a].length)[0];
  return { [best]: cityMatches[best].slice(0, 50) };
}
async function fetchWorkdayJobs(token: string, cursor: string | null): Promise<{ rows: any[]; nextCursor: string; diagnostics: string }> {
  const wd = parseWorkdayToken(token);
  const first = await workdaySearch(wd.base, { appliedFacets: {}, limit: 1, offset: 0, searchText: "" });
  const indiaFacets = findWorkdayIndiaFacets(first?.facets || []);
  let start = Number.parseInt(String(cursor || "0"), 10);
  if (!Number.isSafeInteger(start) || start < 0 || start >= WORKDAY_QUERIES.length) start = 0;
  const queries = Array.from({ length: WORKDAY_QUERIES_PER_RUN }, (_, i) => WORKDAY_QUERIES[(start + i) % WORKDAY_QUERIES.length]);
  const postings = new Map<string, any>();
  for (const query of queries) {
    for (let page = 0; page < WORKDAY_PAGES_PER_QUERY; page++) {
      const result = await workdaySearch(wd.base, {
        appliedFacets: indiaFacets || {},
        limit: 20,
        offset: page * 20,
        searchText: indiaFacets ? query : query + " India",
      });
      const list = Array.isArray(result?.jobPostings) ? result.jobPostings : [];
      for (const posting of list) {
        const path = String(posting?.externalPath || "");
        if (!path || postings.has(path)) continue;
        const loc = String(posting?.locationsText || "");
        // With an India facet every result is in India. Without one, keep clear
        // India locations and multi-location roles (checked again after detail fetch).
        if (!indiaFacets && !INDIA_PLACE_RE.test(loc) && !/\d+\s+locations?/i.test(loc)) continue;
        postings.set(path, posting);
      }
      if (list.length < 20) break;
    }
  }
  // Only fetch details for titles that could plausibly be early-career roles.
  const candidates = [...postings.values()]
    .filter((p: any) => classifyExperience({ title: String(p?.title || ""), description: "" }, { titleOnly: true }) !== null)
    .slice(0, WORKDAY_DETAILS_PER_RUN);
  const rows: any[] = [];
  for (let i = 0; i < candidates.length; i += 6) {
    const batch = candidates.slice(i, i + 6);
    const details = await Promise.all(batch.map(async (posting: any) => {
      try {
        const response = await fetch(wd.base + posting.externalPath, {
          headers: { "Accept": "application/json", "Accept-Language": "en-US", "User-Agent": "AldovraJobDiscovery/1.0" },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) return null;
        const detail = await response.json();
        return { ...detail, _tenant: wd.tenant, _externalPath: posting.externalPath, _locationsText: posting.locationsText };
      } catch { return null; }
    }));
    rows.push(...details.filter(Boolean));
  }
  return {
    rows,
    nextCursor: String((start + WORKDAY_QUERIES_PER_RUN) % WORKDAY_QUERIES.length),
    diagnostics: "facet=" + (indiaFacets ? Object.keys(indiaFacets)[0] : "none") + " postings=" + postings.size + " candidates=" + candidates.length + " details=" + rows.length,
  };
}

/* ---------------- Aggregator APIs (activate when keys exist) ---------------- */
const AGGREGATOR_QUERIES = ["fresher", "graduate trainee", "internship", "entry level", "junior developer", "trainee engineer", "associate software engineer", "campus hiring", "junior data analyst", "intern software"];
const AGGREGATOR_QUERIES_PER_RUN = 3;
async function fetchAdzunaJobs(cursor: string | null): Promise<{ rows: any[]; nextCursor: string; skippedReason?: string }> {
  const appId = Deno.env.get("ADZUNA_APP_ID");
  const appKey = Deno.env.get("ADZUNA_APP_KEY");
  if (!appId || !appKey) return { rows: [], nextCursor: String(cursor || "0"), skippedReason: "awaiting ADZUNA_APP_ID / ADZUNA_APP_KEY secrets" };
  let start = Number.parseInt(String(cursor || "0"), 10);
  if (!Number.isSafeInteger(start) || start < 0 || start >= AGGREGATOR_QUERIES.length) start = 0;
  const rows: any[] = [];
  for (let i = 0; i < AGGREGATOR_QUERIES_PER_RUN; i++) {
    const query = AGGREGATOR_QUERIES[(start + i) % AGGREGATOR_QUERIES.length];
    for (const page of [1, 2]) {
      const url = "https://api.adzuna.com/v1/api/jobs/in/search/" + page +
        "?app_id=" + encodeURIComponent(appId) + "&app_key=" + encodeURIComponent(appKey) +
        "&results_per_page=50&max_days_old=21&sort_by=date&what=" + encodeURIComponent(query);
      const response = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("Adzuna returned HTTP " + response.status);
      const payload = await response.json();
      const results = Array.isArray(payload?.results) ? payload.results : [];
      rows.push(...results);
      if (results.length < 50) break;
    }
  }
  return { rows, nextCursor: String((start + AGGREGATOR_QUERIES_PER_RUN) % AGGREGATOR_QUERIES.length) };
}
async function fetchJoobleJobs(cursor: string | null): Promise<{ rows: any[]; nextCursor: string; skippedReason?: string }> {
  const key = Deno.env.get("JOOBLE_API_KEY");
  if (!key) return { rows: [], nextCursor: String(cursor || "0"), skippedReason: "awaiting JOOBLE_API_KEY secret" };
  let start = Number.parseInt(String(cursor || "0"), 10);
  if (!Number.isSafeInteger(start) || start < 0 || start >= AGGREGATOR_QUERIES.length) start = 0;
  const rows: any[] = [];
  for (let i = 0; i < AGGREGATOR_QUERIES_PER_RUN; i++) {
    const query = AGGREGATOR_QUERIES[(start + i) % AGGREGATOR_QUERIES.length];
    const response = await fetch("https://jooble.org/api/" + encodeURIComponent(key), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
      body: JSON.stringify({ keywords: query, location: "India", page: "1" }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("Jooble returned HTTP " + response.status);
    const payload = await response.json();
    rows.push(...(Array.isArray(payload?.jobs) ? payload.jobs : []));
  }
  return { rows, nextCursor: String((start + AGGREGATOR_QUERIES_PER_RUN) % AGGREGATOR_QUERIES.length) };
}
function formatInr(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value >= 100000) return "₹" + (value / 100000).toFixed(value >= 1000000 ? 0 : 1).replace(/\.0$/, "") + " LPA";
  return "₹" + Math.round(value).toLocaleString("en-IN");
}

function isFresherEligibleJob(job: { title?: string | null; description?: string | null }) {
  return classifyExperience(job) === "fresher";
}
// Early-career roles that rarely say "fresher" in the title but carry no
// experience requirement (e.g. "Software Engineer", "Data Analyst").
const GENERIC_EARLY_TITLE = /\b(software (?:development )?engineer|software developer|developer|programmer|analyst|data engineer|qa engineer|test engineer|quality engineer|support engineer|technical support|customer support|consultant|engineer|executive|coordinator|representative)\b/i;
const LEVEL_MARKER = /\b(ii|iii|iv|2|3|4|5|sr\.?|senior|staff|principal|lead|manager|head|director|architect|expert|specialist|vp|avp|officer|supervisor)\b/i;
const STRONG_EXPERIENCE_PHRASE = /\b(?:extensive|proven|significant|substantial|solid|deep|demonstrated) (?:hands-on )?(?:experience|track record|expertise)\b|\bexperienced (?:professional|engineer|developer|candidate)\b/i;
// Returns "fresher" for explicit fresher/intern/graduate signals, "Entry level"
// for generic early-career titles with no experience requirement, else null.
function classifyExperience(job: { title?: string | null; description?: string | null }, opts: { titleOnly?: boolean } = {}): "fresher" | "Entry level" | null {
  const title = String(job.title ?? "").replace(/<[^>]*>/g, " ");
  const description = String(job.description ?? "").replace(/<[^>]*>/g, " ");
  if (legacyFresherSignal(title, description)) return "fresher";
  if (legacyExperienceRejected(title, description)) return null;
  if (!GENERIC_EARLY_TITLE.test(title) || LEVEL_MARKER.test(title)) return null;
  if (opts.titleOnly) return "Entry level";
  const plain = description.replace(/\s+/g, " ").trim();
  if (plain.length < 300 || STRONG_EXPERIENCE_PHRASE.test(plain)) return null;
  return "Entry level";
}
function normalizeExperienceText(text: string) {
  return text.replace(/\byears?\s*\(\s*s\s*\)/gi, "years").replace(/\byrs?\s*\(\s*s\s*\)/gi, "yrs");
}
function legacyExperienceRejected(rawTitle: string, rawDescription: string) {
  const title = normalizeExperienceText(rawTitle);
  const text = normalizeExperienceText((rawTitle + " " + rawDescription).replace(/\s+/g, " ").trim());
  const positiveRange = /\b([1-9]\d*)\s*(?:-|–|to)\s*([1-9]\d*)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const positivePlus = /\b[1-9]\d*\s*\+\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  const positiveYears = /\b(?:minimum|min\.?|at least|over|more than|must have|required minimum of)\s*(?:of\s*)?[1-9]\d*\s*(?:\+\s*)?(?:years?|yrs?)\b/i;
  // "0-1 years of experience" / "0 to 2 years" are fresher-friendly ranges, not requirements.
  const yearsExperience = /(?<!\b0\s*(?:-|–|to)\s*)\b[1-9]\d*\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?(?:experience|exp)\b/i;
  // Labelled requirements such as "Years of Experience: 1 to 3 years" or "Experience: 2+ yrs".
  const labelledYears = /\b(?:years? of (?:relevant |work |professional |total )?experience|(?:total |work |relevant )?experience(?: required)?)\s*[:\-–]\s*(?:minimum\s*|min\.?\s*|at least\s*)?[1-9]\d*\s*(?:\+|(?:-|–|to)\s*\d+)?\s*(?:years?|yrs?)?\b/i;
  const seniorTitle = /\b(senior|sr\.?|staff|principal|lead|team leader|team lead|manager|director|head|chief|vice president|architect|mid[- ]level|engineer iii|engineer iv|engineer v|level 3|level 4|level 5)(?=\b|\s|$)/i;
  return positiveRange.test(text) || positivePlus.test(text) || positiveYears.test(text) || yearsExperience.test(text) || labelledYears.test(text) || seniorTitle.test(title);
}
function legacyFresherSignal(rawTitle: string, rawDescription: string) {
  if (legacyExperienceRejected(rawTitle, rawDescription)) return false;
  return legacyFresherSignalUnchecked(rawTitle, rawDescription);
}
function legacyFresherSignalUnchecked(rawTitle: string, rawDescription: string) {
  const title = rawTitle;
  const description = rawDescription;
  const text = (title + " " + description).replace(/\s+/g, " ").trim();
  // Experience-requirement rejection happens in legacyExperienceRejected().
  // Include common Indian campus/early-career title variants used by employer boards.
  // The explicit experience-requirement checks above still take precedence.
  const titleSignal = /\b(fresher|freshers|intern|internship|graduate(?:\s+engineer)?\s+trainee|graduate trainee|management trainee|trainee|new grad(?:uate)?|entry[- ]level|junior(?:\s+[a-z][a-z0-9+#.-]*){0,3}|associate(?: engineer| developer| analyst)?|engineer\s+i|software engineer\s+i|developer\s+i|analyst\s+i|university graduate|campus hire|campus hiring|graduate program|graduate programme|early careers? program|apprentice|apprenticeship)\b/i.test(title);
  const noExperienceSignal = /\b(no experience required|no prior experience required|without prior experience|0 years? of experience|zero years? of experience|fresh graduates? (?:are )?welcome|suitable for freshers|open to freshers|recent graduates? encouraged|campus recruitment|early career program|early careers program)\b/i.test(text) || /\bfresh graduates?\b/i.test(text) || /\b0\s*(?:-|–|to)\s*[12]\s*(?:years?|yrs?)\b/i.test(normalizeExperienceText(text));
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
    listingUrls:["https://careers.capgemini.com/search/?q=&locationsearch=India&searchResultView=LIST","https://careers.capgemini.com/search/?q=intern&locationsearch=India&searchResultView=LIST","https://careers.capgemini.com/search/?q=graduate&locationsearch=India&searchResultView=LIST"],
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
      "https://careers.hcltech.com/search-results/?q=&locationsearch=India&searchResultView=LIST",
      "https://careers.hcltech.com/search-results/?q=graduate&locationsearch=India&searchResultView=LIST",
      "https://careers.hcltech.com/go/India/9553955/?_wrapper_format=html&page=0",
      "https://careers.hcltech.com/job/Campus-Beginner/168116-en_US",
      "https://careers.hcltech.com/job/Campus-Beginner/154178-en_US",
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
  // Some legacy career portals build application links in JavaScript rather than anchors.
  // Recover only the official Tech Mahindra JobDetails route and still validate host + query.
  if(cfg.company.toLowerCase()==="tech mahindra"){
    for(const m of html.matchAll(/JobDetails[.]aspx[?][^"' \t\r\n<>]+/gi)){
      const raw=safeDecodeHtml(m[0]).replace(/[),;]+$/,"");
      let target:URL;try{target=new URL(raw,pageUrl);}catch{continue;}
      if(!isOfficialHost(target.href,cfg)||!officialJobLinkLooksRelevant(target,cfg.company,listing,cfg))continue;
      const url=target.href.split("#")[0];if(seen.has(url))continue;seen.add(url);
      const indiaPage=String(pageUrl).toLowerCase();const indiaFiltered=/locationsearch=India/i.test(indiaPage)||indiaPage.includes("/india-en/")||indiaPage.includes("/go/india/");
      out.push({url,anchorTitle:cfg.company,context:"",location:indiaFiltered?"India":""});
    }
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
        const r=await fetch(url,{headers:{"Accept":"text/html,application/xhtml+xml,application/ld+json;q=0.9,*/*;q=0.8","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36","Accept-Language":"en-IN,en;q=0.9,en-US;q=0.8"},signal:AbortSignal.timeout(11000)});
        lastStatus=r.status;
        if(r.ok)return{url:r.url||url,requestedUrl:url,html:await r.text(),status:r.status};
        if(![429,500,502,503,504].includes(r.status))break;
      }catch{lastStatus=0;}
    }
    return{url,html:"",status:lastStatus};
  }));
  const valid=pages.filter(p=>p.html.length>500);
  if(!valid.length){const code=pages.map(p=>p.status).find(n=>n)||"network/timeout";throw new Error("Official careers page unavailable (HTTP "+code+")");}
  const jobs:any[]=[],seen=new Set<string>(),links:any[]=[];
  for(const page of valid){
    // Direct official job-detail URLs may expose schema.org microdata instead of JSON-LD.
    if(isOfficialJobDetailUrl(page.requestedUrl||page.url,cfg)){
      const microdataTitle=page.html.match(/itemprop=["']title["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||"";const title=cleanText(microdataTitle,240)||fallbackOfficialJobTitle(page.html,cfg.company);
      const start=page.html.search(/<div class=["']jobColumnOne["']/i);const end=page.html.search(/<div class=["']jobColumnTwo["']/i);const shell=start>=0?page.html.slice(start,end>start?end:start+30000):page.html.slice(0,30000);
      const description=cleanText(shell,6000);
      const location=inferOfficialIndiaLocation(page.html);
      if(title&&description.length>80&&location&&isFresherEligibleJob({title,description})){
        const directJob={id:page.url,title,description,location,applyUrl:page.url,employmentType:/intern|internship/i.test(title)?"Internship":null};
        const key=String(directJob.id||directJob.applyUrl);if(!seen.has(key)){seen.add(key);jobs.push(directJob);}
      }
    }
    for(const job of collectJobPostingJsonLd(page.html,page.url)){const indiaPage=String(page.requestedUrl||page.url).toLowerCase();const indiaFiltered=/locationsearch=India/i.test(indiaPage)||indiaPage.includes("/india-en/")||indiaPage.includes("/go/india/");if(indiaFiltered&&!inferOfficialIndiaLocation(String(job.location||"")))job.location="India";if(!job.title||!job.description||!job.applyUrl||!isOfficialJobDetailUrl(job.applyUrl,cfg)||!isOfficialHost(job.applyUrl,cfg))continue;const key=String(job.id||job.applyUrl);if(!seen.has(key)){seen.add(key);jobs.push(job);}}
    for(const link of extractOfficialJobLinks(page.html,page.url,cfg)){const indiaPage=String(page.requestedUrl||page.url).toLowerCase();const indiaFiltered=/locationsearch=India/i.test(indiaPage)||indiaPage.includes("/india-en/")||indiaPage.includes("/go/india/");if(indiaFiltered&&!inferOfficialIndiaLocation(String(link.location||"")))link.location="India";if(links.length<100&&!links.some(x=>x.url===link.url))links.push(link);}
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
        const r=await fetch(url,{headers:{"Accept":"application/xml,text/xml,text/plain,text/html;q=0.8,*/*;q=0.5","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36","Accept-Language":"en-IN,en;q=0.9,en-US;q=0.8"},signal:AbortSignal.timeout(9000)});
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

  const listingPriority=(link:any)=>/\b(intern|internship|fresher|freshers|graduate|trainee|entry[- ]level|new grad(?:uate)?|apprentice(?:ship)?|associate (?:engineer|developer|analyst))\b/i.test(String(link.anchorTitle||"")+" "+cleanText(safeDecodeHtml(String(link.context||"")).replace(/<[^>]*>/g," "),3000))?0:1;const pending=links.filter(link=>!jobs.some(job=>String(job.applyUrl||"").split("#")[0]===link.url)).sort((a,b)=>listingPriority(a)-listingPriority(b)).slice(0,30);
  const detailDiagnostics={attempted:0,httpOk:0,httpFailures:0,emptyTitles:0,shortDescriptions:0,jsonLd:0};
  for(let offset=0;offset<pending.length;offset+=6){
    const batch=pending.slice(offset,offset+6);
    const details=await Promise.all(batch.map(async link=>{
      detailDiagnostics.attempted++;
      try{
        let r:Response|null=null;
        for(let attempt=0;attempt<2;attempt++){
          try{
            r=await fetch(link.url,{headers:{"Accept":"text/html,application/xhtml+xml,application/ld+json;q=0.9,*/*;q=0.8","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36","Accept-Language":"en-IN,en;q=0.9,en-US;q=0.8"},signal:AbortSignal.timeout(8000)});
            if(r.ok||![429,500,502,503,504].includes(r.status))break;
          }catch{if(attempt===1)return null;}
        }
        if(!r?.ok){detailDiagnostics.httpFailures++;return null;}detailDiagnostics.httpOk++;const html=await r.text(),jsonJobs=collectJobPostingJsonLd(html,link.url);if(jsonJobs.length){detailDiagnostics.jsonLd++;return jsonJobs[0];}
        const title=fallbackOfficialJobTitle(html,link.anchorTitle);
        const description=readHtmlMeta(html,"description")||readHtmlMeta(html,"og:description","property")||cleanText(html,6000);
        const locationFromUrl=inferOfficialIndiaLocation(new URL(link.url).pathname);
        const plain=safeDecodeHtml(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ");
        const labelled=plain.match(/(?:job\s+location|primary\s+location|location|city)\s*[:\-–]\s*([^\n|]{2,100})/i)?.[1]||"";
        let location=cleanText(link.location||"",240)||inferOfficialIndiaLocation(link.context)||locationFromUrl||inferOfficialIndiaLocation(labelled);if(!location){const visibleJobHeader=plain.slice(0,2600);location=inferOfficialIndiaLocation(visibleJobHeader);}
        if(!title||/^(careers|job search|search jobs|view job|apply now|access denied|just a moment)$/i.test(title)){detailDiagnostics.emptyTitles++;return null;}if(description.length<80){detailDiagnostics.shortDescriptions++;return null;}
        return{id:link.url,title,description,location,applyUrl:link.url,employmentType:/intern|internship/i.test(title)?"Internship":null};
      }catch{return null;}
    }));
    for(let i=0;i<details.length;i++){let job=details[i];const link=batch[i];if(!job?.title||!job?.description||!job?.applyUrl){const title=cleanText(link.anchorTitle,240);const contextText=cleanText(safeDecodeHtml(String(link.context||"")).replace(/<[^>]*>/g," "),3000);const contextLocation=inferOfficialIndiaLocation(contextText)||cleanText(link.location||"",240);if(title&&contextLocation&&/india|hyderabad|bengaluru|bangalore|chennai|pune|gurugram|gurgaon|noida|mumbai|kochi|coimbatore/i.test(contextLocation)&&isFresherEligibleJob({title,description:contextText})){job={id:link.url,title,description:("Official employer listing. "+title+". "+contextText+" Full role details and application are available on the official employer page.").slice(0,6000),location:contextLocation,applyUrl:link.url,employmentType:/intern|internship/i.test(title)?"Internship":null};}}if(!job?.title||!job?.description||!job?.applyUrl)continue;const key=String(job.id||job.applyUrl);if(!seen.has(key)){seen.add(key);jobs.push(job);}}
  }
  if(!jobs.length&&cfg.company.toLowerCase()==="capgemini"&&links.length>0&&!links.some(link=>/india|hyderabad|secunderabad|bengaluru|bangalore|chennai|pune|mumbai|gurugram|gurgaon|noida/i.test(String(link.location||""))&&listingPriority(link)===0))return [];
  if(!jobs.length&&cfg.company.toLowerCase()==="tech mahindra"){
    const cards:any[]=[];
    for(const page of valid){
      const matches=[...page.html.matchAll(/<input\b[^>]*name=["'][^"']*HdnJobCode["'][^>]*value=["']([^"']+)["'][^>]*>/gi)];
      for(let i=0;i<matches.length;i++){
        const m=matches[i],end=i+1<matches.length?(matches[i+1].index??page.html.length):Math.min(page.html.length,(m.index??0)+4000);
        const chunk=page.html.slice(m.index??0,end);
        const title=cleanText(chunk.match(/<div[^>]*font-size:\s*13px[^>]*>([\s\S]*?)<\/div>/i)?.[1]||"",240);
        const location=cleanText(chunk.match(/<b>\s*Location\s*<\/b>\s*:\s*([^<\r\n]+)/i)?.[1]||"",240);
        const experience=cleanText(chunk.match(/<b>\s*Experience\s*<\/b>\s*:\s*([^<\r\n]+)/i)?.[1]||"",120);
        const description=cleanText(chunk+" Experience: "+experience,3000);
        if(title)cards.push({title,location,experience,description});
      }
    }
    const eligibleCards=cards.filter(card=>isIndiaEligibleJob({location:card.location,description:card.description})&&isFresherEligibleJob({title:card.title,description:card.description}));
    if(cards.length>0&&!eligibleCards.length)return [];
    if(eligibleCards.length>0)throw new Error("Found "+eligibleCards.length+" India fresher card(s), but the official portal generates detail URLs through form postback; no guessed apply URLs were published.");
  }
  if(!jobs.length)throw new Error("No official job details parsed (listingPages="+valid.length+", detailLinks="+links.length+", sitemapDetails="+discoveredJobUrls.length+", detailAttempts="+detailDiagnostics.attempted+", httpOk="+detailDiagnostics.httpOk+", httpFailures="+detailDiagnostics.httpFailures+", emptyTitles="+detailDiagnostics.emptyTitles+", shortDescriptions="+detailDiagnostics.shortDescriptions+", jsonLd="+detailDiagnostics.jsonLd+"). Source remains enabled; no job records were changed.");
  return jobs;
}

async function validatePublicBoard(provider: string, boardToken: string): Promise<{ error?: string; rows?: any[]; sample_titles?: string[] }> {
  if (provider === "workday") {
    const result = await fetchWorkdayJobs(boardToken, "0");
    return { rows: result.rows, sample_titles: result.rows.slice(0, 5).map((row: any) => cleanText(row?.jobPostingInfo?.title, 160)).filter(Boolean),
      error: result.rows.length ? undefined : "Workday site reachable but no India early-career roles found right now (" + result.diagnostics + ")." };
  }
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
    return json({ success: true, auth: "cron", function_version: 98 });
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
    if (!["greenhouse", "lever", "ashby", "smartrecruiters", "official_careers", "remoteok", "himalayas", "workday"].includes(String(provider))) return json({ error: "Unsupported provider" }, 400);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(boardToken)) return json({ error: "Invalid board token format" }, 400);
    if (provider === "workday" && !/^[A-Za-z0-9-]+__wd\d{1,3}__[A-Za-z0-9_-]+$/.test(boardToken)) return json({ error: "Workday token must look like tenant__wd5__SiteName (from the company's myworkdayjobs.com URL)." }, 400);
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
    .select("id,provider,board_token,company_name,last_synced_at,cursor_token,last_sync_status").eq("enabled", true)
    .order("last_synced_at", { ascending: true, nullsFirst: true }).limit(100);
  if (sourceError) return json({ error: "Could not load approved sources" }, 500);
  if (!sources?.length) return json({ success: true, message: "No approved job sources are enabled yet.", sources_checked: 0, imported: 0, skipped: 0 });
  const indiaFirstCompanies = new Set(["phonepe", "freshworks", "servicenow", "bosch group", "jitterbit", "razorpay", "swiggy", "zoho", "paytm", "meesho", "flipkart", "zerodha", "groww", "cred", "dream11", "infosys", "tcs", "wipro", "hcltech", "tech mahindra", "browserstack", "chargebee", "juspay", "darwinbox", "storable india", "redwood software", "accordion india", "zenoti", "doordash india", "tide", "sarvam", "100ms", "capgemini", "cognizant", "hevo data", "weekday", "famapp", "sprinto", "drivetrain", "ahead", "commure", "certifyos", "almabase", "aiprise", "cartesia", "zeta"]);
  const repairFirstCompanies = new Set(["capgemini", "hcltech", "tech mahindra"]);
  const selectedSources = [...sources].sort((a: any, b: any) => {
    const aRepairCooldownElapsed = !a.last_synced_at || Date.now() - Date.parse(a.last_synced_at) > 6 * 60 * 60 * 1000;
    const bRepairCooldownElapsed = !b.last_synced_at || Date.now() - Date.parse(b.last_synced_at) > 6 * 60 * 60 * 1000;
    const aNeedsRepair = repairFirstCompanies.has(String(a.company_name ?? "").toLowerCase()) && aRepairCooldownElapsed && /error|partial/i.test(String(a.last_sync_status ?? "")) ? 1 : 0;
    const bNeedsRepair = repairFirstCompanies.has(String(b.company_name ?? "").toLowerCase()) && bRepairCooldownElapsed && /error|partial/i.test(String(b.last_sync_status ?? "")) ? 1 : 0;
    if (aNeedsRepair !== bNeedsRepair) return bNeedsRepair - aNeedsRepair;
    const at = a.last_synced_at ? Date.parse(a.last_synced_at) : 0;
    const bt = b.last_synced_at ? Date.parse(b.last_synced_at) : 0;
    if (at !== bt) return at - bt;
    const ai = indiaFirstCompanies.has(String(a.company_name ?? "").toLowerCase()) ? 1 : 0;
    const bi = indiaFirstCompanies.has(String(b.company_name ?? "").toLowerCase()) ? 1 : 0;
    return bi - ai || String(a.company_name ?? "").localeCompare(String(b.company_name ?? ""));
  }).slice(0, 5);
  const { data: skills, error: skillsError } = await admin.from("skills").select("id,name").limit(1000);
  if (skillsError) return json({ error: "Could not load skill catalogue" }, 500);
  const skillRows = (skills ?? []).filter((s: any) => String(s.name ?? "").trim().length >= 2);
  let imported = 0, skipped = 0, checked = 0, deactivated = 0;
  const errors: string[] = [];
  const sourceResults: any[] = [];

  for (const source of selectedSources) {
    checked++;
    const sourceErrorStart = errors.length;
    let sourceFetchedCount = 0, sourceCandidateCount = 0, sourceProcessedCount = 0;
    let sourceDetailFailures = 0, sourceSaveFailures = 0, sourceImportedCount = 0;
    const sourceSkipReasons: Record<string, number> = {};
    const rejectionSamples: Array<{ reason: string; title: string }> = [];
    const recordSkip = (reason: string, title = "") => { sourceSkipReasons[reason] = (sourceSkipReasons[reason] || 0) + 1; if (rejectionSamples.length < 5) rejectionSamples.push({ reason, title: cleanText(title, 90) }); };
    let sourceSkippedStart = skipped;
    const CURSOR_PROVIDERS = ["smartrecruiters", "greenhouse", "ashby", "workday", "adzuna", "jooble"];
    let sourceNextCursor: string | null = CURSOR_PROVIDERS.includes(source.provider) ? (source.cursor_token || "0") : null;
    let sourceDiagnostics = "";
    let awaitingKey = "";
    try {
      let rows: any[] = [];
      let feedComplete = false;
      if (source.provider === "official_careers") {
        rows = await fetchOfficialCareerJobs(source.board_token);
      } else if (source.provider === "workday") {
        const result = await fetchWorkdayJobs(source.board_token, source.cursor_token);
        rows = result.rows; sourceNextCursor = result.nextCursor; sourceDiagnostics = result.diagnostics;
      } else if (source.provider === "adzuna" || source.provider === "jooble") {
        const result = source.provider === "adzuna" ? await fetchAdzunaJobs(source.cursor_token) : await fetchJoobleJobs(source.cursor_token);
        rows = result.rows; sourceNextCursor = result.nextCursor; awaitingKey = result.skippedReason || "";
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
      sourceFetchedCount = rows.length;
      const sourceNotIndiaCount = source.provider === "smartrecruiters" ? 0 : rows.filter((raw: any) => !isIndiaEligibleJob(normalize(source, raw))).length;
      const sourceAshbyUnlistedCount = source.provider === "ashby" ? rows.filter((raw: any) => raw?.isListed === false).length : 0;
      if (sourceNotIndiaCount) sourceSkipReasons.not_india_before_processing = sourceNotIndiaCount;
      if (sourceAshbyUnlistedCount) sourceSkipReasons.ashby_unlisted = sourceAshbyUnlistedCount;
      const candidateRows = rows
        .filter((raw: any) => source.provider !== "ashby" || raw?.isListed !== false)
        .filter((raw: any) => source.provider === "smartrecruiters" || isIndiaEligibleJob(normalize(source, raw)))
        .filter((raw: any) => source.provider !== "himalayas" || isHimalayasIndiaEligible(raw))
        .sort((a: any, b: any) => {
          // Prefer clearly entry-level/graduate/intern titles before general postings;
          // keep the existing India location priority as the secondary ordering.
          const aFresherTitle = isFresherEligibleJob({ title: normalize(source, a).title, description: "" }) ? 1 : 0;
          const bFresherTitle = isFresherEligibleJob({ title: normalize(source, b).title, description: "" }) ? 1 : 0;
          return bFresherTitle - aFresherTitle || indiaPriority(b) - indiaPriority(a);
        });
      sourceCandidateCount = candidateRows.length;
      // Keep SmartRecruiters detail lookups bounded. Rotate through candidate rows so
      // each scheduled run continues after the previous batch instead of repeating the first 15.
      let processingRows = candidateRows.slice(0, 150);
      if (["smartrecruiters", "greenhouse", "ashby"].includes(source.provider)) {
        let offset = Number.parseInt(String(source.cursor_token || "0"), 10);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset >= candidateRows.length) offset = 0;
        const batchSize = source.provider === "smartrecruiters" ? 15 : 150;
        processingRows = candidateRows.slice(offset, offset + batchSize);
        sourceNextCursor = offset + processingRows.length >= candidateRows.length ? "0" : String(offset + processingRows.length);
      }
      if (source.provider === "official_careers" && rows.length > 0 && candidateRows.length === 0) {
        sourceFailureCount++;
        const sample=normalize(source,rows[0]||{});errors.push(source.company_name + ": no India location parsed; sampleTitle=" + cleanText(sample.title,48) + "; sampleLoc=" + cleanText(sample.location,40) + "; rows=" + rows.length);
      }
      for (const raw of processingRows) {
        sourceProcessedCount++;
        if (source.provider === "ashby" && raw?.isListed === false) { skipped++; recordSkip("ashby_unlisted", String(raw?.title || "")); continue; }
        let row = raw;
        if (source.provider === "smartrecruiters") {
          const detailResponse = await fetch("https://api.smartrecruiters.com/v1/companies/" + encodeURIComponent(source.board_token) + "/postings/" + encodeURIComponent(String(raw.id || raw.uuid || "")), {
            headers: { "Accept": "application/json", "User-Agent": "AldovraJobDiscovery/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          if (!detailResponse.ok) {
            skipped++;
            recordSkip("smartrecruiters_detail_http_" + detailResponse.status, String(raw?.name || raw?.title || ""));
            sourceDetailFailures++;
            sourceFailureCount++;
            errors.push(source.company_name + ": SmartRecruiters detail returned HTTP " + detailResponse.status);
            continue;
          }
          row = await detailResponse.json();
        }
        const job = normalize(source, row);
        if (!isIndiaEligibleJob(job)) { skipped++; recordSkip("not_india_after_normalize", job.title); continue; }
        // Reject generic page headings instead of publishing them as job titles.
        // Official career parsers sometimes encounter templates headed "Job Details";
        // these are not a usable title and must not reach student-facing listings.
        if (/^(careers?|job search|search jobs|career opportunities|job details?|job information|job description|job posting|job overview|position details|view job|apply now|job opportunity|untitled)$/i.test(String(job.title || "").trim())) {
          skipped++;
          recordSkip("generic_title", job.title);
          sourceFailureCount++;
          errors.push(source.company_name + ": skipped a generic page title; parser needs a real role title");
          continue;
        }
        // Publish only jobs with a positive fresher/graduate signal and no explicit
        // multi-year experience requirement. Unknown experience is not treated as fresher.
        const level = classifyExperience(job);
        const isAggregator = source.provider === "adzuna" || source.provider === "jooble";
        // Aggregators only give short snippets, so they must carry an explicit fresher signal.
        if (!level || (isAggregator && level !== "fresher")) { skipped++; recordSkip("not_fresher_signal_or_experience_required", job.title); continue; }
        job.experience = level;
        if (isAggregator) {
          // Skip aggregator copies of roles we already list straight from the employer.
          const { data: existingCopy } = await admin.from("opportunities").select("id")
            .eq("active", true).ilike("company_name", job.company).ilike("title", job.title)
            .neq("source_provider", source.provider).limit(1);
          if (existingCopy && existingCopy.length) { skipped++; recordSkip("duplicate_of_employer_listing", job.title); continue; }
        }
        if (!job.externalId || !job.title || !job.url || !job.description) {
          skipped++;
          recordSkip("missing_required_fields", job.title);
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
            posting_date: extractPostingDate(source, row),
            salary_text: (job as any).salary || null,
          },
          p_skill_ids: matchedSkills.map((s: any) => Number(s.id)),
        });
        if (atomicSaveError || !savedId) {
          skipped++;
          recordSkip("atomic_save_failed", job.title);
          sourceSaveFailures++;
          sourceFailureCount++;
          const saveReason = atomicSaveError?.message ? " (" + String(atomicSaveError.message).slice(0, 120) + ")" : "";
          errors.push(source.company_name + ": atomic job/skill save failed" + saveReason);
          continue;
        }
        imported++; sourceCount++; sourceImportedCount++;
      }
      // Reconcile active records against the full provider feed; never use age alone.
      // Importing the top 150 is a throughput cap, not the set of jobs still live.
      if (["official_careers", "remoteok", "himalayas", "jobicy", "workday", "adzuna", "jooble"].includes(source.provider)) {
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
      const sourceStatus = awaitingKey ? ("awaiting API key: " + awaitingKey) : sourceFailureCount > 0
        ? ("partial: " + errors.slice(sourceErrorStart).join(" | ").slice(0, 150))
        : sourceCount === 0
          ? ("no eligible fresher jobs (processed " + sourceProcessedCount + ", candidates " + sourceCandidateCount + (sourceDiagnostics ? ", " + sourceDiagnostics : "") + ")")
          : "success" + (sourceDiagnostics ? " (" + sourceDiagnostics + ")" : "");
      const sourceUpdate: Record<string, unknown> = {
        last_synced_at: new Date().toISOString(),
        last_sync_status: sourceStatus,
        last_sync_count: sourceCount, updated_at: new Date().toISOString(),
      };
      if (CURSOR_PROVIDERS.includes(source.provider)) sourceUpdate.cursor_token = sourceNextCursor;
      const { error: sourceUpdateError } = await admin.from("job_sources").update(sourceUpdate).eq("id", source.id);
      if (sourceUpdateError) errors.push(source.company_name + ": failed to persist source sync state");
      sourceResults.push({ provider: source.provider, company: source.company_name, fetched: sourceFetchedCount, candidates: sourceCandidateCount, processed: sourceProcessedCount, imported: sourceImportedCount, skipped: (skipped - sourceSkippedStart) + Math.max(0, sourceFetchedCount - sourceCandidateCount), deferred: Math.max(0, sourceCandidateCount - sourceProcessedCount), detail_failures: sourceDetailFailures, save_failures: sourceSaveFailures, next_cursor: CURSOR_PROVIDERS.includes(source.provider) ? sourceNextCursor : undefined, diagnostics: sourceDiagnostics || awaitingKey || undefined, feed_complete: feedComplete, skip_reasons: sourceSkipReasons, rejection_samples: rejectionSamples });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown provider error";
      errors.push(source.company_name + ": " + message.slice(0, 180));
      sourceResults.push({ provider: source.provider, company: source.company_name, fetched: sourceFetchedCount, candidates: sourceCandidateCount, processed: sourceProcessedCount, imported: sourceImportedCount, skipped: skipped - sourceSkippedStart, detail_failures: sourceDetailFailures, save_failures: sourceSaveFailures, error: message.slice(0, 180), skip_reasons: sourceSkipReasons, rejection_samples: rejectionSamples });
      await admin.from("job_sources").update({
        last_synced_at: new Date().toISOString(), last_sync_status: "error: " + message.slice(0, 180),
        updated_at: new Date().toISOString(),
      }).eq("id", source.id);
    }
  }
  return json({ success: errors.length === 0, function_version: 98, sources_checked: checked, imported, skipped, deactivated, source_results: sourceResults, errors });
});
