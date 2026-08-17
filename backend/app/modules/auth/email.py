import logging
from pathlib import Path
from fastapi_mail import FastMail, MessageSchema, MessageType, ConnectionConfig
from jinja2 import Environment, FileSystemLoader
from app.core.config import settings
from app.modules.auth.models import UserRole

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"

_jinja = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=True,
)

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


_ROLE_CONFIG: dict[UserRole, dict] = {
    UserRole.ADMIN: {
        "template": "welcome_admin.html",
        "subject": "Bienvenue sur LPRDS — Accès administrateur",
    },
    UserRole.STAFF: {
        "template": "welcome_staff.html",
        "subject": "Bienvenue sur LPRDS — Votre espace personnel",
    },
    UserRole.PARENT: {
        "template": "welcome_parent.html",
        "subject": "Bienvenue sur LPRDS — Espace famille",
    },
}


async def send_welcome_email(
    *,
    email: str,
    first_name: str,
    role: UserRole,
    temp_password: str,
    establishment_name: str = "",
) -> None:
    config = _ROLE_CONFIG[role]
    html = _jinja.get_template(config["template"]).render(
        first_name=first_name,
        email=email,
        temp_password=temp_password,
        establishment_name=establishment_name,
        login_url=f"{settings.frontend_url}/auth/login",
        platform_name="LPRDS",
    )
    message = MessageSchema(
        subject=config["subject"],
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
) -> None:
    reset_url = f"{settings.frontend_url}/auth/new-password?token={reset_token}"
    html = _jinja.get_template("reset_password.html").render(
        first_name=first_name,
        reset_url=reset_url,
        expire_minutes=settings.reset_token_expire_minutes,
    )
    message = MessageSchema(
        subject="Réinitialisation de votre mot de passe LPRDS",
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
) -> None:
    """
    Reset « administré » : l'admin a défini un nouveau mot de passe, on le
    communique directement au parent. Contrairement à send_reset_email, aucun
    lien à cliquer et aucune redéfinition imposée — le mot de passe fourni est
    le mot de passe final.
    """
    html = _jinja.get_template("parent_password_reset.html").render(
        first_name=first_name,
        email=email,
        new_password=new_password,
        login_url=f"{settings.frontend_url}/auth/login",
    )
    message = MessageSchema(
        subject="Votre mot de passe LPRDS a été réinitialisé",
        recipients=[email],
        body=html,
        subtype=MessageType.html,
    )
    await _send(message)
