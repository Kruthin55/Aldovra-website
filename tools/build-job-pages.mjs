#!/usr/bin/env node
/* Builds the public, crawlable job pages under /jobs/ and refreshes sitemap.xml.
   Runs daily from .github/workflows/seo-job-pages.yml (and by hand: `node tools/build-job-pages.mjs`).
   Data: anon RPC public_jobs_feed() (live, posted in the last 30 days, no apply links).
   Filters: the SAME fresher / India functions the student dashboard uses, read straight out of
   assets/dashboard/dash-jobs.js, so the public pages never show a job the dashboard would hide.
   Local test without network: FEED_FILE=path/to/rows.json node tools/build-job-pages.mjs */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://aldovra.com";
const SUPABASE_URL = "https://lgefwfrjzweayfxahogs.supabase.co";
const KEY = "sb_publishable_f4DHvfDfjqLyugXm6iq6JQ__Q72vK9i";
const LOGO_TOKEN = "pk_TpDEg18pTDWBij6DRTkUxQ";
const PER_PAGE = 40;
const THIN = new Set(); // pages with too few jobs: noindex + left out of the sitemap
const GENERATED = new Set(); // list pages that exist (for cross-links)
const MIN_COMBO = 5; // city x role and company pages are only built with at least this many jobs

/* ---------- dashboard filters, extracted from dash-jobs.js ---------- */
function loadDashboardFilters() {
  const s = fs.readFileSync(path.join(ROOT, "assets/dashboard/dash-jobs.js"), "utf8");
  const fnBody = (name) => {
    const i = s.indexOf("function " + name + "(");
    if (i < 0) throw new Error("dash-jobs.js: function " + name + " not found");
    let d = 0;
    for (let k = s.indexOf("{", i); k < s.length; k++) {
      if (s[k] === "{") d++;
      else if (s[k] === "}" && --d === 0) return s.slice(i, k + 1);
    }
    throw new Error("dash-jobs.js: unbalanced " + name);
  };
  const constLine = (name) => {
    const m = s.match(new RegExp("const\\s+" + name + "\\s*=\\s*/.*?/[gimsuy]*;"));
    if (!m) throw new Error("dash-jobs.js: const " + name + " not found");
    return m[0];
  };
  const code = [
    'const norm=v=>String(v||"").trim().toLowerCase();',
    constLine("indiaCompanyPattern"), constLine("indiaLocationPattern"), constLine("indiaRemotePattern"),
    fnBody("isIndiaEligibleJob"), fnBody("jobEligibility"), fnBody("noExperienceEligible"),
    "return {isIndiaEligibleJob,noExperienceEligible};",
  ].join("\n");
  return new Function(code)();
}

