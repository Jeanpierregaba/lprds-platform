"""
Email d'enquête d'absence — best-effort (même pattern que les rapports et les
rappels bibliothèque) : le message est aussi injecté dans la conversation
admin↔parent, donc le parent a toujours un canal même si le SMTP échoue.
L'échec est journalisé, jamais bloquant.
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.core.config import settings
from app.modules.auth.email import send_html_email

TEMPLATES_DIR = Path(__file__).parent / "templates"

_jinja = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)


async def send_absence_inquiry_email(
    *,
    to: str,
    parent_first_name: str,
    children_names: list[str],
    date_label: str,
    establishment_name: str,
) -> None:
    html = _jinja.get_template("absence_inquiry.html").render(
        parent_first_name=parent_first_name,
        children_names=children_names,
        date_label=date_label,
        establishment_name=establishment_name,
        frontend_url=f"{settings.frontend_url}/dashboard/parent/messaging",
        platform_name="LPRDS",
    )
    await send_html_email(
        to=to,
        subject=f"Absence de {children_names[0]} — {date_label}"
        if len(children_names) == 1
        else f"Absences du {date_label}",
        html=html,
    )
