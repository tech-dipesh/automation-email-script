import httpx

CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1"

JOB_PLATFORM_QUERIES = [
    "site:wellfound.com",
    "site:indeed.co.in",
    "site:in.indeed.com",
    "site:naukri.com",
    "site:linkedin.com/jobs",
]


class CseBudget:
    def __init__(self, daily_limit):
        self.daily_limit = daily_limit
        self.used = 0

    def can_spend(self):
        return self.used < self.daily_limit

    def spend(self):
        self.used += 1


def _search(client, api_key, cse_id, query, budget, logger=None):
    if not budget.can_spend():
        if logger:
            logger.warn(f"CSE daily budget exhausted — skipping query: {query}")
        return None

    try:
        resp = client.get(
            CSE_ENDPOINT,
            params={"key": api_key, "cx": cse_id, "q": query, "num": 5},
            timeout=15,
        )
        budget.spend()
        if resp.status_code != 200:
            if logger:
                logger.warn(f"CSE query failed ({resp.status_code}): {query}")
            return None
        data = resp.json()
        return data.get("items", [])
    except Exception as err:
        if logger:
            logger.warn(f"CSE query error: {err}")
        return None


def find_company_career_url(client, api_key, cse_id, company_name, budget, logger=None):
    query = f'"{company_name}" careers OR "open positions" India'
    items = _search(client, api_key, cse_id, query, budget, logger)
    if not items:
        return None
    for item in items:
        link = item.get("link", "")
        if link:
            return link
    return None


def find_job_platform_listing(client, api_key, cse_id, company_name, budget, logger=None):
    for platform_filter in JOB_PLATFORM_QUERIES:
        query = f'"{company_name}" software intern {platform_filter}'
        items = _search(client, api_key, cse_id, query, budget, logger)
        if items:
            for item in items:
                link = item.get("link", "")
                if link:
                    return link, platform_filter
    return None, None