/* ---------- groups ---------- */
const CITIES = [
  { slug: "hyderabad", region: "Telangana", name: "Hyderabad", re: /hyderabad|secunderabad|telangana/i, blurb: "HITEC City, Gachibowli and the Financial District make Hyderabad one of India's biggest fresher hiring hubs, with global capability centres in tech, banking, pharma and analytics." },
  { slug: "bengaluru", region: "Karnataka", name: "Bengaluru", re: /bengaluru|bangalore|karnataka|karnātaka/i, blurb: "India's largest tech job market: product companies, global engineering centres and startups hire freshers across software, data, hardware and operations." },
  { slug: "chennai", region: "Tamil Nadu", name: "Chennai", re: /chennai|sriperumbudur/i, blurb: "Chennai and its industrial belt hire freshers in manufacturing, engineering, IT services, finance operations and analytics." },
  { slug: "pune", region: "Maharashtra", name: "Pune", re: /\bpune\b/i, blurb: "Pune mixes IT parks, banking technology centres and automotive engineering, with steady openings for graduates and apprentices." },
  { slug: "mumbai", region: "Maharashtra", name: "Mumbai", re: /mumbai|thane/i, blurb: "Mumbai and Navi Mumbai offer fresher roles in finance, operations, consulting and technology." },
  { slug: "delhi-ncr", region: "Delhi NCR", name: "Delhi NCR", re: /gurugram|gurgaon|noida|delhi|haryana|dlf cyber/i, blurb: "Gurugram, Noida and Delhi host consulting, banking, analytics and operations teams that hire graduates every month." },
  { slug: "kolkata", region: "West Bengal", name: "Kolkata", re: /kolkata|west bengal/i, blurb: "Kolkata has fresher openings in IT services, finance operations and analytics." },
  { slug: "remote", region: "", name: "Remote (India)", re: null, blurb: "Work-from-home roles open to candidates based in India." },
];
const ROLES = [
  { slug: "internships", seo: "Internships & Apprenticeships in India for Students", name: "Internships & apprenticeships", re: /\bintern(ship)?\b|apprentic|co-?op\b|trainee/i, blurb: "Internships, apprenticeships and trainee programmes: the easiest way in for students and recent graduates." },
  { slug: "software-developer", seo: "Software Developer Jobs for Freshers in India", name: "Software developer", re: /software|developer|full[- ]?stack|front[- ]?end|back[- ]?end|\bsde\b|programmer|web |salesforce|java\b|python developer/i, blurb: "Software engineering and developer roles for freshers: full-stack, backend, frontend and platform teams." },
  { slug: "data-science-ai", seo: "Data Science & AI Jobs for Freshers in India", name: "Data science & AI", re: /data scien|machine learning|\bml\b|\bai\b|artificial intelligence|genai|nlp|computer vision|deep learning/i, blurb: "Data science, machine learning and AI roles for graduates with Python, statistics and ML basics." },
  { slug: "data-analyst", seo: "Data Analyst Jobs for Freshers in India", name: "Data analyst", re: /data analy|analytics|business intelligence|\bbi\b|reporting|\bmdm\b|data engineer|data\/information/i, blurb: "Data analyst and data engineering roles that use SQL, Excel, Python and dashboards." },
  { slug: "qa-testing", seo: "QA & Software Testing Jobs for Freshers", name: "QA & testing", re: /\bqa\b|quality assurance|\btest|sdet|validation/i, blurb: "Software testing, QA automation and validation roles." },
  { slug: "cloud-devops", seo: "Cloud, DevOps & IT Jobs for Freshers", name: "Cloud, DevOps & IT", re: /cloud|devops|\bsre\b|site reliability|infrastructure|network|system(s)? admin|storage|backup|security|\bit\b support/i, blurb: "Cloud, DevOps, networking and IT infrastructure roles." },
  { slug: "core-engineering", seo: "Core Engineering Jobs for Freshers (Mechanical, Electrical, ECE)", name: "Core engineering", re: /mechanical|electrical|electronics|hardware|manufactur|\bnpi\b|control systems|asic|vlsi|embedded|quality engineer|engineer - quality|process engineer|application engineer/i, blurb: "Mechanical, electrical, electronics, VLSI and manufacturing engineering roles." },
  { slug: "finance-accounting", seo: "Finance & Accounting Jobs for Freshers in India", name: "Finance & accounting", re: /financ|account|audit|\btax\b|treasury|credit|risk|fraud|\baml\b|kyc|payables|receivables|fund|index analyst|banking/i, blurb: "Finance, accounting, risk, fraud and banking operations roles for commerce and business graduates." },
  { slug: "business-operations", seo: "Business & Operations Jobs for Freshers in India", name: "Business & operations", re: /business analyst|operations|procurement|supply chain|logistics|warehouse|transportation|order|claims|admin|executive assistant|associate|analyst/i, blurb: "Business analyst, operations, supply chain and process roles open to graduates from any stream." },
  { slug: "sales-marketing", seo: "Sales & Marketing Jobs for Freshers in India", name: "Sales, marketing & customer success", re: /sales|marketing|business development|customer success|customer service|presales|account executive|consultant/i, blurb: "Sales, presales, marketing and customer-facing roles." },
  { slug: "design", seo: "UI/UX & Design Jobs for Freshers in India", name: "Design", re: /design(er)?\b(?!.*(asic|engine))|\bux\b|\bui\b|motion/i, blurb: "UI/UX, product, graphic and motion design roles." },
];

