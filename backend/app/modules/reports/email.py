"""
Notification email à la publication d'un rapport (best-effort, cf. service.py
pour la justification : contrairement au mot de passe temporaire, le rapport
reste consultable sur le portail même si l'email échoue — l'échec est
journalisé, jamais bloquant).
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.core.config import settings
from app.modules.auth.email import send_html_email

TEMPLATES_DIR = Path(__file__).parent / "templates"

_jinja = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)

_TYPE_LABELS = {
    "quotidien": "quotidien",
    "bi_mensuel": "bi-mensuel",
    "annuel": "annuel",
}


async def send_report_available_email(
    *,
    to: str,
    parent_first_name: str,
    child_first_names: str,
    child_last_name: str,
    report_type: str,
    period_label: str,
) -> None:
    child_name = f"{child_first_names} {child_last_name}"
    html = _jinja.get_template("report_available.html").render(
        parent_first_name=parent_first_name,
        child_name=child_name,
        report_type_label=_TYPE_LABELS.get(report_type, report_type),
        period_label=period_label,
        portal_url=f"{settings.frontend_url}/parent/reports",
        platform_name="LPRDS",
    )
    await send_html_email(
        to=to,
        subject=f"Nouveau rapport disponible — {child_name}",
        html=html,
    )
