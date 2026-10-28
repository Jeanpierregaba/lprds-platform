"""Abonnements aux notifications push Web et envoi des messages.

⚠️ **Ce module n'avait jamais été exécuté.** Écrit de bout en bout, importé,
démarrant sans broncher — et incapable d'enregistrer un seul abonnement :
`_to_response` n'existait nulle part tout en étant appelé trois fois,
`datetime`/`timezone` étaient utilisés sans import, et les colonnes étaient
trop courtes pour les clés qu'un navigateur produit réellement. Rien ne le
signalait : l'envoi est best-effort, donc son échec est journalisé au fond du
module et n'atteint jamais un écran.

La cause racine est unique et vaut pour tout le dépôt : aucun test ne touchait
`/notifications` — le seul module dans ce cas. D'où
`tests/e2e/test_notifications.py`, qui souscrit avec des clés de la VRAIE
taille (65 et 16 octets), seule façon d'attraper la classe de défaut n°3.
"""

import asyncio
import json
import logging
import uuid
from typing import Optional

from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.i18n import DEFAULT_LOCALE, coerce_locale, t
from app.modules.auth.models import User, UserRole
from app.modules.notifications.models import PushSubscription
from app.modules.notifications.schemas import PushSubscriptionResponse

logger = logging.getLogger(__name__)


def _to_response(subscription: PushSubscription) -> PushSubscriptionResponse:
    return PushSubscriptionResponse.model_validate(subscription)


async def save_subscription(
    *,
    endpoint: str,
    p256dh: str,
    auth_key: str,
    user: User,
    db: AsyncSession,
) -> PushSubscriptionResponse:
    """Enregistre l'abonnement de CET appareil, ou met à jour le sien.

    ⚠️ La clé est le couple (compte, endpoint), jamais le compte seul. Un
    endpoint identifie un navigateur sur un appareil : la version précédente
    remplaçait l'unique ligne du compte, si bien que s'abonner sur son
    téléphone DÉSABONNAIT son ordinateur — en silence, et sans que rien ne
    distingue ce cas d'un abonnement qui n'a jamais marché.

    `establishment_id` est repris du compte et jamais reçu du client : la
    colonne existait, le commentaire l'annonçait, personne ne la remplissait.
    """
    existing = await db.scalar(
        select(PushSubscription).where(
            PushSubscription.user_id == user.id,
            PushSubscription.endpoint == endpoint,
        )
    )
    if existing:
        # Un navigateur peut faire tourner ses clés sur un même endpoint
        # (`pushsubscriptionchange`) : on met la ligne à jour au lieu d'en
        # empiler une seconde, qui recevrait des envois voués à l'échec.
        existing.p256dh = p256dh
        existing.auth_key = auth_key
        existing.establishment_id = user.establishment_id
        await db.flush()
        return _to_response(existing)

    subscription = PushSubscription(
        user_id=user.id,
        establishment_id=user.establishment_id,
        endpoint=endpoint,
        p256dh=p256dh,
        auth_key=auth_key,
    )
    db.add(subscription)
    await db.flush()
    return _to_response(subscription)


async def delete_subscription(
    *,
    user_id: uuid.UUID,
    endpoint: str,
    db: AsyncSession,
) -> bool:
    """Retire l'abonnement de cet appareil pour ce compte. Idempotent.

    Le retrait se fait par ENDPOINT et non par identifiant de ligne : c'est la
    seule valeur que le navigateur sait toujours redonner
    (`pushManager.getSubscription()`), alors qu'un identifiant conservé côté
    client disparaît avec le stockage local. Et il est borné au compte
    appelant, pour qu'un identifiant deviné ne désabonne pas quelqu'un d'autre.
    """
    subscription = await db.scalar(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == endpoint,
        )
    )
    if subscription is None:
        return False
    await db.delete(subscription)
    await db.flush()
    return True


async def list_user_subscriptions(
    user_id: uuid.UUID, db: AsyncSession
) -> list[PushSubscription]:
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    return list(result.scalars().all())


#: Tâches d'envoi en cours — gardées le temps de leur exécution.
#: ⚠️ `asyncio` ne retient qu'une référence FAIBLE sur une tâche : sans cet
#: ensemble, le ramasse-miettes peut l'emporter en plein vol et personne ne
#: recevrait rien, sans la moindre trace.
_taches_push: set[asyncio.Task] = set()


@dataclass(frozen=True)
class _Envoi:
    """Un push prêt à partir : plus aucune session de base n'est nécessaire.

    Tout ce qui demandait la base — le destinataire, sa langue, ses
    abonnements — a été lu PENDANT la requête. Ne restent que des valeurs.
    """

    subscription_id: uuid.UUID
    endpoint: str
    p256dh: str
    auth_key: str
    title: str
    body: str