/* ---------- helpers ---------- */
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plain = (v) => String(v || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#43;/g, "+").replace(/\s+/g, " ").trim();
const today = new Date();
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const posted = (j) => j.posting_date || String(j.created_at || "").slice(0, 10);
let DOMAINS = {};
function loadDomains() {
  const s = fs.readFileSync(path.join(ROOT, "assets/dashboard/dash-company-domains.js"), "utf8");
  const m = s.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
  try { DOMAINS = m ? Function("return " + m[1])() : {}; } catch { DOMAINS = {}; }
}
const cleanLocation = (loc) => {
  const s = plain(loc).replace(/\bIN[A-Z]{0,3}\d*-(?:\d+-)?/g, "").replace(/\s+·\s+/g, " · ");
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
};
const snippet = (d) => { const t = plain(d); return t.length > 190 ? t.slice(0, 187).replace(/\s+\S*$/, "") + "…" : t; };
const cityOf = (j) => {
  const loc = String(j.location || "");
  const out = CITIES.filter((c) => c.re && c.re.test(loc)).map((c) => c.slug);
  if (/remote/i.test(String(j.work_mode || "")) || /^remote\b/i.test(loc)) out.push("remote");
  return out;
};
const roleOf = (j) => {
  const t = String(j.title || "");
  for (const r of ROLES) if (r.re.test(t)) return r.slug; // first match wins (order = most specific first)
  return null;
};

const kebab = (v) => plain(v).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, " ").replace(/[_\s-]+/g, "-").replace(/^-|-$/g, "");
const jobSlug = (j) => {
  const city = (CITIES.find((c) => cityOf(j).includes(c.slug)) || {}).slug || "";
  const base = kebab([j.title, j.company_name, city].filter(Boolean).join(" ")).slice(0, 80).replace(/-[^-]*$/, (m) => (m.length > 12 ? "" : m)).replace(/-$/, "");
  return base + "-" + String(j.id).replace(/-/g, "").slice(0, 8);
};
const jobUrl = (j) => `/job/${j._slug}/`;
const companySlug = (name) => kebab(name).slice(0, 60);
const decode = (t) => t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&bull;/g, "•").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
/* full employer description -> safe paragraphs (no employer HTML is copied through) */
function descParagraphs(raw) {
  let t = String(raw || "");
  t = t.replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/ul|\/ol)\b[^>]*>/gi, "\n").replace(/<\s*li\b[^>]*>/gi, "\n• ").replace(/<[^>]*>/g, " ");
  t = decode(decode(t));
  t = t.replace(/\s*•\s*/g, "\n• ");
  t = t.replace(/\s+((?:About (?:the (?:role|team|job|company)|us|this role)|Key responsibilities|Responsibilities|Roles? (?:and|&) responsibilities|What you(?:'|’)ll (?:do|need|bring)|What we(?:'|’)re looking for|Who you are|Basic qualifications|Minimum qualifications|Preferred qualifications|Qualifications|Requirements|Skills required|Eligibility|Benefits|Job description)\s*:?)\s/g, "\n\n$1\n");
  const out = t.split(/\n+/).map((x) => x.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
  return out.slice(0, 120);
}
const EMPLOYMENT = (j) => {
  const t = (String(j.employment_type || "") + " " + String(j.title || "")).toLowerCase();
  if (/\bintern(ship)?\b|apprentic|co-?op/.test(t)) return "INTERN";
  if (/part[- ]?time/.test(t)) return "PART_TIME";
  if (/contract|temporary|fixed term/.test(t)) return "CONTRACTOR";
  return "FULL_TIME";
};
function jobPostingLd(j) {
  const co = plain(j.company_name) || "Company";
  const dom = DOMAINS[co.toLowerCase()];
  const cities = cityOf(j);
  const city = CITIES.find((c) => c.re && cities.includes(c.slug));
  const remote = cities.includes("remote");
  const datePosted = posted(j);
  const validThrough = j.expires_at ? isoDate(j.expires_at) : isoDate(new Date(new Date(datePosted).getTime() + 30 * 864e5));
  const paras = descParagraphs(j.full || j.description);
  const ld = {
    "@context": "https://schema.org", "@type": "JobPosting",
    title: plain(j.title), description: paras.map((p) => `<p>${esc(p)}</p>`).join(""),
    identifier: { "@type": "PropertyValue", name: "Aldovra", value: String(j.id) },
    datePosted, validThrough, employmentType: EMPLOYMENT(j),
    hiringOrganization: { "@type": "Organization", name: co, ...(dom ? { sameAs: "https://" + dom, logo: `https://img.logo.dev/${dom}?token=${LOGO_TOKEN}&size=200&format=png` } : {}) },
    directApply: false, url: SITE + jobUrl(j),
    experienceRequirements: { "@type": "OccupationalExperienceRequirements", monthsOfExperience: 0 },
  };
  const loc = cleanLocation(j.location).replace(/^remote,?\s*/i, "");
  if (!remote || city) {
    ld.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: city ? city.name : (loc.split(",")[0] || "India"), ...(city && city.region ? { addressRegion: city.region } : {}), addressCountry: "IN" } };
  }
  if (remote) { ld.jobLocationType = "TELECOMMUTE"; ld.applicantLocationRequirements = { "@type": "Country", name: "India" }; }
  return ld;
}

