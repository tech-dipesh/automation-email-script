import argparse
import json
import random
import time
from datetime import datetime, timezone

import httpx

import config
from utils.logger import get_logger
from utils.dedup import load_seen, save_seen, is_seen, mark_seen, make_job_id, reset_seen
from matching.regex_filter import filter_jobs
from matching.groq_classifier import classify_candidates
from scrapers.ats_apis import try_ats_apis
from scrapers.html_scraper import fetch_with_retry, fetch_with_playwright, extract_jobs_from_html, needs_playwright
from scrapers.career_finder import CseBudget, find_company_career_url, find_job_platform_listing
from notify.sender import send_alert

log = get_logger("scraper", config.LOG_LEVEL)

def load_companies(path):
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        return data, data
    return data.get("companies", []), data

def save_companies(data, companies, path):
    data["companies"] = companies
    data.setdefault("meta", {})["total_companies"] = len(companies)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def scrape_from_url(client, url, logger):
    ats_jobs, resolver_name = try_ats_apis(client, url)
    if ats_jobs is not None:
        return filter_jobs([{**j, "url": j.get("url") or url} for j in ats_jobs]), True

    html = None
    if not needs_playwright(url):
        html = fetch_with_retry(client, url, config.MAX_RETRIES, logger)
    if not html:
        html = fetch_with_playwright(url, config.PLAYWRIGHT_TIMEOUT, logger)

    if not html:
        return [], False

    return extract_jobs_from_html(html, url), True


def scrape_company(client, company, cse_budget, logger):
    name = company["name"]
    url = company["careers_url"]
    logger.info(f"🔍  {name:<40} {url[:60]}")

    jobs, fetch_ok = scrape_from_url(client, url, logger)

    if fetch_ok and jobs:
        return jobs, True

    if not fetch_ok:
        logger.warn(f"  ✗  Website unreachable: {name} — trying to resolve a fresh URL")
        if config.GOOGLE_CSE_API_KEY and config.GOOGLE_CSE_ID:
            new_url = find_company_career_url(
                client, config.GOOGLE_CSE_API_KEY, config.GOOGLE_CSE_ID, name, cse_budget, logger
            )
            if new_url and new_url != url:
                company["careers_url"] = new_url
                jobs, fetch_ok = scrape_from_url(client, new_url, logger)
                if fetch_ok and jobs:
                    return jobs, True

    if config.GOOGLE_CSE_API_KEY and config.GOOGLE_CSE_ID:
        platform_url, platform = find_job_platform_listing(
            client, config.GOOGLE_CSE_API_KEY, config.GOOGLE_CSE_ID, name, cse_budget, logger
        )
        if platform_url:
            logger.info(f"  ↳ trying job platform ({platform}): {platform_url}")
            platform_jobs, platform_ok = scrape_from_url(client, platform_url, logger)
            if platform_ok and platform_jobs:
                return platform_jobs, True

    if not fetch_ok:
        return [], False

    return [], True


def run(dry_run=False, target_company=None):
    t0 = time.time()
    log.info("=" * 64)
    log.info(f"India Job Scraper — Python v1 — {datetime.now().isoformat()}")
    log.info("=" * 64)

    companies, raw_data = load_companies(config.COMPANIES_FILE)
    store = load_seen(config.SEEN_JOBS_FILE)
    cse_budget = CseBudget(config.CSE_DAILY_BUDGET)

    if target_company:
        companies = [c for c in companies if target_company.lower() in c["name"].lower()]
        if not companies:
            log.error(f'No company matching "{target_company}"')
            return

    log.info(f"Companies to scrape : {len(companies)}")
    log.info(f"Already tracked     : {store.get('total_seen', 0)} jobs")

    new_jobs = []
    dropped_companies = []
    surviving_companies = []
    errors = 0

    with httpx.Client() as client:
        for i, company in enumerate(companies):
            log.info(f"[{i + 1:>4}/{len(companies)}]")
            try:
                jobs, fetch_ok = scrape_company(client, company, cse_budget, log)
            except Exception as err:
                log.error(f"  💥  {company['name']}: {err}")
                errors += 1
                jobs, fetch_ok = [], True

            if not fetch_ok:
                log.warn(f"  🗑️  Dropping {company['name']} — no working link found anywhere")
                dropped_companies.append(company["name"])
                continue

            surviving_companies.append(company)

            candidates = [
                {
                    "id": f"{i}-{j}",
                    "company": company["name"],
                    "title": job["title"],
                    "url": job.get("url") or company["careers_url"],
                    "category": company.get("category", ""),
                }
                for j, job in enumerate(jobs)
            ]

            if candidates and config.GROQ_API_KEY:
                accepted = classify_candidates(candidates, config.GROQ_API_KEY, config.GROQ_MODEL, logger=log)
            else:
                accepted = candidates

            for job in accepted:
                ids = make_job_id(job["company"], job["title"], job["url"])
                if not is_seen(ids, store):
                    job["found_date"] = datetime.now(timezone.utc).date().isoformat()
                    new_jobs.append(job)
                    mark_seen(ids, job, store)
                    log.info(f"  🆕  NEW: {job['title']}  [{job['company']}]")

            save_seen(store, config.SEEN_JOBS_FILE)
            if i < len(companies) - 1:
                time.sleep(random.uniform(1.0, 3.0))

    if dropped_companies:
        save_companies(raw_data, surviving_companies, config.COMPANIES_FILE)
        log.info(f"Removed {len(dropped_companies)} companies with no working link: {', '.join(dropped_companies)}")

    elapsed = (time.time() - t0) / 60
    log.info("-" * 64)
    log.info(f"Done in {elapsed:.1f} min | New: {len(new_jobs)} | Errors: {errors} | Dropped companies: {len(dropped_companies)}")
    log.info(f"CSE queries used today: {cse_budget.used}/{cse_budget.daily_limit}")
    log.info("=" * 64)

    send_alert(new_jobs, config.GMAIL_USER, config.GMAIL_APP_PASSWORD, config.ALERT_EMAIL, dry_run, log)

    if new_jobs:
        print(f"\n🎉  {len(new_jobs)} new job(s) found!\n")
    else:
        print("\n😴  No new jobs this run.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--company", type=str, default=None)
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--test-email", action="store_true")
    args = parser.parse_args()

    if args.reset:
        reset_seen(config.SEEN_JOBS_FILE)
        log.info("seen_jobs.json cleared.")

    if args.test_email:
        send_alert(
            [{
                "company": "Test Company",
                "title": "Software Engineering Intern — Summer 2026",
                "url": "https://example.com/apply",
                "found_date": datetime.now(timezone.utc).date().isoformat(),
            }],
            config.GMAIL_USER, config.GMAIL_APP_PASSWORD, config.ALERT_EMAIL,
            dry_run=False, logger=log,
        )
    else:
        run(dry_run=args.dry_run, target_company=args.company)
