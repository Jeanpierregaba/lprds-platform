import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.i18n import t
from app.modules.auth.dependencies import require_roles
from app.modules.auth.models import User, UserRole
from app.modules.rbac import service
from app.modules.rbac.schemas import (
    PermissionResponse,
    RoleCreateRequest,
    RoleResponse,
    RoleUpdateRequest,
    UserRolesResponse,
)

# La gestion des rôles appartient à l'admin de l'établissement.
router = APIRouter(prefix="/rbac", tags=["rbac"])


async def admin_establishment_id(
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> uuid.UUID:
    """Établissement de l'admin connecté — borne toutes les opérations RBAC."""
    if current_user.establishment_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.common.no_establishment"),
        )
    return current_user.establishment_id


@router.get("/me", response_model=UserRolesResponse)
async def get_my_permissions(
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.STAFF)),
) -> UserRolesResponse:
    """
    Seule route de `/rbac/*` accessible hors admin : un membre du staff n'a
    sinon aucun moyen de connaître ses propres droits effectifs (tout le
    reste du module est réservé à `require_roles(ADMIN)`). Sert au frontend
    à composer dynamiquement le menu du portail staff.
    """
    return service.get_my_permissions(current_user)


@router.get("/permissions", response_model=list[PermissionResponse])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    _: uuid.UUID = Depends(admin_establishment_id),
) -> list[PermissionResponse]:
    """Catalogue des permissions attribuables (lecture seule)."""
    return [
        PermissionResponse.model_validate(p)
        for p in await service.list_permissions(db)
    ]


# ── Rôles ───────────────────────────────────────────────────────
@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreateRequest,
    db: AsyncSession = Depends(get_db),
    estab_id: uuid.UUID = Depends(admin_establishment_id),
) -> RoleResponse:
    return await service.create_role(payload, estab_id, db)


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    estab_id: uuid.UUID = Depends(admin_establishment_id),
    include_inactive: bool = Query(default=False),
) -> list[RoleResponse]:
    return await service.list_roles(estab_id, db, include_inactive=include_inactive)


@router.get("/roles/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    estab_id: uuid.UUID = Depends(admin_establishment_id),
) -> RoleResponse:
    return await service.get_role(role_id, estab_id, db)


@router.patch("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    estab_id: uuid.UUID = Depends(admin_establishment_id),
) -> RoleResponse:
    return await service.update_role(role_id, payload, estab_id, db)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_role(
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    estab_id: uuid.UUID = Depends(admin_establishment_id),
) -> None:
    """Désactive le rôle : il ne confère plus aucune permission."""
    await service.deactivate_role(role_id, estab_id, db)


# ── Attribution aux membres du staff ────────────────────────────
@router.get("/staff/{user_id}/roles", response_model=UserRolesResponse)
async def get_user_roles(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    estab_id: uuid.UUID = Depends(admin_establishment_id),
) -> UserRolesResponse:
    return await service.get_user_roles(user_id, estab_id, db)


@router.post("/staff/{user_id}/roles/{role_id}", response_model=UserRolesResponse)
async def assign_role(
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    estab_id: uuid.UUID = Depends(admin_establishment_id),
) -> UserRolesResponse:
    return await service.assign_role(user_id, role_id, estab_id, db)


@router.delete("/staff/{user_id}/roles/{role_id}", response_model=UserRolesResponse)
async def revoke_role(
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    estab_id: uuid.UUID = Depends(admin_establishment_id),
) -> UserRolesResponse:
    return await service.revoke_role(user_id, role_id, estab_id, db)
