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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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


async def send_push_to_subscription(
    subscription: PushSubscription,
    title: str,
    body: str,
    data: Optional[dict] = None,
    *,
    db: AsyncSession | None = None,
) -> bool:
    """Envoie un push à un abonnement donné. Best-effort : jamais d'erreur HTTP.

    `db` sert uniquement à FAIRE LE MÉNAGE : un endpoint révoqué (navigateur
    désinstallé, abonnement expiré, données du site effacées) répond 404 ou
    410 et le fera indéfiniment. Sans ce retrait, chaque diffusion rejouerait
    l'appel pour rien, et le compte paraîtrait abonné à jamais. Les autres
    codes — un 503 du service de push, une panne réseau — sont PASSAGERS et ne
    doivent surtout rien supprimer.

    ⚠️ L'envoi est synchrone (pywebpush fait une requête HTTP bloquante) et
    passe donc par un thread : sans cela, une diffusion à trente parents
    bloquerait la boucle asyncio le temps de trente allers-retours réseau.
    """
    if not settings.vapid_private_key:
        # Dit une fois au démarrage par `_warn_dormant_features` ; répété ici
        # au niveau debug pour que le diagnostic d'un envoi muet soit possible
        # sans relire le journal de démarrage.
        logger.debug("Push ignoré (aucune clé VAPID configurée)")
        return False

    from pywebpush import WebPushException, webpush

    payload = json.dumps({"title": title, "body": body, **(data or {})})

    def _envoyer() -> None:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth_key,
                },
            },
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )

    try:
        await asyncio.to_thread(_envoyer)
        return True
    except WebPushException as exc:
        statut = getattr(getattr(exc, "response", None), "status_code", None)
        if statut in (404, 410) and db is not None:
            logger.info(
                "Abonnement push %s révoqué par le service (%s) : retiré",
                subscription.id, statut,
            )
            await db.delete(subscription)
            await db.flush()
        else:
            logger.warning(
                "Échec d'envoi push sur l'abonnement %s : %s",
                subscription.id, exc,
            )
        return False
    except Exception:
        # pywebpush laisse aussi passer des erreurs de transport brutes. Un
        # push raté ne doit jamais faire échouer la publication qui l'a
        # déclenché (même politique que la messagerie, cf. CLAUDE.md).
        logger.exception(
            "Échec inattendu d'envoi push sur l'abonnement %s", subscription.id
        )
        return False

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
    """Envoie un push aux parents d'un établissement, restreint à `parent_ids`
    si fourni (diffusion ciblée par départements) — sinon tous les parents.

    ⚠️ `title_key` est une CLÉ, pas un texte : un même appel touche plusieurs
    parents, chacun avec sa propre langue. Le rendu se fait donc par
    destinataire, à l'intérieur de la boucle.

    Trois façons de donner le corps, dans cet ordre de priorité :

    - `body_by_locale` — du contenu saisi dont on possède plusieurs versions
      (titre d'une diffusion, traduit automatiquement). Chaque destinataire
      reçoit la sienne, avec repli sur le français.
    - `body` — du contenu saisi en une seule langue : extrait d'un message
      privé, qui ne se traduit pas (cf. claude.md).
    - `body_key` (+ `body_params`) — un corps rédigé par la plateforme."""
    # Récupérer tous les users role=parent de l'établissement
    filters = [
        User.establishment_id == establishment_id,
        User.role == UserRole.PARENT,
        User.is_active.is_(True),
    ]
    if parent_ids is not None:
        if not parent_ids:
            return 0
        filters.append(User.id.in_(parent_ids))
    result = await db.execute(select(User).where(*filters))
    parents = result.scalars().all()

    sent = 0
    for parent in parents:
        # Récupérer ses souscriptions
        sub_result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == parent.id)
        )
        subscriptions = sub_result.scalars().all()

        locale = coerce_locale(parent.locale)
        if body_by_locale is not None:
            text = body_by_locale.get(str(locale)) or body_by_locale[str(DEFAULT_LOCALE)]
        elif body is not None:
            text = body
        else:
            text = t(body_key or "", locale, **(body_params or {}))
        for sub in subscriptions:
            success = await send_push_to_subscription(
                sub, t(title_key, locale), text, data, db=db
            )
            if success:
                sent += 1

    return sent


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
    """Envoie un push à tous les admins d'un établissement (cf. la version
    parents pour la raison d'être des clés plutôt que des textes)."""
    result = await db.execute(
        select(User).where(
            User.establishment_id == establishment_id,
            User.role == UserRole.ADMIN,
            User.is_active.is_(True),
        )
    )
    admins = result.scalars().all()

    sent = 0
    for admin in admins:
        sub_result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == admin.id)
        )
        subscriptions = sub_result.scalars().all()

        locale = coerce_locale(admin.locale)
        text = body if body is not None else t(body_key or "", locale, **(body_params or {}))

        for sub in subscriptions:
            success = await send_push_to_subscription(
                sub, t(title_key, locale), text, data, db=db
            )
            if success:
                sent += 1

    return sent
