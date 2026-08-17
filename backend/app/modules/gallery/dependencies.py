from fastapi import Depends, HTTPException, status

from app.modules.auth.dependencies import require_roles
from app.modules.auth.models import User, UserRole


async def get_parent(
    current_user: User = Depends(require_roles(UserRole.PARENT)),
) -> User:
    if current_user.establishment_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte n'est rattaché à aucun établissement",
        )
    return current_user


async def get_staff(
    current_user: User = Depends(require_roles(UserRole.STAFF)),
) -> User:
    if current_user.establishment_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte n'est rattaché à aucun établissement",
        )
    return current_user
