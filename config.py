import os
from dotenv import load_dotenv

load_dotenv()

GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
ALERT_EMAIL = os.getenv("ALERT_EMAIL", GMAIL_USER)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

GOOGLE_CSE_API_KEY = os.getenv("GOOGLE_CSE_API_KEY", "")
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID", "")

COMPANIES_FILE = os.getenv("COMPANIES_FILE", "companies.json")
SEEN_JOBS_FILE = os.getenv("SEEN_JOBS_FILE", "seen_jobs.json")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "20"))
PLAYWRIGHT_TIMEOUT = float(os.getenv("PLAYWRIGHT_TIMEOUT", "30")) * 1000
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))

CSE_DAILY_BUDGET = int(os.getenv("CSE_DAILY_BUDGET", "90"))
