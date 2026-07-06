import re
import httpx


def _get_json(client, url):
    try:
        resp = client.get(url, timeout=20)
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        return None


def greenhouse_jobs(client, url):
    m = re.search(r"boards\.greenhouse\.io/([^/?#\s]+)", url)
    if not m:
        return None
    data = _get_json(client, f"https://boards-api.greenhouse.io/v1/boards/{m.group(1)}/jobs?content=true")
    if not data or "jobs" not in data:
        return None
    return [{"title": j.get("title", ""), "url": j.get("absolute_url", "")} for j in data["jobs"]]


def lever_jobs(client, url):
    m = re.search(r"jobs\.lever\.co/([^/?#\s]+)", url)
    if not m:
        return None
    data = _get_json(client, f"https://api.lever.co/v0/postings/{m.group(1)}?mode=json")
    if not isinstance(data, list):
        return None
    return [{"title": j.get("text", ""), "url": j.get("hostedUrl", "")} for j in data]


def smartrecruiters_jobs(client, url):
    m = re.search(r"careers\.smartrecruiters\.com/([^/?#\s]+)", url)
    if not m:
        return None
    data = _get_json(client, f"https://api.smartrecruiters.com/v1/companies/{m.group(1)}/postings?limit=100")
    if not data or "content" not in data:
        return None
    return [{"title": j.get("name", ""), "url": j.get("ref", "")} for j in data["content"]]


ATS_RESOLVERS = [greenhouse_jobs, lever_jobs, smartrecruiters_jobs]


def try_ats_apis(client, url):
    for resolver in ATS_RESOLVERS:
        jobs = resolver(client, url)
        if jobs is not None:
            return jobs, resolver.__name__
    return None, None
