import re

MIN_LEN = 4
MAX_LEN = 100

TECH_PATTERNS = [
    r"\bsoftware\s+(?:engineering?\s+)?intern(?:ship)?\b",
    r"\bsde[\s-]*intern(?:ship)?\b",
    r"\bswe[\s-]*intern(?:ship)?\b",
    r"\bengineer(?:ing)?\s+intern(?:ship)?\b",
    r"\btech(?:nology)?\s+intern(?:ship)?\b",
    r"\bengineering\s+internship\b",
    r"\bfull[\s-]?stack\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bfront[\s-]?end\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bfrontend?\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bback[\s-]?end\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bbackend?\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bweb\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bdevops\s+(?:engineer\s+)?intern(?:ship)?\b",
    r"\bdev[\s-]ops\s+(?:engineer\s+)?intern(?:ship)?\b",
    r"\bsre\s+(?:engineer\s+)?intern(?:ship)?\b",
    r"\bsite[\s-]reliability\s+(?:engineer\s+)?intern(?:ship)?\b",
    r"\bplatform\s+(?:engineer\s+)?intern(?:ship)?\b",
    r"\bcloud\s+(?:engineer\s+)?intern(?:ship)?\b",
    r"\binfra(?:structure)?\s+(?:engineer\s+)?intern(?:ship)?\b",
    r"\bmobile\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bandroid\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bios\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bdata\s+(?:science|scientist|engineer(?:ing)?|analytics?)\s+intern(?:ship)?\b",
    r"\bml\s+(?:engineer\s+|research\s+)?intern(?:ship)?\b",
    r"\bmachine[\s-]learning\s+(?:engineer\s+)?intern(?:ship)?\b",
    r"\bai\s+(?:engineer\s+|research\s+)?intern(?:ship)?\b",
    r"\bdeep[\s-]learning\s+(?:engineer\s+)?intern(?:ship)?\b",
    r"\bresearch\s+(?:engineer\s+|scientist\s+)?intern(?:ship)?\b",
    r"\bsecurity\s+(?:engineer\s+)?intern(?:ship)?\b",
    r"\bcyber\s*security\s+(?:analyst\s+)?intern(?:ship)?\b",
    r"\bqa\s+(?:engineer\s+|automation\s+)?intern(?:ship)?\b",
    r"\btest(?:ing|er)?\s+(?:engineer\s+|automation\s+)?intern(?:ship)?\b",
    r"\bautomation\s+(?:test\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bembedded\s+(?:software\s+)?intern(?:ship)?\b",
    r"\breact\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b",
    r"\bnode(?:\.js)?\s+(?:developer\s+)?intern(?:ship)?\b",
    r"\bpython\s+(?:developer\s+)?intern(?:ship)?\b",
    r"\bjava\s+(?:developer\s+)?intern(?:ship)?\b",
    r"\bsoftware\s+(?:engineer|developer)\s+fresher\b",
    r"\bfresher\s+software\s+(?:engineer|developer)\b",
    r"\btech\s+fresher\b",
    r"\bnew[\s-]grad(?:uate)?\b",
    r"\bgraduate\s+(?:software\s+)?engineer\b",
    r"\bgraduate\s+trainee\b",
    r"\bcampus\s+(?:hire|recruit|placement)\b",
    r"\bentry[\s-]level\s+(?:software\s+|tech\s+)?engineer\b",
    r"\bassociate\s+(?:software\s+engineer|sde|member\s+of\s+technical\s+staff|developer)\b",
    r"\bjunior\s+(?:software\s+|full[\s-]?stack\s+|frontend?\s+|backend?\s+|devops\s+)?(?:engineer|developer)\b",
    r"\bjr\.?\s*(?:software\s+)?(?:engineer|developer)\b",
    r"\bsde[\s-]?1\b",
    r"\bsde[\s-]?i\b",
    r"\bassociate\s+sde\b",
    r"\btrainee\s+(?:software\s+)?engineer\b",
    r"\bmember\s+of\s+technical\s+staff\b",
]