/* ---------- html ---------- */
const NAV_CITIES = () => CITIES.map((c) => `<a href="/jobs/${c.slug}/">${esc(c.name)}</a>`).join("");
const NAV_ROLES = () => ROLES.map((r) => `<a href="/jobs/${r.slug}/">${esc(r.name)}</a>`).join("");

function jobCard(j) {
  const co = plain(j.company_name) || "Company";
  const dom = DOMAINS[co.toLowerCase()];
  const logo = dom
    ? `<span class="jp-logo"><img src="https://img.logo.dev/${esc(dom)}?token=${LOGO_TOKEN}&size=96&format=webp&fallback=404" alt="" width="40" height="40" loading="lazy" decoding="async" onerror="this.remove()"><b>${esc(co[0])}</b></span>`
    : `<span class="jp-logo"><b>${esc(co[0])}</b></span>`;
  const meta = [cleanLocation(j.location), j.work_mode, j.employment_type].filter(Boolean).map(esc).join(" · ");
  return `<li class="jp-job">${logo}<div class="jp-body"><h3><a href="${jobUrl(j)}">${esc(plain(j.title))}</a></h3>` +
    `<p class="jp-co">${esc(co)}</p><p class="jp-meta">${meta}</p>` +
    (j.description ? `<p class="jp-desc">${esc(snippet(j.description))}</p>` : "") +
    `</div><div class="jp-side"><time datetime="${esc(posted(j))}">Posted ${esc(fmtDate(posted(j)))}</time>` +
    `<a class="jp-btn" href="${jobUrl(j)}">View job</a></div></li>`;
}

