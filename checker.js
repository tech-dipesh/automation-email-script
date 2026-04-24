/**
 * Internship Job Alert System
 * Sources: Ashby API, Greenhouse API, Aspire API, careers page (HTML fallback)
 * Alerts:  Gmail via Nodemailer
 * Runs:    GitHub Actions every 10 min (or locally with .env)
 */

// Load .env when running locally — GitHub Actions uses repo Secrets instead
import "dotenv/config"

import { createTransport } from "nodemailer";
import axios from "axios";
import { load } from "cheerio";
import { readFileSync, writeFileSync } from "fs";

// ─── Config ────────────────────────────────────────────────────────────────

const COMPANIES_FILE = "companies.json";
const SEEN_FILE      = "seen_jobs.json";
const DRY_RUN        = process.argv.includes("--dry-run");

const COMPANIES = JSON.parse(readFileSync(COMPANIES_FILE, "utf8"));

// ─── Seen Jobs (persisted to seen_jobs.json, committed by GitHub Action) ───

function loadSeen() {
  try { return JSON.parse(readFileSync(SEEN_FILE, "utf8")); }
  catch { return {}; }
}

function saveSeen(seen) {
  writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

// ─── Filter Rules ──────────────────────────────────────────────────────────

const INTERN_KEYWORDS     = ["intern", "internship"];
const SENIOR_KEYWORDS     = ["senior", "staff", "lead", "principal", "manager", "director"];
const REJECTED_ROLE_WORDS = ["graduate", "early career", "entry level", "trainee", "junior"];

const ALLOWED_LOCATION_KEYWORDS = [
  "india", "nepal", "remote", "anywhere", "global", "apac", "worldwide", "hybrid",
];

// Blocked even if "remote" appears — these mean NOT accessible from India/Nepal
const BLOCKED_LOCATION_PHRASES = [
  "us only", "usa only", "united states only",
  "uk only", "europe only", "germany only", "london only",
  "us-only", "uk-only", "north america only", "americas only",
  "remote (us", "remote - us", "remote – us",
];

function checkRole(title) {
  const t = title.toLowerCase();
  if (!INTERN_KEYWORDS.some((k) => t.includes(k)))
    return { ok: false, reason: "Not an internship role" };
  if (SENIOR_KEYWORDS.some((k) => t.includes(k)))
    return { ok: false, reason: "Senior/Lead/Manager keyword found in title" };
  if (REJECTED_ROLE_WORDS.some((k) => t.includes(k)))
    return { ok: false, reason: "Rejected keyword (graduate/trainee/junior/etc.)" };
  return { ok: true, reason: "✔ Internship title — no seniority conflict" };
}

function checkLocation(location) {
  if (!location || location.trim() === "")
    return { ok: false, reason: "No location listed — rejected for safety" };

  const l = location.toLowerCase();

  const blocked = BLOCKED_LOCATION_PHRASES.find((b) => l.includes(b));
  if (blocked) return { ok: false, reason: `Location blocked — contains "${blocked}"` };

  const allowed = ALLOWED_LOCATION_KEYWORDS.find((a) => l.includes(a));
  if (allowed) return { ok: true, reason: `✔ Location accessible — matched "${allowed}"` };

  return { ok: false, reason: `Location not in allowed list: "${location}"` };
}

function passesAllFilters(job) {
  const role     = checkRole(job.title);
  const location = checkLocation(job.location);
  return {
    passed:  role.ok && location.ok,
    reasons: [role.reason, location.reason],
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Strip HTML tags, collapse whitespace, trim to maxLen chars */
function htmlToText(html, maxLen = 600) {
  if (!html) return "No description available.";
  const text = load(html).text().replace(/\s+/g, " ").trim();
  return text.length > maxLen ? text.substring(0, maxLen) + "…" : text;
}

const HTTP = axios.create({
  timeout: 15000,
  headers: { "User-Agent": "InternshipAlertBot/1.0 (github-actions)" },
});

// ─── Fetchers ──────────────────────────────────────────────────────────────

/** Ashby public posting API */
async function fetchAshby(company) {
  const slug = new URL(company.link).pathname.replace(/^\//, "").split("/")[0];
  const res  = await HTTP.get(
    `https://api.ashbyhq.com/posting-api/job-board/${slug}`
  );
  return (res.data.jobPostings || []).map((j) => ({
    id:          j.id,
    title:       j.title || "",
    location:    j.locationName || j.location?.name || "",
    link:        j.externalLink || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
    description: j.descriptionPlain
      ? j.descriptionPlain.substring(0, 600) + "…"
      : htmlToText(j.descriptionHtml),
    company:     company.name,
  }));
}

/** Greenhouse public jobs API */
async function fetchGreenhouse(company) {
  const slug = new URL(company.link).pathname.replace(/^\//, "").split("/")[0];
  const res  = await HTTP.get(
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
  );
  return (res.data.jobs || []).map((j) => ({
    id:          String(j.id),
    title:       j.title || "",
    location:    j.location?.name || "",
    link:        j.absolute_url,
    description: htmlToText(j.content),
    company:     company.name,
  }));
}

/**
 * Aspire API — revolutpeople.com (discovered via Network tab)
 * Paginates automatically until no more jobs are returned.
 *
 * TO SWITCH BACK TO HTML SCRAPING:
 *   In companies.json change "source": "aspire_api"  →  "source": "careers_page"
 *   No code changes needed.
 */
async function fetchAspireApi(company) {
  const baseUrl = company.apiUrl;
  const jobs    = [];
  let   page    = 1;

  while (true) {
    const res  = await HTTP.get(`${baseUrl}?page=${page}`);
    const body = res.data;

    // Handle both { data: [...] } and top-level array responses
    const raw = Array.isArray(body)
      ? body
      : body.data || body.jobs || body.postings || body.results || [];

    if (!raw.length) break; // no more pages

    for (const j of raw) {
      // Normalise field names — Aspire/Revolut People API may vary slightly
      const title    = j.title || j.name || j.job_title || "";
      const location =
        j.location?.name ||
        j.location ||
        j.office?.location ||
        j.office?.name ||
        j.city ||
        "";
      const link     =
        j.url ||
        j.applyUrl ||
        j.apply_url ||
        j.absoluteUrl ||
        `${company.link}`;
      const desc     =
        j.descriptionPlain ||
        htmlToText(j.description || j.content || j.body || "");

      jobs.push({
        id:          String(j.id || j.uuid || link),
        title,
        location:    typeof location === "string" ? location : JSON.stringify(location),
        link,
        description: typeof desc === "string" ? desc.substring(0, 600) + "…" : "",
        company:     company.name,
      });
    }

    // If fewer results than a typical page size, assume last page
    if (raw.length < 10) break;
    page++;
  }

  return jobs;
}

/** Generic HTML scraper — fallback for pages without a public API */
async function fetchCareersPage(company) {
  const res = await HTTP.get(company.link);
  const $   = load(res.data);
  const jobs = [];
  const seen = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().replace(/\s+/g, " ").trim();

    if (!text || text.length < 6 || text.length > 120) return;

    const lhref = href.toLowerCase();
    const ltext = text.toLowerCase();
    const looksLikeJob =
      lhref.includes("job") || lhref.includes("career") ||
      lhref.includes("position") || lhref.includes("role") ||
      ltext.includes("intern") || ltext.includes("engineer") ||
      ltext.includes("analyst") || ltext.includes("designer");

    if (!looksLikeJob) return;

    const fullUrl = href.startsWith("http")
      ? href
      : new URL(href, company.link).href;

    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    jobs.push({
      id:          fullUrl,
      title:       text,
      location:    "",
      link:        fullUrl,
      description: "Visit the job link for the full description.",
      company:     company.name,
    });
  });

  return jobs;
}

// ─── Router ────────────────────────────────────────────────────────────────

async function fetchJobs(company) {
  switch (company.source) {
    case "ashby":        return fetchAshby(company);
    case "greenhouse":   return fetchGreenhouse(company);
    case "aspire_api":   return fetchAspireApi(company);
    case "careers_page": return fetchCareersPage(company);
    default:
      throw new Error(`Unknown source type: "${company.source}"`);
  }
}

// ─── Email ─────────────────────────────────────────────────────────────────

const transporter = createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function buildEmailBody(job, filterResult) {
  const matchLines = filterResult.reasons
    .filter((r) => r.startsWith("✔"))
    .join("\n   ");

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯  NEW INTERNSHIP ALERT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏢  Company   : ${job.company}
💼  Role      : ${job.title}
📍  Location  : ${job.location || "Not specified"}
🔗  Apply Now : ${job.link}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋  ROLE OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${job.description}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  WHY THIS MATCHED YOUR FILTERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   ${matchLines}

📌 Full filter check:
${filterResult.reasons.map((r) => "   " + r).join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰  Detected : ${new Date().toUTCString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();
}

async function sendAlert(job, filterResult) {
  const subject = `🎯 New Internship – ${job.title} @ ${job.company}`;
  const body    = buildEmailBody(job, filterResult);

  if (DRY_RUN) {
    console.log("\n📧 [DRY RUN] Email preview:");
    console.log("   Subject:", subject);
    console.log(body);
    return;
  }

  await transporter.sendMail({
    from:    `"Internship Alert Bot" <${process.env.GMAIL_USER}>`,
    to:      process.env.ALERT_EMAIL || process.env.GMAIL_USER,
    subject,
    text:    body,
  });

  console.log(`   📧 Email sent → "${job.title}" @ ${job.company}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(55)}`);
  console.log(`🔍 Internship Alert Check — ${new Date().toUTCString()}`);
  if (DRY_RUN) console.log("⚠  DRY RUN MODE — no emails will be sent");
  console.log("═".repeat(55));

  const seen = loadSeen();
  let totalNew = 0, totalMatched = 0;

  for (const company of COMPANIES) {
    console.log(`\n📌 ${company.name} [${company.source}]`);

    let jobs = [];
    try {
      jobs = await fetchJobs(company);
      console.log(`   📂 ${jobs.length} job(s) fetched`);
    } catch (err) {
      console.error(`   ❌ Fetch error: ${err.message}`);
      continue;
    }

    for (const job of jobs) {
      const uid = `${company.name}::${job.id}`;
      if (seen[uid]) continue;
      totalNew++;

      const result = passesAllFilters(job);

      if (result.passed) {
        totalMatched++;
        console.log(`   ✅ MATCH: "${job.title}" (${job.location})`);
        try {
          await sendAlert(job, result);
        } catch (err) {
          console.error(`   ❌ Email error: ${err.message}`);
        }
      } else {
        const why = result.reasons.find((r) => !r.startsWith("✔")) || "filtered";
        console.log(`   ⏭  Skip : "${job.title}" → ${why}`);
      }

      // Mark seen regardless — avoids re-processing non-matching jobs each run
      seen[uid] = {
        title:   job.title,
        location: job.location,
        seenAt:  new Date().toISOString(),
        matched: result.passed,
      };
    }
  }

  saveSeen(seen);
  console.log(`\n${"─".repeat(55)}`);
  console.log(`✅  Done. ${totalNew} new job(s) processed, ${totalMatched} alert(s) sent.`);
  console.log("─".repeat(55) + "\n");
}

main().catch((err) => {
  console.error("💥 Fatal error:", err.message);
  process.exit(1);
});