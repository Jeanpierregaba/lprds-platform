from fastapi import Depends, HTTPException, status
from app.core.i18n import t

from app.modules.auth.dependencies import require_roles
from app.modules.auth.models import User, UserRole


async def get_parent(
    current_user: User = Depends(require_roles(UserRole.PARENT)),
) -> User:
    if current_user.establishment_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.common.no_establishment"),
        )
    return current_user