function page({ url, title, description, h1, kicker, intro, jobs, total, crumbs, faqs, related, noindex }) {
  if (noindex) THIN.add(url);
  const list = jobs.length
    ? `<ol class="jp-list">${jobs.map(jobCard).join("")}</ol>` +
      (total > jobs.length ? `<p class="jp-more">Showing the ${jobs.length} newest of ${total} live jobs. <a href="/signup.html">Sign up free</a> to see all of them, filtered for you.</p>` : "")
    : `<p class="jp-empty">No live openings in this list right now. New jobs arrive every day: <a href="/signup.html">sign up free</a> and we'll show them as soon as they're posted.</p>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c[0], item: SITE + c[1] })) },
    { "@context": "https://schema.org", "@type": "CollectionPage", name: h1, description, url: SITE + url, isPartOf: { "@type": "WebSite", name: "Aldovra", url: SITE + "/" }, dateModified: isoDate(today) },
  ];
  if (faqs && faqs.length) ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
  return `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${url}">${noindex ? '\n<meta name="robots" content="noindex,follow">' : ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="Aldovra">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${url}"><meta property="og:image" content="${SITE}/og-card.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/aldovra-logo.png">
<meta name="theme-color" content="#0d0d12">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Instrument+Serif:ital@1&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/aldovra-jobs-public.css?v=20261112">
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head><body>
<header class="jp-top"><div class="jp-wrap"><a class="jp-brand" href="/"><img src="/assets/aldovra-logo-128.webp" alt="" width="30" height="30">Aldovra</a>
<nav><a href="/jobs/">Jobs</a><a href="/#how-it-works">How it works</a><a class="jp-cta" href="/signup.html">Sign up free</a></nav></div></header>
<main class="jp-wrap">
<nav class="jp-crumbs" aria-label="Breadcrumb">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${c[1]}">${esc(c[0])}</a>` : `<span>${esc(c[0])}</span>`).join(" / ")}</nav>
<p class="jp-kicker"><i></i>${esc(kicker)}</p>
<h1>${h1}</h1>
<p class="jp-intro">${intro}</p>
<div class="jp-why"><div><b>Checked links</b><span>We ask each employer's own careers site whether a job is still open and hide closed ones.</span></div><div><b>Fresher-only</b><span>Roles that need years of experience are filtered out.</span></div><div><b>Free first test</b><span>Verify a skill free and show employers proof, not just a resume.</span></div></div>
${list}
<section class="jp-band"><div><h2>Get matched, not just listed</h2><p>Upload your resume and Aldovra shows your match % for every job, the skills you're missing, and lets you verify a skill with a free proctored test.</p></div><a class="jp-btn dark" href="/signup.html">Create free account</a></section>
${related ? `<section class="jp-related"><h2>${esc(related.title)}</h2><div class="jp-chips">${related.html}</div></section>` : ""}
${faqs && faqs.length ? `<section class="jp-faq"><h2>Questions</h2>${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section>` : ""}
<section class="jp-related"><h2>Fresher jobs by city</h2><div class="jp-chips">${NAV_CITIES()}</div><h2>Fresher jobs by role</h2><div class="jp-chips">${NAV_ROLES()}</div></section>
</main>
<footer class="jp-foot"><div class="jp-wrap"><span>© ${today.getFullYear()} Aldovra · Made in India, for freshers everywhere</span>
<span><a href="/about.html">About</a> <a href="/contact.html">Contact</a> <a href="/privacy.html">Privacy</a> <a href="/terms.html">Terms</a> <a href="https://logo.dev">Logos provided by Logo.dev</a></span>
<span>Updated ${esc(today.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }))}. Jobs come from employers' official careers pages.</span></div></footer>
</body></html>
`;
}

function jobPage(j, similar) {
  const url = jobUrl(j);
  const co = plain(j.company_name) || "Company";
  const t = plain(j.title);
  const cities = cityOf(j);
  const city = CITIES.find((c) => cities.includes(c.slug));
  const role = ROLES.find((r) => r.slug === roleOf(j));
  const where = city ? (city.slug === "remote" ? "Remote, India" : city.name) : cleanLocation(j.location);
  const title = `${t} at ${co}${where ? ", " + where : ""} | Fresher Job | Aldovra`;
  const paras = descParagraphs(j.full || j.description);
  const description = `${t} at ${co} in ${where || "India"}. Fresher / entry-level role posted ${fmtDate(posted(j))}. ${snippet(paras.join(" ")).slice(0, 110)}`;
  const dom = DOMAINS[co.toLowerCase()];
  const logo = dom
    ? `<span class="jp-logo jp-logo-lg"><img src="https://img.logo.dev/${esc(dom)}?token=${LOGO_TOKEN}&size=96&format=webp&fallback=404" alt="" width="56" height="56" decoding="async" onerror="this.remove()"><b>${esc(co[0])}</b></span>`
    : `<span class="jp-logo jp-logo-lg"><b>${esc(co[0])}</b></span>`;
  const apply = /^https?:\/\//i.test(String(j.apply_url || "")) ? j.apply_url : "";
  const facts = [["Company", co], ["Location", cleanLocation(j.location) || where], ["Work mode", j.work_mode], ["Job type", j.employment_type], ["Experience", "Fresher / entry level"], ["Posted", fmtDate(posted(j))], ["Salary", j.salary_text]].filter((x) => x[1]);
  const crumbs = [["Home", "/"], ["Fresher jobs", "/jobs/"], ...(city ? [[city.name, `/jobs/${city.slug}/`]] : []), [t.length > 40 ? t.slice(0, 38) + "…" : t, url]];
  const ld = [jobPostingLd(j), { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c[0], item: SITE + c[1] })) }];
  const ctaBox = `<div class="jp-apply"><a class="jp-btn" href="/signup.html">See your match &amp; apply</a>` +
    (apply ? `<a class="jp-direct" href="${esc(apply)}" rel="nofollow noopener" target="_blank">Apply on ${esc(co)}'s site ↗</a>` : "") +
    `<p>Free on Aldovra: your match %, the skills you're missing, and a free skill test that shows recruiters proof.</p></div>`;
  return `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Aldovra">
<meta property="og:title" content="${esc(t + " at " + co)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${url}"><meta property="og:image" content="${SITE}/og-card.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/aldovra-logo.png"><meta name="theme-color" content="#0d0d12">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Instrument+Serif:ital@1&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/aldovra-jobs-public.css?v=20261112">
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head><body>
<header class="jp-top"><div class="jp-wrap"><a class="jp-brand" href="/"><img src="/assets/aldovra-logo-128.webp" alt="" width="30" height="30">Aldovra</a>
<nav><a href="/jobs/">Jobs</a><a href="/#how-it-works">How it works</a><a class="jp-cta" href="/signup.html">Sign up free</a></nav></div></header>
<main class="jp-wrap jp-single">
<nav class="jp-crumbs" aria-label="Breadcrumb">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${c[1]}">${esc(c[0])}</a>` : `<span>${esc(c[0])}</span>`).join(" / ")}</nav>
<div class="jp-head">${logo}<div><p class="jp-kicker"><i></i>Fresher job · posted ${esc(fmtDate(posted(j)))}</p><h1 class="jp-h1-job">${esc(t)}</h1><p class="jp-co">${esc(co)} · ${esc(where)}</p></div></div>
<div class="jp-grid"><article class="jp-desc-full"><h2>About the role</h2>${paras.map((p) => /^•/.test(p) ? `<p class="jp-bul">${esc(p.replace(/^•\s*/, ""))}</p>` : (p.length < 60 && /:$|^[A-Z][^.]{2,58}$/.test(p) ? `<h3>${esc(p.replace(/:$/, ""))}</h3>` : `<p>${esc(p)}</p>`)).join("")}
<p class="jp-source">Source: ${esc(co)}'s official careers page. Aldovra re-checks this link several times a day and removes the job once it closes.</p></article>
<aside><dl class="jp-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>${ctaBox}</aside></div>
${similar.length ? `<section class="jp-related"><h2>Similar fresher jobs</h2><ol class="jp-list">${similar.map(jobCard).join("")}</ol></section>` : ""}
<section class="jp-related"><h2>More fresher jobs</h2><div class="jp-chips">${city ? `<a href="/jobs/${city.slug}/">All jobs in ${esc(city.name)}</a>` : ""}${role ? `<a href="/jobs/${role.slug}/">${esc(role.name)}</a>` : ""}${city && role && GENERATED.has(`/jobs/${city.slug}/${role.slug}/`) ? `<a href="/jobs/${city.slug}/${role.slug}/">${esc(role.name)} in ${esc(city.name)}</a>` : ""}${GENERATED.has(`/jobs/company/${companySlug(co)}/`) ? `<a href="/jobs/company/${companySlug(co)}/">All ${esc(co)} fresher jobs</a>` : ""}<a href="/jobs/">All fresher jobs in India</a></div></section>
</main>
<footer class="jp-foot"><div class="jp-wrap"><span>© ${today.getFullYear()} Aldovra · Made in India, for freshers everywhere</span>
<span><a href="/about.html">About</a> <a href="/contact.html">Contact</a> <a href="/privacy.html">Privacy</a> <a href="/terms.html">Terms</a> <a href="https://logo.dev">Logos provided by Logo.dev</a></span></div></footer>
</body></html>
`;
}

function write(rel, html) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

/* ---------- main ---------- */
async function fetchFeed() {
  if (process.env.FEED_FILE) return JSON.parse(fs.readFileSync(process.env.FEED_FILE, "utf8"));
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_job_postings`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_limit: 3000 }),
  });
  if (!r.ok) throw new Error("public_job_postings " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}

