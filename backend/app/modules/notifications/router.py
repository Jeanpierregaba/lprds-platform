"""Endpoints des abonnements push — self-service, hors RBAC.

Un utilisateur ne gère que SES propres abonnements : aucune permission
`notifications:*` n'existe, `get_current_user` suffit (même principe que
`PATCH /auth/me/locale`). `GET /vapid-public-key` est la seule route publique
du module — elle n'expose que la clé PUBLIQUE, qui est faite pour l'être.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.i18n import coerce_locale, t
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.notifications.schemas import (
    PushSubscriptionCreate,
    PushSubscriptionDelete,
    PushSubscriptionResponse,
)
from app.modules.notifications.service import (
    delete_subscription,
    list_user_subscriptions,
    save_subscription,
    send_push_to_subscription,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post(
    "/subscriptions",
    response_model=PushSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_subscription(
    payload: PushSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PushSubscriptionResponse:
    """Enregistre l'abonnement de cet appareil pour le compte connecté."""
    if current_user.establishment_id is None:
        # Un abonnement sert à recevoir les événements d'un établissement
        # (diffusion, message, rapport) : sans rattachement, il n'y a rien à
        # pousser. C'est le cas du superadmin, qui n'en a pas.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.notifications.no_establishment"),
        )
    return await save_subscription(
        endpoint=payload.endpoint,
        p256dh=payload.p256dh,
        auth_key=payload.auth_key,
        user=current_user,
        db=db,
    )


@router.post("/subscriptions/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subscription(
    payload: PushSubscriptionDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Retire l'abonnement de cet appareil. **Idempotent** — 204 même s'il
    n'existait plus.

    ⚠️ Un POST et non un DELETE, pour une raison concrète : le retrait désigne
    l'appareil par son `endpoint`, qui est long et identifiant. Le mettre en
    paramètre d'URL le ferait entrer dans les journaux d'accès du reverse
    proxy ; un corps de requête sur un DELETE, lui, n'est garanti par aucun
    intermédiaire. Le POST est le seul des trois à ne rien supposer.

    Idempotent parce que l'appelant vient le plus souvent de se désabonner
    côté navigateur : lui renvoyer 404 ferait passer un nettoyage réussi pour
    une erreur.
    """
    await delete_subscription(
        user_id=current_user.id, endpoint=payload.endpoint, db=db
    )


@router.get("/vapid-public-key")
async def vapid_public_key() -> dict:
    """Clé publique VAPID, nécessaire au navigateur pour s'abonner."""
    if not settings.vapid_public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=t("errors.notifications.no_vapid_key"),
        )
    return {"vapidPublicKey": settings.vapid_public_key}


@router.post("/test", include_in_schema=False)
async def test_push(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Envoie une notification d'essai sur les abonnements RÉELS du compte.

    ⚠️ La version précédente ÉCRIVAIT un faux abonnement en base quand le
    compte n'en avait pas — endpoint factice, clés bricolées — puis tentait de
    pousser dessus. Elle laissait donc derrière elle une ligne qui ne pouvait
    qu'échouer indéfiniment, et répondait « envoyé : faux » sans dire si le
    problème venait des clés, de l'abonnement ou du service de push. Un outil
    de diagnostic qui salit la base qu'il diagnostique n'en est pas un.

    Elle était en outre déclarée en GET tout en écrivant : une requête que
    n'importe quel préchargeur de navigateur peut émettre.
    """
    if not settings.vapid_private_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=t("errors.notifications.no_vapid_keys"),
        )

    subscriptions = await list_user_subscriptions(current_user.id, db)
    if not subscriptions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.notifications.no_subscription"),
        )

    locale = coerce_locale(current_user.locale)
    sent = 0
    for subscription in subscriptions:
        if await send_push_to_subscription(
            subscription,
            t("push.test.title", locale),
            t("push.test.body", locale),
            {"url": "/"},
            db=db,
        ):
            sent += 1

    return {"subscriptions": len(subscriptions), "sent": sent}
