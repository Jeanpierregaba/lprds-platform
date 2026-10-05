from fastapi import Depends, HTTPException, status
from app.core.i18n import t

from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User, UserRole
from app.modules.rbac.dependencies import require_permission
from app.modules.rbac.models import PermissionCode

# Gardes fines par geste : lecture seule, gestion du catalogue, prêts.
# L'admin de l'établissement est autorisé d'office via require_permission.
# Le rôle socle bibliothécaire porte les 3 (accès complet inchangé).
require_library_read = require_permission(PermissionCode.LIBRARY_READ)
require_library_write = require_permission(PermissionCode.LIBRARY_WRITE)
require_library_lend = require_permission(PermissionCode.LIBRARY_LEND)


async def get_educator(
    current_user: User = Depends(get_current_user),
) -> User:
    """Consultation livres de la section : staff rattaché à un groupe actif en
    tant qu'éducatrice (hors-RBAC, comme le scope « my-group » du module
    Rapports). L'admin passe par le router permissions ; le parent par /mine/*."""
    if current_user.role != UserRole.STAFF:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.common.insufficient_permissions"),
        )
    if current_user.establishment_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.common.no_establishment"),
        )
    return current_user