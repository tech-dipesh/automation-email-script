import random
import time
from urllib.parse import urljoin, urlparse

import httpx
from selectolax.parser import HTMLParser

from matching.regex_filter import clean_title, filter_jobs

UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
]

PW_HOSTS = {
    "careers.google.com", "careers.microsoft.com", "www.amazon.jobs",
    "www.metacareers.com", "jobs.apple.com", "careers.linkedin.com",
    "careers.snap.com", "careers.uber.com", "careers.jpmorgan.com",
    "www.goldmansachs.com", "careers.servicenow.com",
}

ATS_SELECTORS = [
    "[class*=opening]", "[class*=job-title]", "[class*=job_title]",
    "[class*=posting-title]", "[class*=posting-name]",
    "[data-automation-id=jobPostingTitle]",
    "[class*=jobTitle]", "[class*=position-title]",
    "[class*=role-title]", "[class*=career-title]",
    "[class*=listing-title]", "[class*=vacancy-title]",
    "[class*=opportunity-title]", "[class*=job-listing]",
]


def base_headers():
    return {
        "User-Agent": random.choice(UAS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "DNT": "1",
    }


def needs_playwright(url):
    try:
        host = urlparse(url).netloc
    except Exception:
        return False
    return (
        host in PW_HOSTS
        or "workday" in host
        or "myworkdayjobs" in host
        or "greenhouse.io" in host
        or "lever.co" in host
    )


def fetch_with_retry(client, url, max_retries=3, logger=None):
    for attempt in range(1, max_retries + 1):
        try:
            resp = client.get(url, headers=base_headers(), timeout=20, follow_redirects=True)
            if resp.status_code in (404, 410):
                return None
            if resp.status_code == 429:
                wait = min(2 ** attempt + random.uniform(0.5, 2), 30)
                if logger:
                    logger.warn(f"  429 rate limited — backing off {wait:.1f}s")
                time.sleep(wait)
                continue
            if resp.status_code == 503:
                time.sleep(min(2 ** attempt, 15))
                continue
            if 200 <= resp.status_code < 400:
                return resp.text
            time.sleep(random.uniform(1.5, 3.5) * attempt)
        except httpx.RequestError:
            time.sleep(random.uniform(1.5, 3.5) * attempt)
    return None


def extract_jobs_from_html(html, base_url=""):
    tree = HTMLParser(html)
    raw = {}

    def resolve_href(href):
        if not href:
            return ""
        if href.startswith("http"):
            return href
        if href.startswith("javascript:"):
            return ""
        try:
            return urljoin(base_url, href)
        except Exception:
            return ""

    def add(title, url=""):
        t = clean_title(title)
        if not t:
            return
        raw[(t, url)] = {"title": t, "url": url}

    for sel in ATS_SELECTORS:
        try:
            for el in tree.css(sel):
                add(el.text(deep=True), resolve_href(el.attributes.get("href", "")))
        except Exception:
            pass

    for a in tree.css("a[href]"):
        add(a.text(deep=True), resolve_href(a.attributes.get("href", "")))

    for h in tree.css("h1,h2,h3,h4"):
        parent = h.parent
        href = ""
        while parent is not None:
            if parent.tag == "a":
                href = parent.attributes.get("href", "")
                break
            parent = parent.parent
        add(h.text(deep=True), resolve_href(href))

    for line in tree.text(deep=True).split("\n"):
        t = clean_title(line)
        if 4 <= len(t) <= 100:
            add(t)

    return filter_jobs(list(raw.values()))


PW_BLOCK_TYPES = {"image", "media", "font", "stylesheet"}
STEALTH_JS = """
Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});
Object.defineProperty(navigator,'languages',{get:()=>['en-US','en','hi']});
window.chrome={runtime:{}};
"""


def fetch_with_playwright(url, timeout_ms=30000, logger=None):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        if logger:
            logger.warn("playwright not installed — skipping JS-rendered fetch")
        return None

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox", "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                    "--window-size=1366,768",
                ],
            )
            page = browser.new_page(user_agent=random.choice(UAS))
            page.add_init_script(STEALTH_JS)

            def block_route(route):
                if route.request.resource_type in PW_BLOCK_TYPES:
                    route.abort()
                else:
                    route.continue_()

            page.route("**/*", block_route)
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_timeout(random.randint(1500, 3000))
            html = page.content()
            browser.close()
            return html
    except Exception as err:
        if logger:
            logger.debug(f"  Playwright error: {err}")
        return None
