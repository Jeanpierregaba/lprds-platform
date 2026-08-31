from fastapi import Depends, HTTPException, status

from app.modules.auth.dependencies import get_active_user
from app.modules.auth.models import User, UserRole
from app.modules.rbac.dependencies import require_permission
from app.modules.rbac.models import PermissionCode

# Rôle socle bibliothécaire = les 3 permissions du module Bibliothèque.
# L'admin de l'établissement les porte d'office via require_permission.
require_library_admin = require_permission(
    PermissionCode.LIBRARY_READ,
    PermissionCode.LIBRARY_WRITE,
    PermissionCode.LIBRARY_LEND,
)


async def get_educator(
    current_user: User = Depends(get_active_user),
) -> User:
    """Consultation livres de la section : staff rattaché à un groupe actif en
    tant qu'éducatrice (hors-RBAC, comme le scope « my-group » du module
    Rapports). L'admin passe par le router permissions ; le parent par /mine/*."""
    if current_user.role != UserRole.STAFF:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissions insuffisantes",
        )
    if current_user.establishment_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte n'est rattaché à aucun établissement",
        )
    return current_user