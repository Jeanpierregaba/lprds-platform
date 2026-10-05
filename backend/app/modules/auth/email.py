import logging
from pathlib import Path
from fastapi_mail import FastMail, MessageSchema, MessageType, ConnectionConfig
from jinja2 import Environment, FileSystemLoader
from app.core import links
from app.core.config import settings
from app.core.i18n import DEFAULT_LOCALE, Locale, t
from app.modules.auth.models import UserRole

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"

# Un environnement par langue : les templates vivent dans `templates/<locale>/`.
# Séparer les fichiers plutôt que truffer un template unique de conditions
# garde chacun lisible — un email est avant tout une mise en page.
_jinja = {
    loc: Environment(loader=FileSystemLoader(TEMPLATES_DIR / loc), autoescape=True)
    for loc in ("fr", "en")
}


def render(templates_dir: Path, name: str, locale: Locale, /, **ctx: object) -> str:
    """Rend `name` dans la langue demandée, pour n'importe quel module.

    Centralisé ici comme `send_html_email` : chaque module garde ses propres
    templates, seul le mécanisme de résolution par langue est partagé.
    """
    env = Environment(loader=FileSystemLoader(templates_dir / locale.value), autoescape=True)
    return env.get_template(name).render(**ctx)

_mail_config = ConnectionConfig(
    MAIL_USERNAME=settings.mail_username,
    MAIL_PASSWORD=settings.mail_password,
    MAIL_FROM=settings.mail_from,
    MAIL_FROM_NAME=settings.mail_from_name,
    MAIL_PORT=settings.mail_port,
    MAIL_SERVER=settings.mail_server,
    MAIL_STARTTLS=settings.mail_starttls,
    MAIL_SSL_TLS=settings.mail_ssl_tls,
    USE_CREDENTIALS=True,
)

_mailer = FastMail(_mail_config)


class EmailDeliveryError(Exception):
    """L'email n'a pas pu être remis (SMTP injoignable, identifiants invalides…)."""


async def _send(message: MessageSchema) -> None:
    # Dev/test : aucune connexion SMTP, l'email est ignoré (cf. MAIL_SUPPRESS_SEND)
    if settings.mail_suppress_send:
        logger.info("Email supprimé (MAIL_SUPPRESS_SEND) → %s", message.recipients)
        return
    try:
        await _mailer.send_message(message)
    except Exception as exc:  # ConnectionErrors, timeouts, erreurs SMTP…
        raise EmailDeliveryError(str(exc)) from exc

async def send_html_email(*, to: str, subject: str, html: str) -> None:
    """
    Point d'entrée générique réutilisable par les AUTRES modules (ex: reports)
    pour envoyer un email déjà rendu, sans dupliquer la config SMTP/FastMail.
    Le template reste la responsabilité du module appelant (ses propres
    templates, son propre Jinja Environment) — seul le transport est centralisé.
    """
    message = MessageSchema(
        subject=subject, recipients=[to], body=html, subtype=MessageType.html
    )
    await _send(message)


# Le sujet devient une clé : son texte dépend de la langue du destinataire.
_ROLE_CONFIG: dict[UserRole, dict] = {
    UserRole.ADMIN: {"template": "welcome_admin.html", "subject_key": "emails.welcome_admin.subject"},
    UserRole.STAFF: {"template": "welcome_staff.html", "subject_key": "emails.welcome_staff.subject"},
    UserRole.PARENT: {"template": "welcome_parent.html", "subject_key": "emails.welcome_parent.subject"},
}


async def send_welcome_email(
    *,
    email: str,
    first_name: str,
    role: UserRole,
    temp_password: str,
    establishment_name: str = "",
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    config = _ROLE_CONFIG[role]
    html = _jinja[locale.value].get_template(config["template"]).render(
        first_name=first_name,
        email=email,
        temp_password=temp_password,
        establishment_name=establishment_name,
        login_url=links.url(links.LOGIN),
        platform_name="LPRDS",
    )
    message = MessageSchema(
        subject=t(config["subject_key"], locale),
        recipients=[email],
        body=html,
        subtype=MessageType.html,
    )
    await _send(message)


async def send_reset_email(
    *,
    email: str,
    first_name: str,
    reset_token: str,
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    reset_url = links.url(links.NEW_PASSWORD, token=reset_token)
    html = _jinja[locale.value].get_template("reset_password.html").render(
        first_name=first_name,
        reset_url=reset_url,
        expire_minutes=settings.reset_token_expire_minutes,
    )
    message = MessageSchema(
        subject=t("emails.reset_password.subject", locale),
        recipients=[email],
        body=html,
        subtype=MessageType.html,
    )
    await _send(message)


async def send_credentials_reset_email(
    *,
    email: str,
    first_name: str,
    new_password: str,
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    """
    Reset « administré » : l'admin a défini un nouveau mot de passe, on le
    communique directement au parent. Contrairement à send_reset_email, aucun
    lien à cliquer et aucune redéfinition imposée — le mot de passe fourni est
    le mot de passe final.
    """
    html = _jinja[locale.value].get_template("parent_password_reset.html").render(
        first_name=first_name,
        email=email,
        new_password=new_password,
        login_url=links.url(links.LOGIN),
    )
    message = MessageSchema(
        subject=t("emails.parent_password_reset.subject", locale),
        recipients=[email],
        body=html,
        subtype=MessageType.html,
    )
    await _send(message)
