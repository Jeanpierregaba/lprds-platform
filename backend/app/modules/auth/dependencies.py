import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.i18n import t, coerce_locale, set_request_locale
from app.modules.auth.models import User, UserRole
from app.modules.auth.security import decode_token, is_token_revoked

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=t("errors.auth.invalid_token"),
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise credentials_exc
        user_id: str = payload["sub"]
    except Exception:
        raise credentials_exc

    # Token révoqué (logout) — is_token_revoked lève un 503 si Redis est HS,
    # à ne pas convertir en 401 : ce n'est pas un problème d'identité.
    if await is_token_revoked(payload):
        raise credentials_exc

    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise credentials_exc

    # La langue du compte prime sur l'en-tête Accept-Language posé par le
    # middleware : c'est un choix explicite, l'en-tête n'est qu'une déduction.
    set_request_locale(coerce_locale(user.locale))
    return user


async def get_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Utilisateur actif et authentifié. Le changement de mot de passe temporaire
    (`must_change_pwd`) n'est plus imposé — décision explicite de l'utilisateur
    (le flux forcé était de toute façon cassé côté frontend, cf. historique).
    Le champ reste en base à titre informatif mais ne bloque plus rien ici.
    """
    return current_user


def require_roles(*roles: UserRole):
    async def _check(
        current_user: User = Depends(get_active_user),
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=t("errors.common.insufficient_permissions"),
            )
        return current_user
    return _check
