from fastapi import Depends, HTTPException, status
from app.core.i18n import t

from app.modules.auth.dependencies import get_current_user
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

    async def _check(current_user: User = Depends(get_current_user)) -> User:
        forbidden = HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.common.insufficient_permissions"),
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


def require_any_permission(*codes: PermissionCode):
    """
    Autorise l'admin de l'établissement, ou un staff portant AU MOINS UNE des
    permissions listées — sémantique OU, là où `require_permission` exige
    TOUTES les permissions (ET).

    Les deux sont nécessaires et ne se remplacent pas : « modifier une fiche
    enfant » exige `children:write` ET `children:archive` quand l'import crée
    et désactive dans le même geste ; « voir les rapports » se satisfait de
    read, write OU validate — refuser un porteur de write seul afficherait le
    module dans la barre latérale et renverrait 403 sur ses données.

    Cinq routers réimplémentaient ce OU à la main (`_can_see_reports`,
    `_vocabulary_access`, `_read_types`, `_read_history`…), chacun avec sa
    copie du test de rôle et sa propre 403 : autant d'occasions de n'en
    corriger que quatre.
    """
    allowed = {str(c) for c in codes}

    async def _check(current_user: User = Depends(get_current_user)) -> User:
        forbidden = HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.common.insufficient_permissions"),
        )

        if current_user.establishment_id is None:
            raise forbidden

        if current_user.role == UserRole.ADMIN:
            return current_user

        if current_user.role != UserRole.STAFF:
            raise forbidden

        if not allowed & user_permission_codes(current_user):
            raise forbidden

        return current_user

    return _check
