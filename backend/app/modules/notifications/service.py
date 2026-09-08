import base64
import json
import uuid
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.core import redis
from app.modules.auth.models import User, UserRole
from app.modules.messaging.models import Announcement, Conversation, Message
from app.modules.reports.models import Report, ReportStatus
from app.modules.notifications.models import PushSubscription
from app.modules.notifications.schemas import (
    PushSubscriptionResponse,
    PushSubscriptionDelete,
)


async def save_subscription(
    endpoint: str,
    p256dh: str,
    auth_key: str,
    user_id: uuid.UUID,
    db,
) -> PushSubscriptionResponse:
    """Enregistre ou remplace la souscription push pour un utilisateur."""
    # Vérifier s'il en existe déjà pour cet utilisateur
    existing = await db.scalar(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    if existing:
        # Mise à jour de l'abonnement existant
        existing.endpoint = endpoint
        existing.p256dh = p256dh
        existing.auth_key = auth_key
        existing.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return await _to_response(existing)
    else:
        # Nouvelle souscription
        subscription = PushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth_key=auth_key,
        )
        db.add(subscription)
        await db.flush()
        return await _to_response(subscription)


async def delete_subscription(subscription_id: uuid.UUID, db) -> bool:
    """Supprime une souscription push."""
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.id == subscription_id)
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        await db.delete(subscription)
        await db.flush()
        return True
    return False


async def get_subscriptions_by_establishment(
    establishment_id: uuid.UUID, db
) -> list[PushSubscriptionResponse]:
    """Récupère toutes les souscriptions push pour un établissement."""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.establishment_id == establishment_id
        )
    )
    subscriptions = result.scalars().all()
    return [await _to_response(s) for s in subscriptions]


async def send_push_to_subscription(
    subscription: PushSubscription,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> bool:
    """Envoie un push à une souscription donnée en utilisant pywebpush."""
    from pywebpush import webpush, WebPushException

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth_key,
                },
            },
            data=json.dumps({"title": title, "body": body, **(data or {})}),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={
                "sub": settings.vapid_subject,
            },
        )
        return True
    except WebPushException as e:
        # Log l'erreur mais ne bloquez pas l'API
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(
            "Échec envoi push subscription %s: %s", subscription.id, str(e)
        )
        return False


from sqlalchemy.ext.asyncio import AsyncSession

# ... plus tard dans le fichier ...

async def send_push_to_establishment_parents(
    establishment_id: uuid.UUID,
    title: str,
    body: str,
    db: AsyncSession,
    data: Optional[dict] = None,
) -> int:
    """Envoie un push à tous les parents d'un établissement."""
    # Récupérer tous les users role=parent de l'établissement
    result = await db.execute(
        select(User).where(
            User.establishment_id == establishment_id,
            User.role == UserRole.PARENT,
            User.is_active.is_(True),
        )
    )
    parents = result.scalars().all()

    sent = 0
    for parent in parents:
        # Récupérer ses souscriptions
        sub_result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == parent.id)
        )
        subscriptions = sub_result.scalars().all()

        for sub in subscriptions:
            success = await send_push_to_subscription(
                sub, title, body, data
            )
            if success:
                sent += 1

    return sent


async def send_push_to_establishment_admins(
    establishment_id: uuid.UUID,
    title: str,
    body: str,
    db: AsyncSession,
    data: Optional[dict] = None,
) -> int:
    """Envoie un push à tous les admins d'un établissement."""
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

        for sub in subscriptions:
            success = await send_push_to_subscription(
                sub, title, body, data
            )
            if success:
                sent += 1

    return sent


async def notify_parents_report_validated(
    report_id: uuid.UUID,
    db,
) -> int:
    """Envoie des notifications push aux parents lorsqu'un rapport est validé.
    À appeler depuis _notify_parents() ou submit_report() après validation."""
    from app.modules.reports.service import _notify_parents as _notify_parents_original

    # D'abord envoyer les emails (comportement existant)
    email_sent = await _notify_parents_original(report_id, db)  # type: ignore

    # Ensuite envoyer les push notifications
    from app.modules.reports.models import Report

    report = await db.scalar(
        select(Report).where(Report.id == report_id)
    )
    if not report:
        return 0

    child = report.child
    establishment_id = child.establishment_id

    # On envoie aux parents assignés à cet enfant
    sent = 0
    for parent in child.parents:
        if not parent.is_active:
            continue
        sub_result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == parent.id)
        )
        subscriptions = sub_result.scalars().all()

        for sub in subscriptions:
            success = await send_push_to_subscription(
                sub,
                "Nouveau rapport disponible",
                f"Un nouveau rapport '{report.period_label}' est disponible pour {child.first_names}.",
                {"report_id": str(report_id), "child_id": str(child.id)},
            )
            if success:
                sent += 1

    return sent + email_sent  # type: ignore