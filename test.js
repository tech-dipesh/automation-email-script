/**
 * test.js — Quick sanity check for your filter logic
 * Run: node test.js
 *
 * No emails sent. No network calls. Just shows you exactly
 * which mock jobs pass/fail and why — so you can verify
 * the filters are working before the real run.
 */

// ─── Copy filter constants inline (no import needed) ──────────────────────

const INTERN_KEYWORDS = ["intern", "internship", "trainee", "apprentice"];
const SENIOR_KEYWORDS = [
  "senior", "sr.", " sr ", "staff", "lead", "principal",
  "manager", "director", "head of", "vp ", "vice president",
];
const INDIA_CITIES = [
  "bangalore", "bengaluru",
  "delhi", "new delhi", "ncr", "noida", "gurgaon", "gurugram", "faridabad",
  "hyderabad", "secunderabad",
  "mumbai", "bombay", "navi mumbai",
  "india",
];
const BLOCKED_LOCATION_PHRASES = [
  "us only", "usa only", "united states only",
  "uk only", "europe only", "eu only",
  "remote (us", "remote - us", "remote, us",
  "north america only", "americas only",
];
const EXPERIENCE_PATTERNS = [
  /\b[1-9]\+?\s*(?:year|yr)s?\s+(?:of\s+)?(?:experience|exp)\b/i,
  /\b(?:minimum|min\.?|at\s+least)\s+[1-9]\s+(?:year|yr)/i,
  /\b[1-9]\s*[-–to]+\s*[2-9]\s+years?\s+(?:of\s+)?(?:experience|exp)\b/i,
  /\brequires?\s+[1-9]\+?\s+years?\b/i,
  /\b[1-9]\+\s*yrs?\b/i,
];

function classifyJob(location, companyType) {
  const loc = (location || "").toLowerCase();
  if (BLOCKED_LOCATION_PHRASES.some(b => loc.includes(b))) return null;
  if (INDIA_CITIES.some(c => loc.includes(c))) return "onsite";
  if (["remote","anywhere","global","worldwide","apac","wfh","distributed"]
    .some(k => loc.includes(k))) return "remote";
  if (!loc.trim()) {
    if (companyType === "remote") return "remote";
    return null;
  }
  return null;
}

function applyFilters(job, mode) {
  const reasons = [];
  let passed = true;
  const t = job.title.toLowerCase();

  if (!INTERN_KEYWORDS.some(k => t.includes(k))) {
    reasons.push("❌ Title missing: intern / trainee / apprentice"); passed = false;
  } else reasons.push("✔ Entry-level keyword confirmed");

  if (SENIOR_KEYWORDS.some(k => t.includes(k))) {
    reasons.push("❌ Seniority keyword found in title"); passed = false;
  } else reasons.push("✔ No seniority conflict");

  if (mode === "onsite") {
    const cityMatch = INDIA_CITIES.find(c => (job.location||"").toLowerCase().includes(c));
    if (cityMatch) reasons.push(`✔ India metro: "${cityMatch}"`);
    else { reasons.push(`❌ Not in India metros: "${job.location}"`); passed = false; }
  } else {
    const blocked = BLOCKED_LOCATION_PHRASES.find(b => (job.location||"").toLowerCase().includes(b));
    if (blocked) { reasons.push(`❌ Geo-restricted: "${blocked}"`); passed = false; }
    else reasons.push("✔ No geo-restriction");
  }

  const combined = `${job.title} ${job.description}`;
  if (EXPERIENCE_PATTERNS.some(p => p.test(combined))) {
    reasons.push("❌ Experience requirement detected"); passed = false;
  } else reasons.push("✔ No experience requirement");

  return { passed, reasons, mode };
}

// ─── Mock Jobs ─────────────────────────────────────────────────────────────
// These represent the kinds of jobs that will be fetched live.
// Add your own test cases below!

