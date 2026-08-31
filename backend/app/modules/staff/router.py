import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import User
from app.modules.rbac.dependencies import require_permission
from app.modules.rbac.models import PermissionCode
from app.modules.staff import service
from app.modules.staff.models import StaffType
from app.modules.staff.schemas import (
    StaffCreateRequest,
    StaffListResponse,
    StaffPasswordResetRequest,
    StaffResponse,
    StaffStatusRequest,
    StaffUpdateRequest,
)

router = APIRouter(prefix="/staff", tags=["staff"])


@router.post("", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff(
    payload: StaffCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.STAFF_WRITE)),
) -> StaffResponse:
    """Crée un compte staff (matricule généré) et envoie ses identifiants par email."""
    return await service.create_staff(payload, current_user.establishment_id, db)


@router.get("", response_model=StaffListResponse)
async def list_staff(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.STAFF_READ)),
    search: str | None = Query(default=None, description="Nom, surnom, email ou matricule"),
    staff_type: StaffType | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> StaffListResponse:
    return await service.list_staff(
        current_user.establishment_id,
        db,
        search=search,
        staff_type=staff_type,
        include_inactive=include_inactive,
        skip=skip,
        limit=limit,
    )


@router.get("/{staff_id}", response_model=StaffResponse)
async def get_staff(
    staff_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.STAFF_READ)),
) -> StaffResponse:
    return await service.get_staff(staff_id, current_user.establishment_id, db)


@router.patch("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: uuid.UUID,
    payload: StaffUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.STAFF_WRITE)),
) -> StaffResponse:
    """Modifie les informations d'un membre du personnel (email inclus)."""
    return await service.update_staff(
        staff_id, payload, current_user.establishment_id, db
    )


@router.post("/{staff_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_staff_password(
    staff_id: uuid.UUID,
    payload: StaffPasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.STAFF_WRITE)),
) -> None:
    """
    Réinitialise le mot de passe : le nouveau mot de passe fourni est envoyé au
    personnel par email. Le personnel n'a pas à le redéfinir.
    """
    await service.reset_staff_password(
        staff_id, payload.new_password, current_user.establishment_id, db
    )


@router.patch("/{staff_id}/status", response_model=StaffResponse)
async def set_staff_status(
    staff_id: uuid.UUID,
    payload: StaffStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.STAFF_WRITE)),
) -> StaffResponse:
    """
    Active / désactive le compte. Il n'y a pas d'endpoint DELETE : un compte
    staff ne se supprime jamais.
    """
    return await service.set_staff_status(
        staff_id, payload.is_active, current_user.establishment_id, db
    )