US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
    "VA", "WA", "WV", "WI", "WY", "DC",
]
US_STATE_RE = r",?\s*\b(" + "|".join(US_STATES) + r")\b"

FALSE_POSITIVES = [
    r"\binternational\b", r"\binternal\b",
    r"\baustin\b", r"\bsan francisco\b", r"\bsunnyvale\b", r"\bmountain view\b",
    r"\bmenlo park\b", r"\bpalo alto\b(?!\s+networks)", r"\bseattle\b", r"\bchicago\b",
    r"\bboston\b", r"\blos angeles\b", r"\bsan jose\b", r"\bsan diego\b", r"\batlanta\b",
    r"\bdenver\b", r"\bnew york\b", r"\bwashington,?\s*dc\b", US_STATE_RE,
    r"\blondon\b", r"\bmanchester\b", r"\bbirmingham\b", r"\bedinburgh\b", r"\bsingapore\b",
    r"\bdubai\b", r"\babu dhabi\b", r"\btokyo\b", r"\bbeijing\b", r"\bshanghai\b",
    r"\bsydney\b", r"\bmelbourne\b", r"\btoronto\b", r"\bvancouver\b", r"\bamsterdam\b",
    r"\bberlin\b", r"\bparis\b", r"\bdublin\b", r"\bzurich\b", r"\bwarsaw\b",
    r"\bunited states\b", r"\bunited kingdom\b", r"\busa\b", r"\bu\.s\.a\b", r"\bengland\b",
    r"\buk\b", r"\bcanada\b", r"\baustralia\b", r"\bgermany\b", r"\bnetherlands\b",
    r"\bpoland\b", r"\bireland\b",
    r"\bremote[\s-]*(?:us|uk|usa|europe|eu|global)\b", r"\bus[\s-]*remote\b", r"\buk[\s-]*remote\b",
    r"fresher jobs (?:in|by|for)\b", r"\bview all fresher", r"\bfresher jobs by",
    r"\bjobs by places\b", r"\bjobs by type\b", r"\bsearch internships\b", r"\bsearch.*new grad\b",
    r"^search\b", r"^view\b", r"^browse\b", r"^explore\b", r"^find\b", r"^apply\b",
    r"^click here", r"^see all", r"^load more", r"^show more",
    r"^experience:\s*", r"^location:\s*", r"location:\s*\w+", r"experience:\s*fresher",
    r"from intern to full.?time", r"transitioning from an? intern", r"started.*as an intern",
    r"joined.*as an intern", r"my .+ internship", r"intern to .+(?:engineer|manager|seller|staff)",
    r"what it.s like", r"how .+ navigated", r"day internship\b", r"internship program graduate",
    r"hosts .+ internship",
    r"this page is blocked", r"blocked under .+ policy", r"must be a .+ employee",
    r"blue.badge employee", r"requires vpn", r"stable internet connection",
]

