# Internship Alert System v2

Automated job scanner that emails you every hour when a new internship appears that matches your exact criteria.

## Two Alert Modes

| Mode | Badge | Criteria |
|------|-------|----------|
| 🇮🇳 **ONSITE India** | `ONSITE` | Bangalore · Delhi NCR · Hyderabad · Mumbai |
| 🌐 **REMOTE Global** | `REMOTE` | Worldwide, Asian-applicant-friendly |

## What Gets Filtered Out (both modes)

- Roles needing **1+ year of experience** (checked in title AND description)
- **Senior / Lead / Staff / Manager / Director / Principal** in title
- **Remote: geo-restricted** listings (USA only, Europe only, UK only, North America only, etc.)
- **Onsite: outside India** — only Indian metro cities pass

## Target Roles

Software Engineer Intern · Frontend Intern · Backend Intern · Full Stack Intern · Trainee Engineer · Graduate Trainee · Apprentice

## Companies Watched: 109 total

- **39 Onsite-only** — Indian startups and companies (Razorpay, CRED, Swiggy, Zerodha, Paytm, Groww, Flipkart, etc.)
- **44 Both** — Big tech with India offices that also post remote (Google, Microsoft, Amazon, Adobe, Cisco, etc.)
- **26 Remote-only** — Global remote-first companies (GitLab, Canonical, Automattic, Figma, Notion, Zapier, etc.)

## Sources Used

| Source | How it works |
|--------|-------------|
| **Ashby API** | Direct JSON from `api.ashbyhq.com` |
| **Greenhouse API** | Direct JSON from `boards-api.greenhouse.io` |
| **Aspire API** | Paginated REST API |
| **careers_page** | HTML scraping via cheerio |

## Setup

### 1. GitHub Secrets (Settings → Secrets → Actions)

| Secret | Value |
|--------|-------|
| `GMAIL_USER` | your Gmail address |
| `GMAIL_APP_PASSWORD` | [App Password](https://myaccount.google.com/apppasswords) (not your real password) |
| `ALERT_EMAIL` | email to receive alerts (can be the same Gmail) |

### 2. Enable GitHub Actions

Push this repo and the workflow runs automatically every hour.
You can also trigger it manually: **Actions → Internship Job Alert v2 → Run workflow**

### 3. Local `.env` (for dry runs)

```
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
ALERT_EMAIL=you@gmail.com
```

## Commands

```bash
npm test       # Run filter tests — no network, no email (do this anytime)
npm run dry    # Dry run — fetches real jobs, prints email previews, no email sent
npm start      # Full live run — fetches + sends real email alerts
```

## Email Format

```
🇮🇳 ONSITE | Software Engineer Intern @ Razorpay     ← subject
🌐 REMOTE  | Backend Internship @ GitLab               ← subject

🏢 Company   : Razorpay
💼 Role      : Software Engineer Intern
📍 Location  : Bangalore, India
🔗 Apply Now : https://...

📋 ROLE OVERVIEW
...

✅ WHY THIS MATCHED YOUR FILTERS
   ✔ Entry-level keyword confirmed in title
   ✔ No seniority conflict
   ✔ India metro confirmed: "bangalore"
   ✔ No experience requirement found
```

## How seen_jobs.json Works

Every job that has been seen (pass or fail) is saved with a timestamp. On each hourly run, already-seen jobs are skipped — so you only ever get notified once per new job. GitHub Actions commits this file back to the repo after every run.
