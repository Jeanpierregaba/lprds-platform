import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.i18n import t
from app.core.config import settings
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User, UserRole
from app.modules.notifications.models import PushSubscription
from app.modules.notifications.schemas import (
    PushSubscriptionCreate,
    PushSubscriptionResponse,
    PushSubscriptionDelete,
)
from app.modules.notifications.service import (
    save_subscription,
    delete_subscription,
    send_push_to_subscription,
    get_subscriptions_by_establishment,
    send_push_to_establishment_parents,
    send_push_to_establishment_admins,
    notify_parents_report_validated,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/subscriptions", response_model=PushSubscriptionResponse, status_code=201)
async def create_subscription(
    payload: PushSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PushSubscriptionResponse:
    """Enregistre la souscription push de l'utilisateur connecté."""
    # Vérifier que l'utilisateur appartient bien à l'établissement du token
    if current_user.establishment_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.notifications.no_establishment"),
        )
    # Définir l'établissement depuis le user courant
    subscription = await save_subscription(
        endpoint=payload.endpoint,
        p256dh=payload.p256dh,
        auth_key=payload.auth_key,
        user_id=current_user.id,
        db=db,
    )
    return subscription


@router.delete("/subscriptions/{subscription_id}", status_code=204)
async def remove_subscription(
    subscription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Supprime la souscription push de l'utilisateur connecté."""
    # On ne permet la suppression que de ses propres abonnements
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.id == subscription_id,
            PushSubscription.user_id == current_user.id,
        )
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.notifications.subscription_not_found"),
        )
    await delete_subscription(subscription_id, db)


@router.get("/vapid-public-key", include_in_schema=False)
async def vapid_public_key() -> dict:
    """Expose la clé publique VAPID au frontend pour la souscription."""
    if not settings.vapid_public_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=t("errors.notifications.no_vapid_key"),
        )
    return {"vapidPublicKey": settings.vapid_public_key}


@router.get("/test", include_in_schema=False)
async def test_push(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Test d'envoi push (démonstration uniquement)."""
    if not settings.vapid_private_key or settings.vapid_private_key.startswith(
        "change-me"
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=t("errors.notifications.no_vapid_keys"),
        )

    # Trouver ou créer une souscription de test
    sub_result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == current_user.id)
    )
    subscription = sub_result.scalar_one_or_none()

    if not subscription:
        # Créer une souscription de test avec endpoint factice
        subscription = PushSubscription(
            user_id=current_user.id,
            endpoint="https://fcm.googleapis.com/fcm/send/test-token",
            p256dh="BNdJLW5vcmUc48O_GUzBVA9kqMSx8Vr8AUAAAAFmLWJ5dGVzdGF0aW9u",
            auth_key="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        )
        db.add(subscription)
        await db.flush()

    success = await send_push_to_subscription(
        subscription,
        "Test Notification",
        "Ceci est un test de notification push — Phase 2 PWA",
        {"test": True},
    )

    return {"sent": success, "subscription_id": str(subscription.id)}