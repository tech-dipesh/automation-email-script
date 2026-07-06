from datetime import datetime


def build_email(new_jobs):
    count = len(new_jobs)
    subject = f"🚀 {count} new intern/SDE job{'s' if count != 1 else ''} found — India Job Scraper"

    rows = "".join(
        f"""
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e5e5e5;">
            <div style="font-weight:600;font-size:15px;">{job['title']}</div>
            <div style="color:#555;font-size:13px;margin-top:2px;">{job['company']}</div>
            <a href="{job['url']}" style="font-size:13px;color:#2563eb;">View posting →</a>
          </td>
        </tr>"""
        for job in new_jobs
    )

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
      <h2 style="color:#111;">🎉 {count} new job(s) found</h2>
      <p style="color:#555;">Generated {datetime.now().strftime('%d %b %Y, %H:%M')}</p>
      <table style="width:100%;border-collapse:collapse;">{rows}</table>
    </div>
    """

    text_lines = [f"{count} new job(s) found:\n"]
    for job in new_jobs:
        text_lines.append(f"[{job['company']}] {job['title']}\n{job['url']}\n")
    text = "\n".join(text_lines)

    return subject, html, text