async def _pousser(envoi: _Envoi, data: Optional[dict]) -> tuple[bool, bool]:
    """Envoie UN push. Retourne (parti, abonnement définitivement mort).

    ⚠️ La distinction entre les deux booléens est tout l'intérêt : un 404 ou un
    410 sont DÉFINITIFS (navigateur désinstallé, données du site effacées) et
    la ligne ne recevra plus jamais rien ; tout autre code — un 503 du service
    de push, une coupure réseau — est PASSAGER. Désabonner quelqu'un parce que
    Google a eu une mauvaise minute serait pire que le problème.

    L'appel lui-même part dans un thread : `pywebpush` fait une requête HTTP
    BLOQUANTE, qui tiendrait sinon la boucle asyncio.
    """
    if not settings.vapid_private_key:
        logger.debug("Push ignoré (aucune clé VAPID configurée)")
        return False, False

    from pywebpush import WebPushException, webpush

    payload = json.dumps({"title": envoi.title, "body": envoi.body, **(data or {})})

    def _envoyer() -> None:
        webpush(
            subscription_info={
                "endpoint": envoi.endpoint,
                "keys": {"p256dh": envoi.p256dh, "auth": envoi.auth_key},
            },
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            # ⚠️ `pywebpush` passe un plafond par défaut de DIX MILLE secondes
            # à `requests` — soit près de trois heures, c'est-à-dire aucune
            # borne en pratique. Un service de push qui ne répond plus
            # retenait donc l'envoi indéfiniment, et avec lui le lot entier,
            # qui est séquentiel.
            timeout=settings.push_timeout_seconds,
        )

    try:
        await asyncio.to_thread(_envoyer)
        return True, False
    except WebPushException as exc:
        statut = getattr(getattr(exc, "response", None), "status_code", None)
        if statut in (404, 410):
            logger.info(
                "Abonnement push %s révoqué par le service (%s)",
                envoi.subscription_id, statut,
            )
            return False, True
        logger.warning(
            "Échec d'envoi push sur l'abonnement %s : %s", envoi.subscription_id, exc
        )
        return False, False
    except Exception:
        # pywebpush laisse aussi passer des erreurs de transport brutes. Un
        # push raté ne doit jamais faire échouer la publication qui l'a
        # déclenché (même politique que la messagerie, cf. CLAUDE.md).
        logger.exception(
            "Échec inattendu d'envoi push sur l'abonnement %s", envoi.subscription_id
        )
        return False, False


async def _envoyer_en_fond(envois: list[_Envoi], data: Optional[dict]) -> None:
    """Déroule les envois HORS de la requête, puis fait le ménage.

    La session de la requête est fermée depuis longtemps quand cette tâche
    tourne : le retrait des abonnements morts ouvre donc la sienne, brièvement,
    et une seule fois pour tout le lot.
    """
    morts: list[uuid.UUID] = []
    for envoi in envois:
        _, revoque = await _pousser(envoi, data)
        if revoque:
            morts.append(envoi.subscription_id)

    if not morts:
        return
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                delete(PushSubscription).where(PushSubscription.id.in_(morts))
            )
            await db.commit()
    except Exception:
        logger.exception("Échec du retrait de %d abonnement(s) mort(s)", len(morts))


def _programmer(envois: list[_Envoi], data: Optional[dict]) -> int:
    """Confie le lot à une tâche de fond et rend la main tout de suite.

    ⚠️ Le compte retourné est celui des envois PROGRAMMÉS, pas aboutis — la
    requête ne les attend plus, elle ne peut donc plus en connaître l'issue.
    """
    if not envois:
        return 0
    tache = asyncio.create_task(_envoyer_en_fond(envois, data))
    _taches_push.add(tache)
    tache.add_done_callback(_taches_push.discard)
    return len(envois)


async def _abonnements_par_compte(
    user_ids: list[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, list[PushSubscription]]:
    """Les abonnements de tous les destinataires, en UNE requête.

    La version précédente en faisait une par parent : sur un établissement de
    150 familles, 150 allers-retours vers la base avant même le premier push.
    """
    if not user_ids:
        return {}
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id.in_(user_ids))
    )
    par_compte: dict[uuid.UUID, list[PushSubscription]] = {}
    for sub in result.scalars().all():
        par_compte.setdefault(sub.user_id, []).append(sub)
    return par_compte


async def send_push_to_subscription(
    subscription: PushSubscription,
    title: str,
    body: str,
    data: Optional[dict] = None,
    *,
    db: AsyncSession | None = None,
) -> bool:
    """Envoie un push et ATTEND son issue. Best-effort : jamais d'erreur HTTP.

    ⚠️ C'est le seul chemin qui attend, et c'est voulu : il sert le bouton
    « envoyer un essai », dont tout l'intérêt est de dire si ça marche. Les
    envois en nombre (diffusion, message) passent, eux, par les deux fonctions
    ci-dessous, qui rendent la main avant de partir.

    `db` sert uniquement à FAIRE LE MÉNAGE : un endpoint révoqué répond 404 ou
    410 et le fera indéfiniment. Sans ce retrait, chaque envoi rejouerait
    l'appel pour rien, et le compte paraîtrait abonné à jamais.
    """
    envoi = _Envoi(
        subscription_id=subscription.id,
        endpoint=subscription.endpoint,
        p256dh=subscription.p256dh,
        auth_key=subscription.auth_key,
        title=title,
        body=body,
    )
    parti, revoque = await _pousser(envoi, data)
    if revoque and db is not None:
        logger.info("Abonnement push %s retiré", subscription.id)
        await db.delete(subscription)
        await db.flush()
    return parti


