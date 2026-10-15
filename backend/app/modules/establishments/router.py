import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import require_roles
from app.modules.auth.models import UserRole
from app.modules.auth.schemas import UserResponse
from app.modules.establishments import service
from app.modules.establishments.schemas import (
    EstablishmentAdminCreate,
    EstablishmentAdminUpdate,
    EstablishmentCreateRequest,
    EstablishmentDetailResponse,
    EstablishmentListResponse,
    EstablishmentResponse,
    EstablishmentUpdateRequest,
)

# Les établissements sont gérés exclusivement par les superadmins :
# la dépendance est appliquée à l'ensemble du router.
router = APIRouter(
    prefix="/establishments",
    tags=["establishments"],
    dependencies=[Depends(require_roles(UserRole.SUPERADMIN))],
)


@router.post(
    "",
    response_model=EstablishmentDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_establishment(
    payload: EstablishmentCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> EstablishmentDetailResponse:
    return await service.create_establishment(payload, db)


@router.get("", response_model=EstablishmentListResponse)
async def list_establishments(
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(default=None, description="Filtre sur le nom ou le code"),
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> EstablishmentListResponse:
    return await service.list_establishments(
        db,
        search=search,
        include_inactive=include_inactive,
        skip=skip,
        limit=limit,
    )


@router.get("/{establishment_id}", response_model=EstablishmentDetailResponse)
async def get_establishment(
    establishment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> EstablishmentDetailResponse:
    return await service.get_establishment(establishment_id, db)


@router.patch("/{establishment_id}", response_model=EstablishmentResponse)
async def update_establishment(
    establishment_id: uuid.UUID,
    payload: EstablishmentUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> EstablishmentResponse:
    return await service.update_establishment(establishment_id, payload, db)


@router.delete("/{establishment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_establishment(
    establishment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Désactive l'établissement (soft delete) — rien n'est supprimé."""
    await service.deactivate_establishment(establishment_id, db)


# ── Administrateurs de l'établissement ──────────────────────────
@router.get("/{establishment_id}/admins", response_model=list[UserResponse])
async def list_admins(
    establishment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    admins = await service.list_admins(establishment_id, db)
    return [UserResponse.model_validate(a) for a in admins]


@router.post(
    "/{establishment_id}/admins",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_admin(
    establishment_id: uuid.UUID,
    payload: EstablishmentAdminCreate,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    admin = await service.add_admin(establishment_id, payload, db)
    return UserResponse.model_validate(admin)


@router.patch(
    "/{establishment_id}/admins/{user_id}",
    response_model=UserResponse,
)
async def update_admin(
    establishment_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: EstablishmentAdminUpdate,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Donne (ou corrige) le surnom d'un admin existant.

    Les admins créés avant que le champ n'existe n'ont aucun autre moyen d'en
    recevoir un : leur fiche ne se saisit qu'à la création, et un compte admin
    ne se recrée pas.
    """
    admin = await service.update_admin(establishment_id, user_id, payload, db)
    return UserResponse.model_validate(admin)


@router.delete(
    "/{establishment_id}/admins/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_admin(
    establishment_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Retire un admin en désactivant son compte (le dernier ne peut pas l'être)."""
    await service.remove_admin(establishment_id, user_id, db)
