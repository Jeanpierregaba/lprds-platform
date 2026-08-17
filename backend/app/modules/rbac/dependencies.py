from fastapi import Depends, HTTPException, status

from app.modules.auth.dependencies import get_active_user
from app.modules.auth.models import User, UserRole
from app.modules.rbac.models import PermissionCode


def user_permission_codes(user: User) -> set[str]:
    """Permissions effectives d'un utilisateur, via ses rôles RBAC actifs."""
    return {
        permission.code
        for role in user.roles
        if role.is_active
        for permission in role.permissions
    }


def require_permission(*codes: PermissionCode):
    """
    Autorise l'admin de l'établissement, ou un staff dont les rôles RBAC portent
    TOUTES les permissions demandées.

    Le superadmin n'est volontairement PAS autorisé : il gère le SaaS et les
    établissements, pas les données des enfants (minimisation RGPD).
    """
    required = {str(c) for c in codes}

    async def _check(current_user: User = Depends(get_active_user)) -> User:
        forbidden = HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissions insuffisantes",
        )

        if current_user.establishment_id is None:
            raise forbidden

        # L'admin a tous les droits sur SON établissement
        if current_user.role == UserRole.ADMIN:
            return current_user

        if current_user.role != UserRole.STAFF:
            raise forbidden

        if not required.issubset(user_permission_codes(current_user)):
            raise forbidden

        return current_user

    return _check
