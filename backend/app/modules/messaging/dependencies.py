"""
Gardes d'accès dédiées au module messagerie.

⚠️ Volontairement SANS RBAC : ce module ne passe jamais par
`require_permission` — seul le rôle de compte (admin/parent) est vérifié, sur
demande explicite (« ne va concerner uniquement que les comptes admin et
parents »). Le staff, même porteur de permissions, et le superadmin sont
exclus.
"""

from fastapi import Depends, HTTPException, status

from app.modules.auth.dependencies import get_active_user, require_roles
from app.modules.auth.models import User, UserRole


def _ensure_establishment(current_user: User) -> User:
    if current_user.establishment_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte n'est rattaché à aucun établissement",
        )
    return current_user


async def get_admin(
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> User:
    return _ensure_establishment(current_user)


async def get_parent(
    current_user: User = Depends(require_roles(UserRole.PARENT)),
) -> User:
    return _ensure_establishment(current_user)


async def get_admin_or_parent(
    current_user: User = Depends(get_active_user),
) -> User:
    if current_user.role not in (UserRole.ADMIN, UserRole.PARENT):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Réservé à l'administration et aux parents",
        )
    return _ensure_establishment(current_user)
