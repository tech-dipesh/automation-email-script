/**
 * Internship Job Alert System v3
 * ════════════════════════════════════════════════════════════════
 * Sources  : Ashby · Greenhouse · Lever · Aspire API · HTML fallback
 * Alerts   : Gmail via Nodemailer  |  Runs: GitHub Actions every hour
 *
 * TWO MODES:
 *   🇮🇳 ONSITE  — India metros (Bangalore · Delhi NCR · Hyderabad · Mumbai)
 *   🌐 REMOTE   — Global, Asian-applicant-friendly
 *
 * WHAT MATCHES:
 *   Must be an intern/trainee/apprentice (word-boundary check, NOT "internal")
 *   AND must be in a SWE domain (engineer/developer/frontend/backend/etc.)
 *
 * WHAT IS EXCLUDED:
 *   – HR, Finance, Marketing, Audit, Operations interns
 *   – Roles needing 1+ year experience (title + description)
 *   – Senior / Lead / Staff / Manager in title
 *   – Remote geo-restricted to USA/Europe only
 *   – Onsite roles outside India
 * ════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import { createTransport }             from "nodemailer";
import axios                           from "axios";
import { load }                        from "cheerio";
import { readFileSync, writeFileSync }  from "fs";

// ─── Config ──────────────────────────────────────────────────────────────────

const COMPANIES_FILE = "companies.json";
const SEEN_FILE      = "seen_jobs.json";
const DRY_RUN        = process.argv.includes("--dry-run");
const TEST_MODE      = process.argv.includes("--test");

const COMPANIES = JSON.parse(readFileSync(COMPANIES_FILE, "utf8"))
  .filter(c => c.name && c.link);

// ─── Seen Jobs ────────────────────────────────────────────────────────────────

function loadSeen() {
  try { return JSON.parse(readFileSync(SEEN_FILE, "utf8")); }
  catch { return {}; }
}
function saveSeen(seen) {
  writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

// ─── Filter Constants ─────────────────────────────────────────────────────────

/**
 * ⚠ WORD BOUNDARY — "intern" will NOT match "internal"
 * This was the bug that caused "Internal Auditor" to pass
 */
const INTERN_RE = /\b(intern|internship|trainee|apprentice|graduate\s+trainee|grad\s+trainee)\b/i;

/**
 * SWE domain check — at least one must appear in the title.
 * This blocks HR / Finance / Marketing / Audit interns.
 */
const SWE_DOMAIN_RE = /\b(software|engineer|developer|full[\s-]?stack|frontend|front[\s-]end|backend|back[\s-]end|devops|dev[\s-]ops|swe|sde|web[\s-]?dev|mobile|android|ios|react|node|java|python|cloud|platform|infrastructure|infra|site[\s-]?reliab|data[\s-]?engin|ml|machine[\s-]?learn|deep[\s-]?learn|ai|computer[\s-]?vision|nlp|embedded|firmware|systems)\b/i;

const SENIOR_RE = /\b(senior|sr\b|lead|leader|staff|principal|manager|director|head\s+of|vp\b|vice\s+president)\b/i;

const INDIA_CITIES = [
  "bangalore", "bengaluru",
  "delhi", "new delhi", "ncr", "noida", "gurgaon", "gurugram", "faridabad",
  "hyderabad", "secunderabad",
  "mumbai", "bombay", "navi mumbai",
  "india",
];

const REMOTE_KEYWORDS = [
  "remote", "anywhere", "global", "worldwide", "apac", "wfh", "distributed",
];

const BLOCKED_LOCATION_PHRASES = [
  "us only", "usa only", "united states only",
  "uk only", "europe only", "eu only",
  "north america only", "americas only",
  "canada only", "australia only",
  "us-only", "uk-only",
  "remote (us", "remote - us", "remote – us",
  "remote, us", "remote / us",
  "remote (united states", "remote (canada",
];

const EXPERIENCE_PATTERNS = [
  /\b[1-9]\+?\s*(?:year|yr)s?\s+(?:of\s+)?(?:experience|exp)\b/i,
  /\b(?:minimum|min\.?|at\s+least)\s+[1-9]\s+(?:year|yr)/i,
  /\b[1-9]\s*[-–to]+\s*[2-9]\s+years?\s+(?:of\s+)?(?:experience|exp)\b/i,
  /\brequires?\s+[1-9]\+?\s+years?\b/i,
  /\b[1-9]\+\s*yrs?\b/i,
];

// ─── Classification ───────────────────────────────────────────────────────────

