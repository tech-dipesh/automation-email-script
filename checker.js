/**
 * Internship Job Alert System v2
 * ════════════════════════════════════════════════════════════
 * Sources : Ashby API · Greenhouse API · Aspire API · HTML fallback
 * Alerts  : Gmail via Nodemailer
 * Runs    : GitHub Actions every hour  |  locally: npm test
 *
 * TWO MODES — classified per job:
 *   🇮🇳 ONSITE  — India metros (Bangalore · Delhi NCR · Hyderabad · Mumbai)
 *                 Roles: Intern / Trainee / Apprentice in SWE
 *   🌐 REMOTE   — Global, must be Asian-applicant-friendly
 *                 Roles: Intern / Trainee / Apprentice in SWE
 *                 Excluded: USA-only, Europe-only, geo-restricted
 *
 * EXCLUDED (both modes):
 *   – Any role needing 1+ year experience (title + description scan)
 *   – Senior / Lead / Staff / Manager / Director in title
 * ════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import { createTransport }             from "nodemailer";
import axios                           from "axios";
import { load }                        from "cheerio";
import { readFileSync, writeFileSync }  from "fs";

// ─── Config ─────────────────────────────────────────────────────────────────

const COMPANIES_FILE = "companies.json";
const SEEN_FILE      = "seen_jobs.json";
const DRY_RUN        = process.argv.includes("--dry-run");
const TEST_MODE      = process.argv.includes("--test");

const COMPANIES = JSON.parse(readFileSync(COMPANIES_FILE, "utf8"))
  .filter(c => c.name && c.link);   // skip any blank/incomplete entries

// ─── Seen Jobs ──────────────────────────────────────────────────────────────

function loadSeen() {
  try { return JSON.parse(readFileSync(SEEN_FILE, "utf8")); }
  catch { return {}; }
}
function saveSeen(seen) {
  writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

// ─── Filter Constants ────────────────────────────────────────────────────────

const INTERN_KEYWORDS = [
  "intern", "internship", "trainee", "apprentice",
];

const SENIOR_KEYWORDS = [
  "senior", "sr.", " sr ", "staff", "lead", "principal",
  "manager", "director", "head of", "vp ", "vice president",
  "associate professor", "consultant",
];

const INDIA_CITIES = [
  "bangalore", "bengaluru",
  "delhi", "new delhi", "ncr", "noida", "gurgaon", "gurugram", "faridabad",
  "hyderabad", "secunderabad",
  "mumbai", "bombay", "navi mumbai",
  "india",
];

const REMOTE_KEYWORDS = [
  "remote", "anywhere", "global", "worldwide", "apac",
  "work from home", "wfh", "distributed",
];

const BLOCKED_LOCATION_PHRASES = [
  "us only", "usa only", "united states only",
  "uk only", "europe only", "eu only", "germany only",
  "london only", "france only", "spain only",
  "canada only", "australia only", "new zealand only",
  "north america only", "americas only",
  "us-only", "uk-only", "ca-only",
  "remote (us", "remote - us", "remote – us",
  "remote, us", "remote / us",
  "remote (united states", "remote (canada",
];

const EXPERIENCE_PATTERNS = [
  /\b[1-9]\+?\s*(?:year|yr)s?\s+(?:of\s+)?(?:experience|exp)\b/i,
  /\b(?:minimum|min\.?|at\s+least)\s+[1-9]\s+(?:year|yr)/i,
  /\b[1-9]\s*[-\u2013to]+\s*[2-9]\s+years?\s+(?:of\s+)?(?:experience|exp)\b/i,
  /\brequires?\s+[1-9]\+?\s+years?\b/i,
  /\b[1-9]\+\s*yrs?\b/i,
  /\bwith\s+[1-9]\+?\s+(?:years?|yrs?)\s+(?:of\s+)?experience\b/i,
];

// ─── Job Classification ──────────────────────────────────────────────────────

/**
 * Returns "onsite" | "remote" | null (skip)
 */
