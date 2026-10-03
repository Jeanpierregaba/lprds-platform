"""
Notification email à la publication d'un rapport (best-effort, cf. service.py
pour la justification : contrairement au mot de passe temporaire, le rapport
reste consultable sur le portail même si l'email échoue — l'échec est
journalisé, jamais bloquant).
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.core import links
from app.core.config import settings
from app.core.i18n import DEFAULT_LOCALE, Locale, t
from app.modules.auth.email import render, send_html_email

TEMPLATES_DIR = Path(__file__).parent / "templates"




async def send_report_available_email(
    *,
    to: str,
    parent_first_name: str,
    child_first_names: str,
    child_last_name: str,
    report_type: str,
    period_label: str,
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    child_name = f"{child_first_names} {child_last_name}"
    html = render(
        TEMPLATES_DIR,
        "report_available.html",
        locale,
        parent_first_name=parent_first_name,
        child_name=child_name,
        report_type_label=t(f"reports.types.{report_type}", locale),
        period_label=period_label,
        portal_url=links.url(links.PARENT_REPORTS),
        platform_name="LPRDS",
    )
    await send_html_email(
        to=to,
        subject=t("emails.report_available.subject", locale, child=child_name),
        html=html,
    )
