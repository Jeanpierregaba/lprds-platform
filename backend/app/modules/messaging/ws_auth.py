"""
Authentification WebSocket — réplique `get_current_user` pour un
contexte où il n'y a pas de header Authorization disponible (un navigateur ne
peut pas en poser un sur une requête de handshake WS) : le jeton d'accès est
donc passé en query string (`?token=...`), pattern standard pour les WS.
"""

import uuid as uuid_mod

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.auth.security import decode_token, is_token_revoked


class WSAuthError(Exception):
    """Jeton invalide, révoqué, ou compte inéligible — la connexion doit être fermée."""


async def authenticate_ws(token: str, db: AsyncSession) -> User:
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise WSAuthError("type de token incorrect")
        user_id = uuid_mod.UUID(payload["sub"])
    except WSAuthError:
        raise
    except Exception as exc:
        raise WSAuthError("token invalide") from exc

    if await is_token_revoked(payload):
        raise WSAuthError("token révoqué")

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user or not user.is_active:
        raise WSAuthError("utilisateur introuvable ou inactif")
    return user