function classifyJob(job, companyType, defaultLoc) {
  const loc = (job.location || defaultLoc || "").toLowerCase();
  if (BLOCKED_LOCATION_PHRASES.some(b => loc.includes(b))) return null;
  if (INDIA_CITIES.some(c => loc.includes(c)))             return "onsite";
  if (REMOTE_KEYWORDS.some(k => loc.includes(k)))          return "remote";
  if (!loc.trim()) {
    if (companyType === "remote") return "remote";
    return null;
  }
  return null;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function applyFilters(job, mode) {
  const reasons = [];
  let passed    = true;
  const title   = job.title;

  // 1. Word-boundary intern/trainee/apprentice check
  if (!INTERN_RE.test(title)) {
    reasons.push("❌ Not an intern/trainee/apprentice role");
    passed = false;
  } else {
    const match = title.match(INTERN_RE)?.[0] || "intern";
    reasons.push(`✔ Entry-level keyword: "${match}"`);
  }

  // 2. Must be SWE domain — blocks HR/Finance/Audit/Marketing interns
  if (!SWE_DOMAIN_RE.test(title)) {
    reasons.push("❌ Not SWE domain (no engineer/developer/frontend/backend/etc.)");
    passed = false;
  } else {
    const match = title.match(SWE_DOMAIN_RE)?.[0] || "swe";
    reasons.push(`✔ SWE domain confirmed: "${match}"`);
  }

  // 3. No seniority keywords
  if (SENIOR_RE.test(title)) {
    reasons.push("❌ Seniority keyword in title");
    passed = false;
  } else {
    reasons.push("✔ No seniority conflict");
  }

  // 4. Location check
  if (mode === "onsite") {
    const loc       = (job.location || "").toLowerCase();
    const cityMatch = INDIA_CITIES.find(c => loc.includes(c));
    if (cityMatch) {
      reasons.push(`✔ India metro: "${cityMatch}"`);
    } else {
      reasons.push(`❌ Not in India metro: "${job.location || "no location"}"`);
      passed = false;
    }
  } else {
    const loc     = (job.location || "").toLowerCase();
    const blocked = BLOCKED_LOCATION_PHRASES.find(b => loc.includes(b));
    if (blocked) {
      reasons.push(`❌ Geo-restricted: "${blocked}"`);
      passed = false;
    } else {
      reasons.push("✔ Open to Asian applicants");
    }
  }

  // 5. Experience check (title + description)
  const combined = `${title} ${job.description}`;
  if (EXPERIENCE_PATTERNS.some(p => p.test(combined))) {
    reasons.push("❌ Experience requirement detected (1+ years)");
    passed = false;
  } else {
    reasons.push("✔ No experience requirement");
  }

  return { passed, reasons, mode };
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

const HTTP = axios.create({
  timeout: 20000,
  headers: { "User-Agent": "InternshipAlertBot/3.0 (github-actions)" },
});

function htmlToText(html, maxLen = 900) {
  if (!html) return "";
  const text = load(html).text().replace(/\s+/g, " ").trim();
  return text.length > maxLen ? text.substring(0, maxLen) + "…" : text;
}

function safeUrl(href, base) {
  try { return href.startsWith("http") ? href : new URL(href, base).href; }
  catch { return href; }
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

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

/**
 * Lever API — returns individual job postings with direct links, titles, descriptions.
 * Fixes the Paytm "Intern" generic link bug.
 * API: https://api.lever.co/v0/postings/{slug}?mode=json
 */
async function fetchLever(company) {
  const slug = company.leverSlug
    || new URL(company.link).pathname.replace(/^\//, "").split("/")[0];
  const res  = await HTTP.get(
    `https://api.lever.co/v0/postings/${slug}?mode=json`
  );
  const jobs = Array.isArray(res.data) ? res.data : [];
  return jobs.map(j => {
    const descText = j.descriptionPlain
      || htmlToText(j.description || "");
    const listText = (j.lists || [])
      .map(l => `${l.text}: ${l.content}`)
      .join(" | ");
    return {
      id:          j.id,
      title:       j.text || "",
      location:    j.categories?.location || j.categories?.allLocations?.[0] || "",
      link:        j.hostedUrl || j.applyUrl,
      description: `${descText} ${listText}`.trim().substring(0, 900),
      company:     company.name,
    };
  });
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
      const link     = j.url || j.applyUrl || j.apply_url || j.absoluteUrl || company.link;
      const desc     = j.descriptionPlain || htmlToText(j.description || j.content || j.body || "");
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
    const raw  = $(el).text().replace(/\s+/g, " ").trim();

    // Remove common navigation/junk suffixes scraped from career portals
    const text = raw
      .replace(/\s*(Full[- ]?time|Part[- ]?time|Contract|Click to view→?|Apply Now|View Job|Apply)\s*/gi, "")
      .replace(/\s*(Bangalore|Bengaluru|Mumbai|Delhi|Hyderabad|Noida|Remote|India)\s*/gi, "")
      .replace(/\s*→\s*/g, "")
      .trim();

    if (!text || text.length < 5 || text.length > 120) return;

    const lhref = href.toLowerCase();
    const ltext = text.toLowerCase();

    const looksLikeJob =
      lhref.includes("job")       || lhref.includes("career")   ||
      lhref.includes("position")  || lhref.includes("role")     ||
      lhref.includes("opening")   || lhref.includes("vacancy")  ||
      ltext.includes("intern")    || ltext.includes("trainee")  ||
      ltext.includes("engineer")  || ltext.includes("developer") ||
      ltext.includes("apprentice");

    if (!looksLikeJob) return;

    const fullUrl = safeUrl(href, company.link);
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    jobs.push({
      id:          fullUrl,
      title:       text,
      location:    company.defaultLocation || "",
      link:        fullUrl,
      description: "",
      company:     company.name,
    });
  });

  return jobs;
}

async function fetchJobs(company) {
  switch (company.source) {
    case "ashby":        return fetchAshby(company);
    case "greenhouse":   return fetchGreenhouse(company);
    case "lever":        return fetchLever(company);
    case "aspire_api":   return fetchAspireApi(company);
    case "careers_page": return fetchCareersPage(company);
    default: throw new Error(`Unknown source: "${company.source}"`);
  }
}

// ─── Email ────────────────────────────────────────────────────────────────────

const transporter = createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function buildEmailBody(job, filterResult) {
  const isOnsite  = filterResult.mode === "onsite";
  const modeBadge = isOnsite ? "🇮🇳 ONSITE — India" : "🌐 REMOTE — Global";
  const modeEmoji = isOnsite ? "🇮🇳" : "🌐";
  const matchLines = filterResult.reasons
    .filter(r => r.startsWith("✔"))
    .join("\n   ");

  const description = job.description?.trim()
    ? job.description
    : "Visit the job link for the full description.";

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

${description}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  WHY THIS MATCHED YOUR FILTERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   ${matchLines}

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
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const W = 60;
  const now = new Date().toUTCString();
  console.log(`\n${"═".repeat(W)}`);
  console.log(`🔍  Internship Alert v3  |  ${now}`);
  if (DRY_RUN || TEST_MODE) console.log("⚠   DRY RUN — no emails sent");
  console.log(`    Watching ${COMPANIES.length} companies`);
  console.log("═".repeat(W));

  const seen       = loadSeen();
  let totalNew     = 0;
  let totalMatched = 0;

  for (const company of COMPANIES) {
    let jobs = [];
    try {
      jobs = await fetchJobs(company);
    } catch (err) {
      console.log(`  ❌  ${company.name}: ${err.message}`);
      continue;
    }

    // Count only unseen jobs
    const newJobs    = jobs.filter(j => !seen[`${company.name}::${j.id}`]);
    const matchedJobs = [];

    for (const job of newJobs) {
      const uid  = `${company.name}::${job.id}`;
      const mode = classifyJob(job, company.type, company.defaultLocation);

      if (!mode) {
        seen[uid] = { title: job.title, mode: "skip", seenAt: new Date().toISOString(), matched: false };
        continue;
      }

      const result = applyFilters(job, mode);

      if (result.passed) {
        matchedJobs.push({ job, result });
        totalMatched++;
        try { await sendAlert(job, result); }
        catch (err) { console.log(`    ❌ Email error: ${err.message}`); }
      }

      seen[uid] = {
        title:   job.title,
        location: job.location,
        mode,
        seenAt:  new Date().toISOString(),
        matched: result.passed,
      };
    }

    totalNew += newJobs.length;

    // ── Concise company output ──
    if (newJobs.length > 0) {
      console.log(`\n📌  ${company.name}  [${jobs.length} total | ${newJobs.length} new | ${matchedJobs.length} matched]`);
      for (const { job, result } of matchedJobs) {
        const tag = result.mode === "onsite" ? "🇮🇳" : "🌐";
        console.log(`    ✅ ${tag} "${job.title}" — ${job.location || "n/a"}`);
        console.log(`       ${job.link}`);
      }
    }
  }

  saveSeen(seen);

  console.log(`\n${"─".repeat(W)}`);
  console.log(`✅  Done  |  ${totalNew} new jobs scanned  |  ${totalMatched} alert(s) sent`);
  console.log("─".repeat(W) + "\n");
}

main().catch(err => {
  console.error("💥 Fatal:", err.message);
  process.exit(1);
});
