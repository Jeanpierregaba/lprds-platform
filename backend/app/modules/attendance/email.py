"""
Email d'enquête d'absence — best-effort (même pattern que les rapports et les
rappels bibliothèque) : le message est aussi injecté dans la conversation
admin↔parent, donc le parent a toujours un canal même si le SMTP échoue.
L'échec est journalisé, jamais bloquant.
"""

from pathlib import Path


from app.core import links
from app.core.i18n import DEFAULT_LOCALE, Locale, t
from app.modules.auth.email import render, send_html_email

TEMPLATES_DIR = Path(__file__).parent / "templates"


async def send_absence_inquiry_email(
    *,
    to: str,
    parent_first_name: str,
    children_names: list[str],
    date_label: str,
    establishment_name: str,
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    html = render(
        TEMPLATES_DIR,
        "absence_inquiry.html",
        locale,
        parent_first_name=parent_first_name,
        children_names=children_names,
        date_label=date_label,
        establishment_name=establishment_name,
        frontend_url=links.url(links.PARENT_MESSAGING),
        platform_name="LPRDS",
    )
    await send_html_email(
        to=to,
        subject=t("emails.absence_inquiry.subject_one", locale,
                  child=children_names[0], date=date_label)
        if len(children_names) == 1
        else t("emails.absence_inquiry.subject_many", locale, date=date_label),
        html=html,
    )


async def send_exemption_expired_email(
    *,
    to: str,
    admin_first_name: str,
    lines: list[str],
    count: int,
    establishment_name: str,
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    """Échéance d'exemption — l'admin apprend qu'une dispense a pris fin.

    C'est le canal qui n'exige RIEN du destinataire : le push suppose un
    abonnement par appareil, accordé à la main. Un admin qui n'a jamais ouvert
    cet écran ne serait prévenu de rien, et découvrirait au tableau de bord
    qu'un enfant est repassé « absent ».

    Best-effort, comme l'enquête d'absence : l'échec est journalisé, jamais
    remonté — l'exemption a de toute façon cessé de s'appliquer d'elle-même.
    """
    html = render(
        TEMPLATES_DIR,
        "exemption_expired.html",
        locale,
        admin_first_name=admin_first_name,
        lines=lines,
        establishment_name=establishment_name,
        frontend_url=links.url(links.ADMIN_ATTENDANCE),
        platform_name="LPRDS",
    )
    await send_html_email(
        to=to,
        subject=t("emails.exemption_expired.subject_one", locale)
        if count == 1
        else t("emails.exemption_expired.subject_many", locale, count=count),
        html=html,
    )