const FAQ_BASE = [
  ["Are these jobs really for freshers?", "Yes. Every job here passed the same fresher filter as the Aldovra student dashboard: roles asking for years of experience or senior titles are removed, and 0–1 or 0–2 year roles are kept."],
  ["How fresh are the listings?", "Only jobs posted in the last 30 days are shown, and each employer link is re-checked several times a day. Closed jobs disappear automatically."],
  ["Is Aldovra free?", "Creating an account and browsing jobs is free, and your first skill assessment is free. A verified skill helps your application stand out."],
];

async function main() {
  loadDomains();
  const F = loadDashboardFilters();
  const raw = (await fetchFeed()).map((j) => ({ ...j, full: j.description, description: j.description_feed ?? j.description }));
  if (!Array.isArray(raw) || raw.length < 50) throw new Error("feed looks wrong: " + (Array.isArray(raw) ? raw.length + " rows" : typeof raw));
  const seen = new Set();
  const jobs = raw.filter((j) => {
    const k = (plain(j.title) + "|" + plain(j.company_name) + "|" + plain(j.location)).toLowerCase();
    if (seen.has(k)) return false; seen.add(k);
    return F.isIndiaEligibleJob(j) && F.noExperienceEligible(j);
  });
  // fresh output every run: closed jobs disappear (their pages 404, which Google expects)
  for (const d of ["jobs", "job"]) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });
  const slugs = new Set();
  for (const j of jobs) { let s = jobSlug(j); while (slugs.has(s)) s += "x"; slugs.add(s); j._slug = s; }
  const by = {};
  for (const j of jobs) {
    for (const c of cityOf(j)) (by[c] = by[c] || []).push(j);
    const r = roleOf(j); if (r) (by[r] = by[r] || []).push(j);
  }
  const companies = new Set(jobs.map((j) => plain(j.company_name).toLowerCase())).size;
  const urls = [];

  // hub
  urls.push("/jobs/");
  write("jobs/index.html", page({
    url: "/jobs/", title: `Fresher Jobs in India (${jobs.length} live) | Aldovra`,
    description: `${jobs.length} live fresher and entry-level jobs in India from ${companies} companies, checked daily. Browse by city or role, then sign up free to see your match.`,
    h1: `Fresher jobs in India, <em>checked daily</em>`, kicker: `${jobs.length} live jobs · ${companies} companies`,
    intro: `Entry-level and graduate jobs from the official careers pages of ${companies} companies, including ${[...new Set(jobs.slice(0, 60).map((j) => plain(j.company_name)))].slice(0, 6).map(esc).join(", ")}. Updated every day; closed jobs are removed automatically.`,
    jobs: jobs.slice(0, PER_PAGE), total: jobs.length, crumbs: [["Home", "/"], ["Fresher jobs", "/jobs/"]], faqs: FAQ_BASE,
  }));

  for (const c of CITIES) {
    const list = by[c.slug] || [];
    const u = `/jobs/${c.slug}/`; urls.push(u);
    const label = c.slug === "remote" ? "remote fresher jobs in India" : `fresher jobs in ${c.name}`;
    write(`jobs/${c.slug}/index.html`, page({
      url: u, title: `${c.slug === "remote" ? "Remote Fresher Jobs in India" : "Fresher Jobs in " + c.name} (${list.length} live) | Aldovra`, noindex: list.length < 5,
      description: `${list.length} live ${label} for graduates and freshers, from official employer careers pages. Updated daily. Sign up free to see your match and apply.`,
      h1: c.slug === "remote" ? `Remote fresher jobs <em>in India</em>` : `Fresher jobs in <em>${esc(c.name)}</em>`,
      kicker: `${list.length} live jobs · updated daily`, intro: esc(c.blurb),
      jobs: list.slice(0, PER_PAGE), total: list.length, crumbs: [["Home", "/"], ["Fresher jobs", "/jobs/"], [c.name, u]],
      faqs: [[`How many fresher jobs are open in ${c.name} right now?`, `${list.length} live fresher and entry-level openings as of today, all posted in the last 30 days.`], ...FAQ_BASE.slice(0, 2)],
      related: { title: `Roles hiring in ${c.name}`, html: ROLES.map((r) => ({ r, n: list.filter((j) => roleOf(j) === r.slug).length })).filter((x) => x.n).map((x) => `<a href="/jobs/${x.r.slug}/">${esc(x.r.name)} <small>${x.n}</small></a>`).join("") },
    }));
  }
  for (const r of ROLES) {
    const list = by[r.slug] || [];
    const u = `/jobs/${r.slug}/`; urls.push(u);
    write(`jobs/${r.slug}/index.html`, page({
      url: u, title: `${r.seo} (${list.length} live) | Aldovra`, noindex: list.length < 5,
      description: `${list.length} live ${r.name.toLowerCase()} jobs for freshers in India, from official employer careers pages. Updated daily. Sign up free to see your match.`,
      h1: `${esc(r.name)} jobs <em>for freshers</em>`, kicker: `${list.length} live jobs · updated daily`, intro: esc(r.blurb),
      jobs: list.slice(0, PER_PAGE), total: list.length, crumbs: [["Home", "/"], ["Fresher jobs", "/jobs/"], [r.name, u]],
      faqs: FAQ_BASE,
      related: { title: `Cities hiring for ${r.name.toLowerCase()}`, html: CITIES.map((c) => ({ c, n: list.filter((j) => cityOf(j).includes(c.slug)).length })).filter((x) => x.n).map((x) => `<a href="/jobs/${x.c.slug}/">${esc(x.c.name)} <small>${x.n}</small></a>`).join("") },
    }));
  }

  // city x role pages
  for (const c of CITIES) for (const r of ROLES) {
    const list = (by[c.slug] || []).filter((j) => roleOf(j) === r.slug);
    if (list.length < MIN_COMBO) continue;
    const u = `/jobs/${c.slug}/${r.slug}/`; urls.push(u); GENERATED.add(u);
    const place = c.slug === "remote" ? "Remote (India)" : c.name;
    write(`jobs/${c.slug}/${r.slug}/index.html`, page({
      url: u, title: `${r.name} Fresher Jobs in ${place} (${list.length} live) | Aldovra`,
      description: `${list.length} live ${r.name.toLowerCase()} jobs for freshers in ${place}, from official employer careers pages. Updated daily.`,
      h1: `${esc(r.name)} jobs in <em>${esc(place)}</em>`, kicker: `${list.length} live fresher jobs · updated daily`, intro: esc(r.blurb) + " " + esc(c.blurb),
      jobs: list.slice(0, PER_PAGE), total: list.length, crumbs: [["Home", "/"], ["Fresher jobs", "/jobs/"], [c.name, `/jobs/${c.slug}/`], [r.name, u]], faqs: FAQ_BASE,
    }));
  }
  // company pages
  const byCo = {};
  for (const j of jobs) { const k = plain(j.company_name); if (k) (byCo[k] = byCo[k] || []).push(j); }
  for (const [co, list] of Object.entries(byCo)) {
    if (list.length < MIN_COMBO) continue;
    const cs = companySlug(co); if (!cs) continue;
    const u = `/jobs/company/${cs}/`; urls.push(u); GENERATED.add(u);
    const cityNames = CITIES.map((c) => ({ c, n: list.filter((j) => cityOf(j).includes(c.slug)).length })).filter((x) => x.n).map((x) => x.c.name);
    write(`jobs/company/${cs}/index.html`, page({
      url: u, title: `${co} Fresher Jobs in India (${list.length} open) | Aldovra`,
      description: `${list.length} open fresher and entry-level jobs at ${co} in India${cityNames.length ? " (" + cityNames.slice(0, 4).join(", ") + ")" : ""}, straight from ${co}'s official careers page. Updated daily.`,
      h1: `${esc(co)} fresher jobs <em>in India</em>`, kicker: `${list.length} open roles · checked daily`,
      intro: `Entry-level and graduate openings at ${esc(co)}${cityNames.length ? " in " + cityNames.slice(0, 4).map(esc).join(", ") : ""}, taken from ${esc(co)}'s own careers page. Each link is re-checked several times a day.`,
      jobs: list.slice(0, PER_PAGE), total: list.length, crumbs: [["Home", "/"], ["Fresher jobs", "/jobs/"], [co, u]], faqs: FAQ_BASE,
    }));
  }
  // one page per job (schema.org JobPosting for the Google Jobs box)
  for (const j of jobs) {
    const c = cityOf(j)[0], r = roleOf(j);
    const similar = jobs.filter((x) => x !== j && roleOf(x) === r && (!c || cityOf(x).includes(c))).slice(0, 5);
    write(`job/${j._slug}/index.html`, jobPage(j, similar));
  }

  // sitemap: static pages + job pages
  const statics = [["/", "1.0"], ["/jobs/", "0.9"], ["/about.html", "0.7"], ["/before-you-begin.html", "0.7"], ["/assessment-pricing.html", "0.7"], ["/get-started.html", "0.7"], ["/signup.html", "0.6"], ["/hr-login.html", "0.5"], ["/contact.html", "0.5"], ["/terms.html", "0.3"], ["/privacy.html", "0.3"], ["/refund.html", "0.3"]];
  const d = isoDate(today);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    statics.map(([u, p]) => `  <url><loc>${SITE}${u}</loc>${u === "/jobs/" ? `<lastmod>${d}</lastmod><changefreq>daily</changefreq>` : ""}<priority>${p}</priority></url>`).join("\n") + "\n" +
    urls.filter((u) => u !== "/jobs/" && !THIN.has(u)).map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${d}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`).join("\n") +
    "\n" + jobs.map((j) => `  <url><loc>${SITE}${jobUrl(j)}</loc><lastmod>${posted(j)}</lastmod><priority>0.6</priority></url>`).join("\n") +
    `\n</urlset>\n`;
  write("sitemap.xml", xml);
  console.log(JSON.stringify({ feed: raw.length, shown: jobs.length, companies, list_pages: urls.length, job_pages: jobs.length, counts: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length])) }));
}

main().catch((e) => { console.error(e); process.exit(1); });
