import json
import os
import re
import hashlib
from datetime import datetime, timezone


def normalise_for_dedup(title):
    t = title.lower()
    t = re.sub(r"\s+(bengaluru|bangalore|hyderabad|pune|chennai|mumbai|noida|gurgaon|gurugram|delhi|kolkata|india).*", "", t)
    t = re.sub(r"\s+apply here.*$", "", t)
    t = re.sub(r"\s+apply\s*[→>].*$", "", t)
    t = re.sub(r"[^a-z0-9\s]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def sha16(s):
    return hashlib.sha256(str(s).encode("utf-8")).hexdigest()[:16]


def make_job_id(company, title, url=""):
    norm = normalise_for_dedup(title)
    full_id = sha16("|".join([company.lower().strip(), norm, url.strip()]))
    title_id = sha16(norm)
    return {"fullId": full_id, "titleId": title_id}


def _fresh():
    return {
        "_info": "Auto-managed by main.py — do NOT edit manually",
        "last_run": None,
        "total_seen": 0,
        "jobs": {},
        "titleKeys": {},
    }


def load_seen(file_path):
    if not os.path.exists(file_path):
        return _fresh()
    try:
        raw = open(file_path, "r", encoding="utf-8").read().strip()
        if not raw or raw == "{}" or len(raw) < 10:
            return _fresh()
        data = json.loads(raw)
        data.setdefault("jobs", {})
        data.setdefault("titleKeys", {})
        return data
    except Exception as err:
        print(f"[dedup] Could not parse {file_path}: {err}. Starting fresh.")
        return _fresh()


def save_seen(store, file_path):
    tmp = file_path + ".tmp"
    store["last_run"] = datetime.now(timezone.utc).isoformat()
    store["total_seen"] = len(store["jobs"])
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2, ensure_ascii=False)
    os.replace(tmp, file_path)


def is_seen(ids, store):
    return ids["fullId"] in store["jobs"] or ids["titleId"] in store["titleKeys"]


def mark_seen(ids, job_info, store):
    record = {
        "company": str(job_info.get("company", "")),
        "title": str(job_info.get("title", "")),
        "url": str(job_info.get("url", "")),
        "category": str(job_info.get("category", "")),
        "found_date": job_info.get("found_date", datetime.now(timezone.utc).date().isoformat()),
        "seen_at": datetime.now(timezone.utc).isoformat(),
    }
    store["jobs"][ids["fullId"]] = record
    store["titleKeys"][ids["titleId"]] = record


def reset_seen(file_path):
    fresh = _fresh()
    save_seen(fresh, file_path)
    print(f"[dedup] {file_path} reset.")
    return fresh
