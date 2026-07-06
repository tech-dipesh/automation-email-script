import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from notify.template import build_email


def send_alert(new_jobs, gmail_user, gmail_app_password, alert_email, dry_run=False, logger=None):
    if not new_jobs:
        if logger:
            logger.info("No new jobs — email skipped.")
        return

    subject, html, text = build_email(new_jobs)

    if dry_run:
        if logger:
            logger.info(f'[DRY-RUN] "{subject}"')
        for job in new_jobs:
            print(f"  [{job['company']}]  {job['title']}\n  {job['url']}\n")
        return

    msg = MIMEMultipart("alternative")
    msg["From"] = f"Job Alert Bot 🚀 <{gmail_user}>"
    msg["To"] = alert_email
    msg["Subject"] = subject
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(gmail_user, gmail_app_password)
            server.sendmail(gmail_user, alert_email, msg.as_string())
        if logger:
            logger.info(f"✉️  Email sent → {alert_email}  ({len(new_jobs)} jobs)")
    except Exception as err:
        if logger:
            logger.error(f"❌  Email error: {err}")
