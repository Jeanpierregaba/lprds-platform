"""
Notifications email du module Messagerie : publication d'une diffusion, et
arrivée d'un message privé.

⚠️ **Pourquoi un email alors que le push existe déjà.** Une diffusion ne
disposait que de deux canaux, et aucun des deux n'atteint un parent qui n'a
rien fait : le WebSocket suppose un onglet ouvert à cet instant précis, et le
push suppose un abonnement PAR APPAREIL, que le parent doit accorder lui-même
dans ses réglages — sur iOS, après avoir installé l'application depuis l'écran
d'accueil. Un parent qui n'a jamais ouvert cette carte de réglages n'était donc
prévenu de rien : il découvrait la diffusion à sa prochaine visite spontanée.
C'est d'autant plus lourd depuis qu'une diffusion peut EXIGER une signature —
l'admin voyait « 2/18 ont signé » sans que les seize autres aient été
sollicités ailleurs que dans l'application.

L'email, lui, ne demande au destinataire ni abonnement, ni application
installée, ni onglet ouvert.

⚠️ **Le corps de la diffusion n'est PAS repris dans l'email**, seulement son
titre. Un email part en clair chez un fournisseur de messagerie et y reste ;
une diffusion, elle, peut nommer des enfants. Le titre voyage déjà comme corps
de la notification push, donc ce choix n'expose rien de nouveau — et le lien
ci-dessous mène au texte complet, derrière une authentification.

Best-effort, comme la notification de rapport : l'échec est journalisé, jamais
remonté en erreur HTTP. La diffusion est déjà publiée et reste consultable sur
le portail, à la différence du mot de passe temporaire qui EST son seul canal
de délivrance et bloque donc la création quand l'envoi échoue.
"""

from pathlib import Path

from app.core import links
from app.core.i18n import DEFAULT_LOCALE, Locale, t
from app.modules.auth.email import render, send_html_email

TEMPLATES_DIR = Path(__file__).parent / "templates"


async def send_announcement_email(
    *,
    to: str,
    parent_first_name: str,
    announcement_id: object,
    title: str,
    establishment_name: str = "",
    requires_signature: bool = False,
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    """Prévient UN parent qu'une diffusion l'attend, avec le lien vers elle.

    `requires_signature` change le texte, pas seulement un badge : une
    diffusion qui attend une attestation demande un GESTE au destinataire, et
    un email qui annonce « une information est disponible » ne le dit pas.
    """
    html = render(
        TEMPLATES_DIR,
        "announcement_available.html",
        locale,
        parent_first_name=parent_first_name,
        title=title,
        establishment_name=establishment_name,
        requires_signature=requires_signature,
        # Vers LA diffusion, pas vers l'onglet : la liste peut en compter des
        # dizaines, et retrouver la bonne à la main annule l'intérêt du lien.
        announcement_url=links.url(
            links.PARENT_MESSAGING, **links.parent_announcement_query(announcement_id)
        ),
        platform_name="LPRDS",
    )
    await send_html_email(
        to=to,
        subject=t("emails.announcement.subject", locale, title=title),
        html=html,
    )


async def send_message_email(
    *,
    to: str,
    recipient_first_name: str,
    sender_label: str,
    message_url: str,
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    """Prévient UN destinataire qu'un message privé l'attend.

    ⚠️ **Aucun extrait du corps, pas même tronqué** — et c'est plus strict que
    pour une diffusion, dont le titre voyage. Une diffusion est écrite pour
    tout l'établissement ; une conversation privée porte précisément ce qu'on
    ne dit qu'à une famille — un souci de santé, une difficulté de
    comportement, un retard de paiement. Le push en expose déjà un aperçu de
    120 caractères, mais il va à un appareil que le destinataire a lui-même
    enrôlé ; un email reste en clair chez un fournisseur de messagerie, et y
    reste des années.

    ⚠️ **`message_url` est fourni par l'appelant, pas construit ici** : la
    destination dépend du DESTINATAIRE — le parent et l'admin n'ont ni le même
    écran ni la même façon de désigner la conversation (il n'en a qu'une, l'autre
    les a toutes). La choisir ici obligerait cette fonction à savoir qui elle
    écrit, et à refaire le test de rôle que l'appelant vient de faire.

    Best-effort, comme la notification de diffusion : le message est déjà
    persisté, visible dans le fil et compté dans les pastilles de non-lus.
    """
    html = render(
        TEMPLATES_DIR,
        "message_available.html",
        locale,
        recipient_first_name=recipient_first_name,
        sender_label=sender_label,
        message_url=message_url,
        platform_name="LPRDS",
    )
    await send_html_email(
        to=to,
        subject=t("emails.message.subject", locale, sender=sender_label),
        html=html,
    )
