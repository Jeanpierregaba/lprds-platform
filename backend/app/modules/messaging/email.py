"""
Notification email à la publication d'une diffusion.

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
