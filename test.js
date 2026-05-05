/**
 * test.js — Filter sanity check (no network, no email)
 * Run: node test.js
 */

const INTERN_RE      = /\b(intern|internship|trainee|apprentice|graduate\s+trainee|grad\s+trainee)\b/i;
const SWE_DOMAIN_RE  = /\b(software|engineer|developer|full[\s-]?stack|frontend|front[\s-]end|backend|back[\s-]end|devops|dev[\s-]ops|swe|sde|web[\s-]?dev|mobile|android|ios|react|node|java|python|cloud|platform|infrastructure|infra|site[\s-]?reliab|data[\s-]?engin|ml|machine[\s-]?learn|deep[\s-]?learn|ai|computer[\s-]?vision|nlp|embedded|firmware|systems)\b/i;
const SENIOR_RE      = /\b(senior|sr\b|lead|leader|staff|principal|manager|director|head\s+of|vp\b|vice\s+president)\b/i;
const INDIA_CITIES = ["bangalore","bengaluru","delhi","new delhi","ncr","noida","gurgaon","gurugram","faridabad","hyderabad","secunderabad","mumbai","bombay","navi mumbai","chandigarh","mohali","panchkula","pune","hinjewadi","chennai","coimbatore","kolkata","ahmedabad","india"];
const BLOCKED_LOCS   = ["us only","usa only","united states only","uk only","europe only","eu only","north america only","americas only","canada only","australia only","us-only","uk-only","remote (us","remote - us","remote, us","remote / us","remote (united states","remote (canada"];
const EXP_RE         = [
  /\b[1-9]\+?\s*(?:year|yr)s?\s+(?:of\s+)?(?:experience|exp)\b/i,
  /\b(?:minimum|min\.?|at\s+least)\s+[1-9]\s+(?:year|yr)/i,
  /\b[1-9]\s*[-–to]+\s*[2-9]\s+years?\s+(?:of\s+)?(?:experience|exp)\b/i,
  /\brequires?\s+[1-9]\+?\s+years?\b/i,
  /\b[1-9]\+\s*yrs?\b/i,
];

function classifyJob(location, companyType) {
  const loc = (location || "").toLowerCase();
  if (BLOCKED_LOCS.some(b => loc.includes(b)))    return null;
  if (INDIA_CITIES.some(c => loc.includes(c)))    return "onsite";
  if (["remote","anywhere","global","worldwide","apac","wfh","distributed"].some(k => loc.includes(k))) return "remote";
  if (!loc.trim() && companyType === "remote")    return "remote";
  return null;
}

function applyFilters(title, location, desc, mode) {
  const reasons = [];
  let passed = true;

  if (!INTERN_RE.test(title)) { reasons.push("❌ Not intern/trainee/apprentice"); passed = false; }
  else reasons.push(`✔ Entry-level: "${title.match(INTERN_RE)?.[0]}"`);

  if (!SWE_DOMAIN_RE.test(title)) { reasons.push("❌ Not SWE domain"); passed = false; }
  else reasons.push(`✔ SWE domain: "${title.match(SWE_DOMAIN_RE)?.[0]}"`);

  if (SENIOR_RE.test(title)) { reasons.push("❌ Seniority keyword"); passed = false; }
  else reasons.push("✔ No seniority");

  if (mode === "onsite") {
    const city = INDIA_CITIES.find(c => (location||"").toLowerCase().includes(c));
    if (city) reasons.push(`✔ India metro: "${city}"`);
    else { reasons.push(`❌ Not India metro: "${location}"`); passed = false; }
  } else {
    const blocked = BLOCKED_LOCS.find(b => (location||"").toLowerCase().includes(b));
    if (blocked) { reasons.push(`❌ Geo-restricted: "${blocked}"`); passed = false; }
    else reasons.push("✔ Open to Asian applicants");
  }

  if (EXP_RE.some(p => p.test(`${title} ${desc}`))) { reasons.push("❌ Experience required"); passed = false; }
  else reasons.push("✔ No experience requirement");

  return { passed, reasons };
}

