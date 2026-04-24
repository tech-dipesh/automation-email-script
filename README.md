# 🎯 Internship Job Alert System

Monitors Replit (Ashby), Aspire (careers page), and Xapo Bank (Greenhouse)
for new internship roles that are accessible from India/Nepal/Remote.
Sends instant Gmail alerts when a match is found.

---

## 📁 File Structure

```
internship-alert/
├── .github/workflows/job-check.yml  ← GitHub Actions (runs every 10 min)
├── checker.js                        ← Main logic
├── companies.json                    ← Company list (edit to add more)
├── seen_jobs.json                    ← Auto-updated; tracks seen jobs
├── package.json
└── README.md
```

---

## 🚀 Setup (One-time)

### Step 1 — Fork or create a GitHub repo

Upload all these files to a new GitHub repository.

---

### Step 2 — Get a Gmail App Password

> This is NOT your regular Gmail password.
> It's a special 16-character password for apps.

1. Go to: https://myaccount.google.com/apppasswords
2. Sign in as `dipesh77gautam@gmail.com`
3. App name: `InternshipBot` (anything)
4. Click **Create**
5. Copy the 16-character password shown (e.g. `abcd efgh ijkl mnop`)
   → Remove the spaces → `abcdefghijklmnop`

---

### Step 3 — Add GitHub Secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these 3 secrets:

| Secret Name         | Value                              |
|---------------------|------------------------------------|
| `GMAIL_USER`        | `dipesh77gautam@gmail.com`         |
| `GMAIL_APP_PASSWORD`| Your 16-char app password          |
| `ALERT_EMAIL`       | `dipesh77gautam@gmail.com`         |

---

### Step 4 — Enable GitHub Actions

Go to repo → **Actions** tab → Click **"I understand my workflows, go ahead and enable them"**

That's it. The workflow runs every 10 minutes automatically.

---

## 🧪 Test Locally

```bash
npm install
GMAIL_USER=dipesh77gautam@gmail.com \
GMAIL_APP_PASSWORD=your_app_password \
node checker.js --dry-run
```

`--dry-run` prints what would be emailed without actually sending.

---

## ✅ Filter Rules

### Role must contain:
- `intern` or `internship`

### Role must NOT contain:
- `senior`, `staff`, `lead`, `principal`, `manager`, `director`
- `graduate`, `early career`, `entry level`, `trainee`, `junior`

### Location must match (any of):
- India, Nepal, Remote, Anywhere, Global, APAC, Worldwide, Hybrid

### Location is rejected if it contains:
- `US only`, `UK only`, `Europe only`, `Germany only`, `London only`
- `Remote (US`, `Remote - US`, `North America only`

### Missing location → **Rejected** (safe, less noise)

---

## ➕ Adding More Companies

Edit `companies.json`:

```json
[
  { "name": "NewCo", "source": "ashby",      "link": "https://jobs.ashbyhq.com/newco" },
  { "name": "NewCo", "source": "greenhouse", "link": "https://job-boards.greenhouse.io/newco" },
  { "name": "NewCo", "source": "lever",      "link": "https://jobs.lever.co/newco" }
]
```

Supported sources: `ashby`, `greenhouse`, `careers_page`

---

## 📧 Email Format Example

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯  NEW INTERNSHIP ALERT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏢  Company   : Replit
💼  Role      : Software Engineer Intern
📍  Location  : Remote (Global)
🔗  Apply Now : https://...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋  ROLE OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
We're looking for a Software Engineer Intern to join...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  WHY THIS MATCHED YOUR FILTERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔ Internship role — no seniority conflict
✔ Location accessible — matched "remote"
```

---

## ⚠️ Notes

- **Aspire** uses a careers page (not API). If Aspire uses JavaScript rendering,
  the scraper may miss some jobs. In that case, switch to a manual API check
  by inspecting network requests on aspireapp.com/careers.

- `seen_jobs.json` is committed back after every run by the Action.
  Do not manually edit it unless you want to reset the seen state.

- GitHub Actions scheduled workflows can sometimes be delayed by a few minutes
  during high-traffic periods — this is normal.