async def send_push_to_establishment_parents(
    establishment_id: uuid.UUID,
    title_key: str,
    body: str | None,
    db: AsyncSession,
    data: Optional[dict] = None,
    *,
    parent_ids: Optional[set[uuid.UUID]] = None,
    body_key: str | None = None,
    body_params: Optional[dict] = None,
    body_by_locale: Optional[dict[str, str]] = None,
) -> int:
    """Pousse aux parents d'un établissement, restreint à `parent_ids` si
    fourni (diffusion ciblée par départements) — sinon tous les parents.

    ⚠️ **Les envois partent EN FOND ; la requête ne les attend pas.** Chaque
    push est un aller-retour HTTP vers le service du navigateur : une diffusion
    à 150 familles, souvent deux appareils chacune, c'était trois cents
    allers-retours tenus par la requête de publication — au-delà de ce que le
    reverse proxy accepte d'attendre, pour une diffusion pourtant déjà
    enregistrée. Ce qui exige la base (destinataires, langues, abonnements) est
    donc lu ICI, pendant que la session existe ; le réseau se déroule ensuite.

    Conséquence assumée : le compte retourné est celui des envois PROGRAMMÉS.
    La requête ne peut plus savoir combien aboutissent — c'est le prix de ne
    plus la faire attendre.

    ⚠️ `title_key` est une CLÉ, pas un texte : un même appel touche plusieurs
    parents, chacun avec sa propre langue. Le rendu se fait donc par
    destinataire.

    Trois façons de donner le corps, dans cet ordre de priorité :

    - `body_by_locale` — du contenu saisi dont on possède plusieurs versions
      (titre d'une diffusion, traduit automatiquement). Chaque destinataire
      reçoit la sienne, avec repli sur le français.
    - `body` — du contenu saisi en une seule langue : extrait d'un message
      privé, qui ne se traduit pas (cf. claude.md).
    - `body_key` (+ `body_params`) — un corps rédigé par la plateforme."""
    filters = [
        User.establishment_id == establishment_id,
        User.role == UserRole.PARENT,
        User.is_active.is_(True),
    ]
    if parent_ids is not None:
        if not parent_ids:
            return 0
        filters.append(User.id.in_(parent_ids))
    parents = (await db.execute(select(User).where(*filters))).scalars().all()

    abonnements = await _abonnements_par_compte([p.id for p in parents], db)

    envois: list[_Envoi] = []
    for parent in parents:
        locale = coerce_locale(parent.locale)
        if body_by_locale is not None:
            text = body_by_locale.get(str(locale)) or body_by_locale[str(DEFAULT_LOCALE)]
        elif body is not None:
            text = body
        else:
            text = t(body_key or "", locale, **(body_params or {}))
        titre = t(title_key, locale)
        for sub in abonnements.get(parent.id, []):
            envois.append(
                _Envoi(
                    subscription_id=sub.id,
                    endpoint=sub.endpoint,
                    p256dh=sub.p256dh,
                    auth_key=sub.auth_key,
                    title=titre,
                    body=text,
                )
            )

    return _programmer(envois, data)


async def send_push_to_establishment_admins(
    establishment_id: uuid.UUID,
    title_key: str,
    body: str | None,
    db: AsyncSession,
    data: Optional[dict] = None,
    *,
    body_key: str | None = None,
    body_params: Optional[dict] = None,
) -> int:
    """Pousse à tous les admins d'un établissement — même mécanique que la
    version parents : lecture ici, envoi en fond, compte des PROGRAMMÉS."""
    admins = (
        await db.execute(
            select(User).where(
                User.establishment_id == establishment_id,
                User.role == UserRole.ADMIN,
                User.is_active.is_(True),
            )
        )
    ).scalars().all()

    abonnements = await _abonnements_par_compte([a.id for a in admins], db)

    envois: list[_Envoi] = []
    for admin in admins:
        locale = coerce_locale(admin.locale)
        text = body if body is not None else t(body_key or "", locale, **(body_params or {}))
        titre = t(title_key, locale)
        for sub in abonnements.get(admin.id, []):
            envois.append(
                _Envoi(
                    subscription_id=sub.id,
                    endpoint=sub.endpoint,
                    p256dh=sub.p256dh,
                    auth_key=sub.auth_key,
                    title=titre,
                    body=text,
                )
            )

    return _programmer(envois, data)
