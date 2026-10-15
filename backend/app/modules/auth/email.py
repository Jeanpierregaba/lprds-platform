import functools
import html as html_module
import logging
import re
from email.utils import make_msgid
from pathlib import Path

import fastapi_mail.msg
from fastapi_mail import FastMail, MessageSchema, MessageType, ConnectionConfig
from fastapi_mail.schemas import MultipartSubtypeEnum
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


# ── Délivrabilité : deux réglages qui ne changent rien pour Gmail et tout
# pour Yahoo ───────────────────────────────────────────────────────────────

_MSGID_DOMAIN = str(settings.mail_from).rsplit("@", 1)[-1].strip().lower()

if "." in _MSGID_DOMAIN:
    # ⚠️ `fastapi-mail` pose `Message-ID` avec `make_msgid()` SANS domaine, donc
    # avec le nom d'hôte de la machine : en conteneur, l'identifiant Docker
    # (`<…@3f2a1b9c4d5e>`, pas même un FQDN), et sur un poste quelconque
    # `<…@…ip6.arpa>`. Un Message-ID dont le domaine n'a rien à voir avec
    # l'expéditeur est l'une des signatures que Yahoo retient contre un
    # message — Gmail la tolère, Yahoo la sanctionne, et avec un DMARC en
    # `p=quarantine` le message disparaît SANS rebond : le parent « ne reçoit
    # jamais rien » et l'établissement n'a aucune trace.
    #
    # On ne peut pas le poser par `headers=` : la bibliothèque écrit toujours
    # le sien, et le message partirait avec DEUX `Message-ID` — pire que le
    # défaut qu'on corrige. On remplace donc le fabricant à la source, au point
    # unique de transport. `test_email_deliverability.py` échoue si la
    # bibliothèque cesse d'exposer ce symbole : un correctif qui s'éteint en
    # silence à la prochaine montée de version ne protège rien.
    fastapi_mail.msg.make_msgid = functools.partial(make_msgid, domain=_MSGID_DOMAIN)
else:
    logger.warning(
        "MAIL_FROM (%r) ne porte pas de domaine exploitable : le Message-ID des "
        "emails restera celui du nom d'hôte, ce que Yahoo pénalise.",
        settings.mail_from,
    )

_BLOCS_INVISIBLES = re.compile(r"<(script|style)\b.*?</\1>", re.I | re.S)
_LIENS = re.compile(r"<a\b[^>]*href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>", re.I | re.S)
_SAUTS = re.compile(r"</(p|div|tr|h[1-6]|li|table|blockquote)>|<br\s*/?>", re.I)
_BALISES = re.compile(r"<[^>]+>")
_LIGNES_VIDES = re.compile(r"\n{3,}")


def _text_from_html(html: str) -> str:
    """Version texte d'un email HTML, dérivée du HTML lui-même.

    ⚠️ **Tous nos emails partaient en HTML SEUL**, sans partie `text/plain`.
    C'est l'un des critères de filtrage les plus constants chez Yahoo (un
    message légitime a les deux), et le seul que notre code portait vraiment.

    Elle est DÉRIVÉE, pas écrite à la main : dix templates texte à tenir en
    deux langues divergeraient du HTML au premier changement de formulation, et
    une version texte qui ne dit pas la même chose que le HTML est pire que
    pas de version texte. Les liens sont conservés en clair — un bouton
    « Lire la diffusion » n'est rien en texte sans son URL.
    """
    texte = _BLOCS_INVISIBLES.sub(" ", html)
    texte = _LIENS.sub(lambda m: f"{m.group(2).strip()} : {m.group(1)}", texte)
    texte = _SAUTS.sub("\n", texte)
    texte = _BALISES.sub("", texte)
    texte = html_module.unescape(texte)
    texte = "\n".join(ligne.strip() for ligne in texte.splitlines())
    return _LIGNES_VIDES.sub("\n\n", texte).strip()


def _html_message(*, subject: str, to: str, html: str) -> MessageSchema:
    """L'UNIQUE fabrique de message — tout email de la plateforme passe par là.

    ⚠️ `subtype=plain` + `alternative_body=html` n'est pas une inversion : dans
    un `multipart/alternative`, c'est la DERNIÈRE partie qui est préférée par
    le client. La bibliothèque attache `body` puis l'alternative, donc annoncer
    le HTML en `body` le reléguerait en premier et les clients afficheraient le
    texte brut — mise en page perdue chez tout le monde pour plaire à un
    filtre. Dans ce sens-là, chacun reçoit ce qu'il sait lire.
    """
    return MessageSchema(
        subject=subject,
        recipients=[to],
        body=_text_from_html(html),
        alternative_body=html,
        subtype=MessageType.plain,
        multipart_subtype=MultipartSubtypeEnum.alternative,
    )


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
    await _send(_html_message(subject=subject, to=to, html=html))


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
    nickname: str | None = None,
    establishment_name: str = "",
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    """Email de bienvenue, avec les identifiants.

    ⚠️ **Les six templates disent `{{ nickname }}` depuis toujours, et personne
    ne le passait.** Jinja rend une variable absente par une chaîne VIDE : tous
    les emails de bienvenue de la plateforme ont donc été envoyés sur
    « Bienvenue sur LPRDS,  ! ». Rien ne pouvait le signaler — un template ne
    casse pas sur une variable manquante, et l'email part quand même.

    Le surnom est ce par quoi l'établissement NOMME les gens (« Tata
    Victoire », « Papa Anaïs ») ; le prénom n'est que le repli pour les comptes
    qui n'en ont pas.
    """
    config = _ROLE_CONFIG[role]
    html = _jinja[locale.value].get_template(config["template"]).render(
        first_name=first_name,
        nickname=nickname or first_name,
        email=email,
        temp_password=temp_password,
        establishment_name=establishment_name,
        login_url=links.url(links.LOGIN),
        platform_name="LPRDS",
    )
    await _send(_html_message(
        subject=t(config["subject_key"], locale), to=email, html=html,
    ))


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
    await _send(_html_message(
        subject=t("emails.reset_password.subject", locale), to=email, html=html,
    ))


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
    await _send(_html_message(
        subject=t("emails.parent_password_reset.subject", locale), to=email, html=html,
    ))
