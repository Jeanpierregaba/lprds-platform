"""
Email de rappel de retour de livre — best-effort (même pattern que les rapports) :
le rappel est aussi injecté dans la conversation admin↔parent, donc le parent a
toujours un canal de notification même si le SMTP échoue. L'échec est journalisé,
jamais bloquant.
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.core.config import settings
from app.core.i18n import DEFAULT_LOCALE, Locale, t
from app.modules.auth.email import render, send_html_email

TEMPLATES_DIR = Path(__file__).parent / "templates"


async def send_due_reminder_email(
    *,
    to: str,
    parent_first_name: str,
    items: list[dict],  # [{"child_name", "book_title", "due_date", "overdue_days"}]
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    html = render(
        TEMPLATES_DIR,
        "library_due_reminder.html",
        locale,
        parent_first_name=parent_first_name,
        items=items,
        library_url=f"{settings.frontend_url}/dashboard/parent/library",
        platform_name="LPRDS",
    )
    await send_html_email(
        to=to,
        subject=t("emails.library_reminder.subject", locale),
        html=html,
    )