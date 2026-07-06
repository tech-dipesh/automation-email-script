import json
from groq import Groq

SYSTEM_PROMPT = """You are a strict job-posting classifier for an Indian college student named Dipesh who is hunting for software engineering internships and entry-level/fresher software roles in India.

You will receive a JSON array of candidate job postings, each with an "id", "company", and "title" (and sometimes a short "context" snippet from the page it was scraped from).

For EACH candidate, decide if it is a genuine, currently-open software engineering internship or fresher/entry-level software role, based in India (or explicitly remote-India), that a final-year BCA/CS student could realistically apply to.

ACCEPT roles like: Software Engineering Intern, SDE Intern, SDE-1, SWE Intern, Frontend/Backend/Full-Stack Developer Intern, DevOps/SRE/Platform/Cloud Intern, Data Science/ML/AI Intern, QA/Automation/Test Engineer Intern, Mobile/Android/iOS Developer Intern, Associate Software Engineer, Graduate Engineer Trainee, New Grad Software Engineer, Member of Technical Staff (entry level).

REJECT anything that is: a non-technical role (HR, Marketing, Sales, Finance, Legal, Design/Creative, Operations, Business Development, Customer Support, etc), a senior/staff/lead/manager-level role, based outside India with no India option, a navigation link or page fragment that isn't really a job title ("View All Jobs", "Search Internships", etc), a blog post or "my internship story" style content, or a job whose title is too vague/garbled to tell what it actually is.

When genuinely uncertain because the title alone is ambiguous, lean REJECT rather than accept — false positives waste the student's time far more than a missed posting costs him, since he will see it again next scrape if it stays live.

Respond with ONLY a JSON array, no prose, no markdown fences, matching this exact shape:
[{"id": "<id from input>", "accept": true or false, "confidence": 0.0 to 1.0}]

Do not add, remove, or reorder items. Every input id must appear exactly once in your output."""


def classify_batch(client, candidates, model):
    if not candidates:
        return {}

    payload = [
        {"id": c["id"], "company": c["company"], "title": c["title"]}
        for c in candidates
    ]

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        temperature=0,
        max_tokens=4000,
    )

    raw = response.choices[0].message.content.strip()
    raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        parsed = json.loads(raw)
    except Exception:
        return {c["id"]: True for c in candidates}

    return {item["id"]: bool(item.get("accept")) for item in parsed if "id" in item}


def classify_candidates(candidates, api_key, model, batch_size=40, logger=None):
    if not candidates:
        return []

    client = Groq(api_key=api_key)
    decisions = {}

    for i in range(0, len(candidates), batch_size):
        batch = candidates[i:i + batch_size]
        try:
            result = classify_batch(client, batch, model)
            decisions.update(result)
        except Exception as err:
            if logger:
                logger.warn(f"Groq classification failed for batch {i}: {err} — accepting batch as fallback")
            for c in batch:
                decisions[c["id"]] = True

    return [c for c in candidates if decisions.get(c["id"], False)]
