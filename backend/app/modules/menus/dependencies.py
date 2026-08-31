from fastapi import Depends, HTTPException, status

from app.modules.auth.dependencies import get_active_user
from app.modules.auth.models import User


async def get_establishment_member(
    current_user: User = Depends(get_active_user),
) -> User:
    """
    N'importe quel acteur rattaché à un établissement (admin, staff, parent) —
    la lecture du menu de la semaine en cours est volontairement ouverte à
    tous, aucune permission RBAC requise. Exclut de fait le superadmin
    (establishment_id NULL, même principe de minimisation RGPD qu'ailleurs).
    """
    if current_user.establishment_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte n'est rattaché à aucun établissement",
        )
    return current_user