const MOCK_JOBS = [
  // ── Should PASS: Onsite India ──────────────────────────────────────────
  { title: "Software Engineer Intern",        location: "Bangalore, India",  desc: "Join our team.",                      companyType: "onsite", expect: "PASS 🇮🇳" },
  { title: "Backend Intern",                  location: "Hyderabad, India",  desc: "Work on backend systems.",            companyType: "onsite", expect: "PASS 🇮🇳" },
  { title: "Frontend Trainee",                location: "Mumbai, India",     desc: "Build React apps.",                   companyType: "onsite", expect: "PASS 🇮🇳" },
  { title: "Full Stack Apprentice",           location: "Delhi NCR",         desc: "Full stack development role.",        companyType: "onsite", expect: "PASS 🇮🇳" },
  { title: "Graduate Trainee Engineer",       location: "Gurgaon, India",    desc: "Fresher welcome.",                    companyType: "onsite", expect: "PASS 🇮🇳" },

  // ── Should PASS: Remote ────────────────────────────────────────────────
  { title: "Software Engineering Intern",     location: "Remote",            desc: "Work from anywhere.",                 companyType: "remote", expect: "PASS 🌐" },
  { title: "Backend Internship",              location: "Remote - APAC",     desc: "Open to Asia.",                      companyType: "remote", expect: "PASS 🌐" },
  { title: "Trainee Developer",               location: "Global / Remote",   desc: "Worldwide applications welcome.",    companyType: "remote", expect: "PASS 🌐" },
  { title: "Frontend Intern",                 location: "",                  desc: "Distributed team.",                   companyType: "remote", expect: "PASS 🌐" },

  // ── Should FAIL: Experience required ──────────────────────────────────
  { title: "Software Engineer Intern",        location: "Bangalore, India",  desc: "Requires 1+ years of experience.",   companyType: "onsite", expect: "FAIL ❌" },
  { title: "Backend Internship",              location: "Remote",            desc: "2 years of experience required.",    companyType: "remote", expect: "FAIL ❌" },

  // ── Should FAIL: Senior role ───────────────────────────────────────────
  { title: "Senior Software Engineer Intern", location: "Bangalore, India",  desc: "Leadership required.",               companyType: "onsite", expect: "FAIL ❌" },
  { title: "Lead Trainee",                    location: "Remote",            desc: "Manage team.",                       companyType: "remote", expect: "FAIL ❌" },

  // ── Should FAIL: Not an intern role ───────────────────────────────────
  { title: "Software Engineer II",            location: "Hyderabad, India",  desc: "3 years exp needed.",                companyType: "onsite", expect: "FAIL ❌" },
  { title: "Backend Engineer",                location: "Remote",            desc: "Full time hire.",                    companyType: "remote", expect: "FAIL ❌" },

  // ── Should FAIL: Geo-restricted remote ────────────────────────────────
  { title: "Frontend Intern",                 location: "Remote (US only)",  desc: "US citizens only.",                  companyType: "remote", expect: "FAIL ❌" },
  { title: "Backend Internship",              location: "Remote - US only",  desc: "Must be in USA.",                    companyType: "remote", expect: "FAIL ❌" },
  { title: "SWE Intern",                      location: "Europe only",       desc: "EU residents.",                      companyType: "remote", expect: "FAIL ❌" },

  // ── Should FAIL: Onsite but outside India ─────────────────────────────
  { title: "Software Intern",                 location: "San Francisco, CA", desc: "US-based role.",                     companyType: "onsite", expect: "FAIL ❌" },
  { title: "Trainee Engineer",                location: "London, UK",        desc: "UK office.",                         companyType: "onsite", expect: "FAIL ❌" },
];

// ─── Run Tests ─────────────────────────────────────────────────────────────

const W = 66;
console.log("\n" + "═".repeat(W));
console.log("🧪  Internship Alert Filter Test");
console.log("    Testing " + MOCK_JOBS.length + " mock job scenarios");
console.log("═".repeat(W));

let passed = 0, failed = 0, unexpected = 0;

for (const job of MOCK_JOBS) {
  const mode = classifyJob(job.location, job.companyType);
  const modeStr = mode ? (mode === "onsite" ? "🇮🇳 onsite" : "🌐 remote") : "⚪ unclassified";

  let result;
  if (!mode) {
    result = { passed: false, reasons: ["⏭ Skipped — could not classify as onsite or remote"], mode: "none" };
  } else {
    result = applyFilters({ title: job.title, location: job.location, description: job.desc }, mode);
  }

  const actualPass = result.passed;
  const expectedPass = job.expect.startsWith("PASS");
  const matchExpect = actualPass === expectedPass;
  if (matchExpect) { if (actualPass) passed++; else failed++; }
  else unexpected++;

  const icon = matchExpect ? (actualPass ? "✅" : "⏭ ") : "🚨";
  console.log(`\n${icon} [${modeStr}] "${job.title}"`);
  console.log(`   Location : ${job.location || "(no location)"}`);
  console.log(`   Expected : ${job.expect}   |   Got : ${actualPass ? "PASS ✅" : "FAIL ❌"} ${matchExpect ? "" : "<< UNEXPECTED!"}`);
  for (const r of result.reasons) console.log(`     ${r}`);
}

console.log("\n" + "─".repeat(W));
console.log(`✅  ${passed} correctly MATCHED  |  ⏭  ${failed} correctly FILTERED  |  🚨 ${unexpected} UNEXPECTED`);
if (unexpected === 0) {
  console.log("🎉  All filters working correctly!");
} else {
  console.log("⚠   Fix the unexpected results above before deploying.");
}
console.log("─".repeat(W) + "\n");