NON_TECH = [
    r"\bhr\b.{0,20}intern", r"\bhrbp\b.{0,20}intern", r"\bhuman\s+resources?\b.{0,20}intern",
    r"\bpeople\s+(?:ops|operations?)\b.{0,20}intern", r"\btalent\s+(?:acquisition|management)\b.{0,20}intern",
    r"\brecruit\w*\b.{0,20}intern", r"\bl&d\b.{0,20}intern", r"\blearning\s+(?:and|&)\s+development\b.{0,20}intern",
    r"\bmarketing\b.{0,20}intern", r"\bdigital\s+marketing\b.{0,20}intern", r"\bsocial\s+media\b.{0,20}intern",
    r"\bcontent\b.{0,20}intern", r"\bbrand\b.{0,20}intern", r"\bseo\b.{0,20}intern", r"\bsem\b.{0,20}intern",
    r"\bcopywriting\b.{0,20}intern", r"\bcreative\b.{0,20}intern", r"\bperformance\s+marketing\b.{0,20}intern",
    r"\bsales\b.{0,20}intern", r"\bbusiness\s+development\b.{0,20}intern",
    r"\baccount\s+(?:management|executive)\b.{0,20}intern",
    r"\bcustomer\s+(?:success|support|service)\b.{0,20}intern", r"\bpartnership\b.{0,20}intern",
    r"\bfinance\b.{0,20}intern", r"\baccountan\w+\b.{0,20}intern", r"\baudit\b.{0,20}intern",
    r"\btax\b.{0,20}intern", r"\bfp&a\b.{0,20}intern", r"\blegal\b.{0,20}intern",
    r"\bcompliance\b.{0,20}intern", r"\bca\s+intern", r"\boperations?\b.{0,20}intern",
    r"\bsupply\s+chain\b.{0,20}intern", r"\blogistics\b.{0,20}intern", r"\bprocurement\b.{0,20}intern",
    r"\bwarehouse\b.{0,20}intern", r"\bgraphic\s+design\b.{0,20}intern", r"\bvisual\s+design\b.{0,20}intern",
    r"\bmotion\s+design\b.{0,20}intern", r"\billustrat\w+\b.{0,20}intern",
    r"\bcommunication\s+design\b.{0,20}intern", r"\bmba\s+fresher\b", r"\bmba\b.{0,10}intern",
    r"\bcivil\s+fresher\b", r"\bcivil\b.{0,10}intern", r"\bmedical\b.{0,10}intern",
    r"\bclinical\b.{0,10}intern", r"\bnursing\b.{0,10}intern", r"\bpharmac\w+\b.{0,10}intern",
    r"\baccounts\s+fresher\b", r"\bpr\b.{0,10}intern", r"\bpublic\s+relations\b.{0,10}intern",
    r"\bevent\b.{0,10}intern",
]

_TECH_RE = [re.compile(p, re.I) for p in TECH_PATTERNS]
_FALSE_POS_RE = [re.compile(p, re.I) for p in FALSE_POSITIVES]
_NON_TECH_RE = [re.compile(p, re.I) for p in NON_TECH]


def clean_title(raw):
    t = str(raw or "")
    t = re.sub(r"[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def looks_like_job_title(title):
    if len(title) < MIN_LEN or len(title) > MAX_LEN:
        return False
    ascii_count = len(re.findall(r"[\x20-\x7E]", title))
    if ascii_count / len(title) < 0.75:
        return False
    if not re.search(r"[a-zA-Z]{3}", title):
        return False
    if re.match(r"^[→←↑↓►◄•·⚡🔥📌🚀💡#@]", title):
        return False
    if re.match(r"^\d+\.\s", title):
        return False
    return True


def is_target_job(raw_title):
    title = clean_title(raw_title)
    if not looks_like_job_title(title):
        return False, "quality_fail"
    if not any(p.search(title) for p in _TECH_RE):
        return False, "no_tech_pattern"
    if any(p.search(title) for p in _FALSE_POS_RE):
        return False, "false_positive"
    if any(p.search(title) for p in _NON_TECH_RE):
        return False, "non_tech_role"
    return True, None


def normalise_for_dedup(title):
    t = title.lower()
    t = re.sub(r"\s+(bengaluru|bangalore|hyderabad|pune|chennai|mumbai|noida|gurgaon|gurugram|delhi|kolkata|india).*", "", t)
    t = re.sub(r"\s+apply here.*$", "", t)
    t = re.sub(r"\s+apply\s*[→>].*$", "", t)
    t = re.sub(r"[^a-z0-9\s]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def filter_jobs(jobs):
    seen_keys = set()
    result = []
    for job in jobs:
        title = clean_title(job.get("title", ""))
        dedup_key = normalise_for_dedup(title)
        if not dedup_key or dedup_key in seen_keys:
            continue
        matched, _ = is_target_job(title)
        if matched:
            seen_keys.add(dedup_key)
            result.append({**job, "title": title})
    return result