const TESTS = [
  // ✅ Should PASS — Onsite India SWE
  { title: "Software Engineer Intern",          loc: "Bangalore, India",  desc: "",                             ct: "onsite", want: "PASS 🇮🇳" },
  { title: "Backend Intern",                    loc: "Hyderabad, India",  desc: "Build APIs with Node.js.",     ct: "onsite", want: "PASS 🇮🇳" },
  { title: "Frontend Trainee",                  loc: "Mumbai, India",     desc: "Build React UIs.",             ct: "onsite", want: "PASS 🇮🇳" },
  { title: "Full Stack Apprentice",             loc: "Delhi NCR",         desc: "Web development.",             ct: "onsite", want: "PASS 🇮🇳" },
  { title: "Graduate Trainee Engineer",         loc: "Gurgaon, India",    desc: "Freshers welcome.",            ct: "onsite", want: "PASS 🇮🇳" },
  { title: "DevOps Intern",                     loc: "Noida, India",      desc: "CI/CD and cloud infra.",       ct: "onsite", want: "PASS 🇮🇳" },
  { title: "Mobile Developer Intern",           loc: "Bangalore, India",  desc: "Android/iOS dev.",             ct: "onsite", want: "PASS 🇮🇳" },
  { title: "SDE Intern",                        loc: "Bangalore, India",  desc: "Systems engineering.",        ct: "onsite", want: "PASS 🇮🇳" },
  // ✅ Should PASS — Remote SWE
  { title: "Software Engineering Intern",       loc: "Remote",            desc: "Work from anywhere.",          ct: "remote", want: "PASS 🌐" },
  { title: "Backend Internship",                loc: "Remote - APAC",     desc: "Open to Asia.",                ct: "remote", want: "PASS 🌐" },
  { title: "Frontend Developer Intern",         loc: "Global / Remote",   desc: "React, TypeScript.",           ct: "remote", want: "PASS 🌐" },
  { title: "Full Stack Trainee",                loc: "",                  desc: "Distributed team.",            ct: "remote", want: "PASS 🌐" },
  // ❌ Should FAIL — Wrong role (HR/Finance/Audit)
  { title: "Internal Auditor Intern",           loc: "Bangalore, India",  desc: "",                             ct: "onsite", want: "FAIL ❌ (not SWE)" },
  { title: "HR Intern",                         loc: "Bangalore, India",  desc: "Talent acquisition.",          ct: "onsite", want: "FAIL ❌ (not SWE)" },
  { title: "Finance Intern",                    loc: "Mumbai, India",     desc: "Accounts and audit.",          ct: "onsite", want: "FAIL ❌ (not SWE)" },
  { title: "Marketing Intern",                  loc: "Delhi NCR",         desc: "Digital campaigns.",           ct: "onsite", want: "FAIL ❌ (not SWE)" },
  // ❌ Should FAIL — "internal" must NOT match "intern" (THE BUG)
  { title: "Internal AuditorInternal AuditBangaloreFull-timeClick to view", loc: "Bangalore, India", desc: "", ct: "onsite", want: "FAIL ❌ (internal≠intern)" },
  // ❌ Should FAIL — Senior/Lead
  { title: "Senior Software Engineer Intern",   loc: "Bangalore, India",  desc: "",                             ct: "onsite", want: "FAIL ❌ (senior)" },
  { title: "Lead Backend Trainee",              loc: "Remote",            desc: "Manage the team.",             ct: "remote", want: "FAIL ❌ (lead)" },
  // ❌ Should FAIL — Experience required
  { title: "Software Engineer Intern",          loc: "Bangalore, India",  desc: "Requires 1+ years experience.",ct: "onsite", want: "FAIL ❌ (exp)" },
  { title: "Frontend Intern",                   loc: "Remote",            desc: "2 years experience needed.",   ct: "remote", want: "FAIL ❌ (exp)" },
  // ❌ Should FAIL — Geo-restricted remote
  { title: "Backend Intern",                    loc: "Remote (US only)",  desc: "",                             ct: "remote", want: "FAIL ❌ (geo)" },
  { title: "Software Intern",                   loc: "Remote, US",        desc: "",                             ct: "remote", want: "FAIL ❌ (geo)" },
  { title: "Frontend Internship",               loc: "Europe only",       desc: "",                             ct: "remote", want: "FAIL ❌ (geo)" },
  // ❌ Should FAIL — Onsite outside India
  { title: "Software Intern",                   loc: "San Francisco, CA", desc: "",                             ct: "onsite", want: "FAIL ❌ (not India)" },
  { title: "Trainee Engineer",                  loc: "London, UK",        desc: "",                             ct: "onsite", want: "FAIL ❌ (not India)" },
];

const W = 64;
console.log("\n" + "═".repeat(W));
console.log("🧪  Internship Alert v3 — Filter Test");
console.log(`    ${TESTS.length} test cases`);
console.log("═".repeat(W));

let pass = 0, fail = 0, unexpected = 0;

for (const t of TESTS) {
  const mode    = classifyJob(t.loc, t.ct);
  const modeStr = mode === "onsite" ? "🇮🇳" : mode === "remote" ? "🌐" : "⚪";

  let result;
  if (!mode) {
    result = { passed: false, reasons: ["⏭ Unclassified location"] };
  } else {
    result = applyFilters(t.title, t.loc, t.desc, mode);
  }

  const expectedPass = t.want.startsWith("PASS");
  const ok           = result.passed === expectedPass;
  if (ok) { if (result.passed) pass++; else fail++; }
  else unexpected++;

  const icon = ok ? (result.passed ? "✅" : "⏭ ") : "🚨";
  console.log(`\n${icon} ${modeStr} "${t.title}"`);
  if (!ok) console.log(`   🚨 UNEXPECTED! Expected: ${t.want} | Got: ${result.passed ? "PASS" : "FAIL"}`);
  result.reasons.forEach(r => console.log(`     ${r}`));
}

console.log("\n" + "─".repeat(W));
console.log(`✅ ${pass} matched correctly  |  ⏭  ${fail} filtered correctly  |  🚨 ${unexpected} unexpected`);
console.log(unexpected === 0 ? "🎉 All filters working correctly!" : "⚠  Fix unexpected results before deploying!");
console.log("─".repeat(W) + "\n");