function classifyJob(job, companyType, defaultLoc) {
  const rawLoc = (job.location || defaultLoc || "").toLowerCase();

  // Hard-blocked geo-restricted locations
  if (BLOCKED_LOCATION_PHRASES.some(b => rawLoc.includes(b))) return null;

  // India city → onsite
  if (INDIA_CITIES.some(c => rawLoc.includes(c))) return "onsite";

  // Remote keywords → remote
  if (REMOTE_KEYWORDS.some(k => rawLoc.includes(k))) return "remote";

  // No location → use company type hint
  if (!rawLoc || rawLoc.trim() === "") {
    if (companyType === "remote") return "remote";
    return null;  // can't confidently classify
  }

  // Location present but doesn't match either → skip
  return null;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

function isInternRole(title) {
  const t = title.toLowerCase();
  return INTERN_KEYWORDS.some(k => t.includes(k));
}

function isSeniorRole(title) {
  const t = title.toLowerCase();
  return SENIOR_KEYWORDS.some(k => t.includes(k));
}

function hasExperienceReq(title, description) {
  const combined = `${title} ${description}`;
  return EXPERIENCE_PATTERNS.some(p => p.test(combined));
}

function applyFilters(job, mode) {
  const reasons = [];
  let passed    = true;

  // 1. Must have intern/trainee/apprentice in title
  if (!isInternRole(job.title)) {
    reasons.push("❌ Title missing: intern / trainee / apprentice");
    passed = false;
  } else {
    reasons.push("✔ Entry-level keyword confirmed in title");
  }

  // 2. Must NOT have senior/lead/manager in title
  if (isSeniorRole(job.title)) {
    reasons.push("❌ Seniority keyword in title (Senior/Lead/Manager/etc.)");
    passed = false;
  } else {
    reasons.push("✔ No seniority conflict");
  }

  // 3. Location check (mode-specific)
  if (mode === "onsite") {
    const loc       = (job.location || "").toLowerCase();
    const cityMatch = INDIA_CITIES.find(c => loc.includes(c));
    if (cityMatch) {
      reasons.push(`✔ India metro confirmed: "${cityMatch}"`);
    } else {
      reasons.push(`❌ Not in India metros: "${job.location || "no location"}"`);
      passed = false;
    }
  } else {
    const loc     = (job.location || "").toLowerCase();
    const blocked = BLOCKED_LOCATION_PHRASES.find(b => loc.includes(b));
    if (blocked) {
      reasons.push(`❌ Geo-restricted: "${blocked}"`);
      passed = false;
    } else {
      reasons.push("✔ No geo-restriction — open to Asian applicants");
    }
  }

  // 4. Must NOT require experience (title + description)
  if (hasExperienceReq(job.title, job.description)) {
    reasons.push("❌ Experience requirement detected (1+ years)");
    passed = false;
  } else {
    reasons.push("✔ No experience requirement found");
  }

  return { passed, reasons, mode };
}

// ─── HTTP Client ─────────────────────────────────────────────────────────────

const HTTP = axios.create({
  timeout: 20000,
  headers: { "User-Agent": "InternshipAlertBot/2.0 (github-actions)" },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function htmlToText(html, maxLen = 900) {
  if (!html) return "No description available.";
  const text = load(html).text().replace(/\s+/g, " ").trim();
  return text.length > maxLen ? text.substring(0, maxLen) + "…" : text;
}

function safeUrl(href, base) {
  try { return href.startsWith("http") ? href : new URL(href, base).href; }
  catch { return href; }
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchAshby(company) {
  const slug = new URL(company.link).pathname.replace(/^\//, "").split("/")[0];
  const res  = await HTTP.get(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  return (res.data.jobPostings || []).map(j => ({
    id:          j.id,
    title:       j.title || "",
    location:    j.locationName || j.location?.name || "",
    link:        j.externalLink || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
    description: j.descriptionPlain
      ? j.descriptionPlain.substring(0, 900)
      : htmlToText(j.descriptionHtml),
    company:     company.name,
  }));
}

async function fetchGreenhouse(company) {
  const slug = new URL(company.link).pathname.replace(/^\//, "").split("/")[0];
  const res  = await HTTP.get(
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
  );
  return (res.data.jobs || []).map(j => ({
    id:          String(j.id),
    title:       j.title || "",
    location:    j.location?.name || "",
    link:        j.absolute_url,
    description: htmlToText(j.content),
    company:     company.name,
  }));
}

async function fetchAspireApi(company) {
  const jobs = [];
  let   page = 1;

  while (true) {
    const res  = await HTTP.get(`${company.apiUrl}?page=${page}`);
    const body = res.data;
    const raw  = Array.isArray(body)
      ? body
      : body.data || body.jobs || body.postings || body.results || [];

    if (!raw.length) break;

    for (const j of raw) {
      const title    = j.title || j.name || j.job_title || "";
      const location = j.location?.name || j.location || j.office?.location
                     || j.office?.name  || j.city || "";
      const link     = j.url || j.applyUrl || j.apply_url
                     || j.absoluteUrl || company.link;
      const desc     = j.descriptionPlain
                     || htmlToText(j.description || j.content || j.body || "");

      jobs.push({
        id:          String(j.id || j.uuid || link),
        title,
        location:    typeof location === "string" ? location : JSON.stringify(location),
        link,
        description: typeof desc === "string" ? desc.substring(0, 900) : "",
        company:     company.name,
      });
    }

    if (raw.length < 10) break;
    page++;
  }

  return jobs;
}

async function fetchCareersPage(company) {
  const res  = await HTTP.get(company.link, { timeout: 25000 });
  const $    = load(res.data);
  const jobs = [];
  const seen = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().replace(/\s+/g, " ").trim();

    if (!text || text.length < 5 || text.length > 140) return;

    const lhref = href.toLowerCase();
    const ltext = text.toLowerCase();

    const looksLikeJob =
      lhref.includes("job")       || lhref.includes("career")   ||
      lhref.includes("position")  || lhref.includes("role")     ||
      lhref.includes("opening")   || lhref.includes("vacancy")  ||
      ltext.includes("intern")    || ltext.includes("trainee")  ||
      ltext.includes("engineer")  || ltext.includes("apprentice") ||
      ltext.includes("developer") || ltext.includes("analyst");

    if (!looksLikeJob) return;

    const fullUrl = safeUrl(href, company.link);
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    jobs.push({
      id:          fullUrl,
      title:       text,
      location:    company.defaultLocation || "",
      link:        fullUrl,
      description: "Visit the job link for the full description.",
      company:     company.name,
    });
  });

  return jobs;
}

async function fetchJobs(company) {
  switch (company.source) {
    case "ashby":        return fetchAshby(company);
    case "greenhouse":   return fetchGreenhouse(company);
    case "aspire_api":   return fetchAspireApi(company);
    case "careers_page": return fetchCareersPage(company);
    default: throw new Error(`Unknown source type: "${company.source}"`);
  }
}

// ─── Email ───────────────────────────────────────────────────────────────────

const transporter = createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function buildEmailBody(job, filterResult) {
  const isOnsite   = filterResult.mode === "onsite";
  const modeBadge  = isOnsite ? "🇮🇳 ONSITE — India" : "🌐 REMOTE — Global";
  const modeEmoji  = isOnsite ? "🇮🇳" : "🌐";
  const matchLines = filterResult.reasons
    .filter(r => r.startsWith("✔"))
    .join("\n   ");

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${modeEmoji}  NEW INTERNSHIP ALERT  [${modeBadge}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏢  Company   : ${job.company}
💼  Role      : ${job.title}
📍  Location  : ${job.location || "Not specified"}
🔗  Apply Now : ${job.link}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋  ROLE OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${job.description}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  WHY THIS MATCHED YOUR FILTERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   ${matchLines}

📌  Full filter log:
${filterResult.reasons.map(r => "   " + r).join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰  Detected : ${new Date().toUTCString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();
}

async function sendAlert(job, filterResult) {
  const modeTag = filterResult.mode === "onsite" ? "🇮🇳 ONSITE" : "🌐 REMOTE";
  const subject = `${modeTag} | ${job.title} @ ${job.company}`;
  const body    = buildEmailBody(job, filterResult);

  if (DRY_RUN || TEST_MODE) {
    console.log("\n📧  [DRY RUN] Email preview:");
    console.log("    Subject:", subject);
    console.log(body);
    return;
  }

  await transporter.sendMail({
    from:    `"Internship Alert Bot 🤖" <${process.env.GMAIL_USER}>`,
    to:      process.env.ALERT_EMAIL || process.env.GMAIL_USER,
    subject,
    text:    body,
  });

  console.log(`   📧 Alert sent → "${job.title}" @ ${job.company} [${modeTag}]`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const W = 64;
  console.log(`\n${"═".repeat(W)}`);
  console.log(`🔍  Internship Alert v2  —  ${new Date().toUTCString()}`);
  if (DRY_RUN || TEST_MODE) console.log("⚠   DRY RUN — no emails will be sent");
  console.log(`    Watching ${COMPANIES.length} companies`);
  console.log("═".repeat(W));

  const seen = loadSeen();
  let newCount = 0, matchCount = 0;

  for (const company of COMPANIES) {
    console.log(`\n📌  ${company.name}  [${company.source}][${company.type || "both"}]`);

    let jobs = [];
    try {
      jobs = await fetchJobs(company);
      console.log(`    📂 ${jobs.length} job(s) fetched`);
    } catch (err) {
      console.error(`    ❌ Fetch error: ${err.message}`);
      continue;
    }

    for (const job of jobs) {
      const uid = `${company.name}::${job.id}`;
      if (seen[uid]) continue;
      newCount++;

      const mode = classifyJob(job, company.type, company.defaultLocation);

      if (!mode) {
        const loc = job.location || "no location";
        console.log(`    ⏭  Skip [unclassified]: "${job.title}" (${loc})`);
        seen[uid] = {
          title: job.title, location: job.location,
          mode: "unclassified", seenAt: new Date().toISOString(), matched: false,
        };
        continue;
      }

      const result = applyFilters(job, mode);
      const tag    = mode === "onsite" ? "🇮🇳" : "🌐";

      if (result.passed) {
        matchCount++;
        console.log(`    ✅ MATCH ${tag}: "${job.title}" (${job.location || "n/a"})`);
        try {
          await sendAlert(job, result);
        } catch (err) {
          console.error(`    ❌ Email error: ${err.message}`);
        }
      } else {
        const why = result.reasons.find(r => r.startsWith("❌")) || "filtered";
        console.log(`    ⏭  Skip  ${tag}: "${job.title}" → ${why}`);
      }

      seen[uid] = {
        title:    job.title,
        location: job.location,
        mode,
        seenAt:   new Date().toISOString(),
        matched:  result.passed,
      };
    }
  }

  saveSeen(seen);
  console.log(`\n${"─".repeat(W)}`);
  console.log(`✅  Done. ${newCount} new job(s) scanned  |  ${matchCount} alert(s) sent.`);
  console.log("─".repeat(W) + "\n");
}

main().catch(err => {
  console.error("💥 Fatal:", err.message);
  process.exit(1);
});
