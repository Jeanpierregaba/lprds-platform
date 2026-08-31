import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import User
from app.modules.children import service
from app.modules.children.dependencies import get_staff
from app.modules.children.schemas import (
    ChildCreateRequest,
    ChildListResponse,
    ChildResponse,
    ChildStatusRequest,
    ChildUpdateRequest,
)
from app.modules.rbac.dependencies import require_permission
from app.modules.rbac.models import PermissionCode

router = APIRouter(prefix="/children", tags=["children"])


@router.post("", response_model=ChildResponse, status_code=status.HTTP_201_CREATED)
async def create_child(
    payload: ChildCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_WRITE)),
) -> ChildResponse:
    """Le matricule est généré côté serveur à partir du code établissement."""
    return await service.create_child(payload, current_user.establishment_id, db)


@router.get("", response_model=ChildListResponse)
async def list_children(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_READ)),
    search: str | None = Query(default=None, description="Nom, prénoms ou matricule"),
    department_id: uuid.UUID | None = Query(default=None),
    section_id: uuid.UUID | None = Query(default=None),
    unassigned_only: bool = Query(default=False, description="Enfants sans groupe uniquement"),
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ChildListResponse:
    return await service.list_children(
        current_user.establishment_id,
        db,
        search=search,
        department_id=department_id,
        section_id=section_id,
        unassigned_only=unassigned_only,
        include_inactive=include_inactive,
        skip=skip,
        limit=limit,
    )


@router.get("/my-group", response_model=ChildListResponse)
async def list_my_group_children(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_staff),
) -> ChildListResponse:
    """
    « Mon Groupe » — enfants du/des groupe(s) dont l'utilisateur est
    l'educatrice responsable. Hors RBAC (aucune permission children:read
    requise) : placé AVANT /{child_id}, segments différents, aucune
    ambiguïté de routage."""
    return await service.list_my_group_children(current_user.id, db)


@router.get("/{child_id}", response_model=ChildResponse)
async def get_child(
    child_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_READ)),
) -> ChildResponse:
    return await service.get_child(child_id, current_user.establishment_id, db)


@router.patch("/{child_id}", response_model=ChildResponse)
async def update_child(
    child_id: uuid.UUID,
    payload: ChildUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_WRITE)),
) -> ChildResponse:
    return await service.update_child(
        child_id, payload, current_user.establishment_id, db
    )


@router.patch("/{child_id}/status", response_model=ChildResponse)
async def set_child_status(
    child_id: uuid.UUID,
    payload: ChildStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_ARCHIVE)),
) -> ChildResponse:
    """
    Active / désactive la fiche. Il n'y a pas d'endpoint DELETE : une fiche
    enfant ne se supprime jamais.
    """
    return await service.set_child_status(
        child_id, payload.is_active, current_user.establishment_id, db
    )
