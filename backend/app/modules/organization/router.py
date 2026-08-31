import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import User
from app.modules.organization import service
from app.modules.organization.schemas import (
    DepartmentCreateRequest,
    DepartmentResponse,
    DepartmentUpdateRequest,
    GroupCreateRequest,
    GroupResponse,
    GroupUpdateRequest,
    SectionCreateRequest,
    SectionResponse,
    SectionUpdateRequest,
)
from app.modules.rbac.dependencies import require_permission
from app.modules.rbac.models import PermissionCode

router = APIRouter(tags=["organization"])

# Admin d'office, ou staff porteur de la permission (cf. require_permission).
_read = require_permission(PermissionCode.ORGANIZATION_READ)
_write = require_permission(PermissionCode.ORGANIZATION_WRITE)


# ── Départements ────────────────────────────────────────────────
@router.post("/departments", response_model=DepartmentResponse,
             status_code=status.HTTP_201_CREATED)
async def create_department(
    payload: DepartmentCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> DepartmentResponse:
    return await service.create_department(payload, user.establishment_id, db)


@router.get("/departments", response_model=list[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read),
    include_inactive: bool = Query(default=False),
) -> list[DepartmentResponse]:
    return await service.list_departments(
        user.establishment_id, db, include_inactive=include_inactive
    )


@router.patch("/departments/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: uuid.UUID,
    payload: DepartmentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> DepartmentResponse:
    return await service.update_department(department_id, payload, user.establishment_id, db)


@router.delete("/departments/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_department(
    department_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    await service.deactivate_department(department_id, user.establishment_id, db)


# ── Sections ─────────────────────────────────────────────────────
@router.post("/sections", response_model=SectionResponse,
             status_code=status.HTTP_201_CREATED)
async def create_section(
    payload: SectionCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> SectionResponse:
    """Une section doit être rattachée à un département existant."""
    return await service.create_section(payload, user.establishment_id, db)


@router.get("/sections", response_model=list[SectionResponse])
async def list_sections(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read),
    department_id: uuid.UUID | None = Query(default=None),
    include_inactive: bool = Query(default=False),
) -> list[SectionResponse]:
    return await service.list_sections(
        user.establishment_id, db,
        department_id=department_id, include_inactive=include_inactive,
    )


@router.patch("/sections/{section_id}", response_model=SectionResponse)
async def update_section(
    section_id: uuid.UUID,
    payload: SectionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> SectionResponse:
    return await service.update_section(section_id, payload, user.establishment_id, db)


@router.delete("/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_section(
    section_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    await service.deactivate_section(section_id, user.establishment_id, db)


# ── Groupes ──────────────────────────────────────────────────────
@router.post("/groups", response_model=GroupResponse,
             status_code=status.HTTP_201_CREATED)
async def create_group(
    payload: GroupCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> GroupResponse:
    """
    Rattaché à une section, avec une éducatrice (staff type=educateur) unique dans
    la section. Les enfants assignés doivent appartenir à cette même section.
    """
    return await service.create_group(payload, user.establishment_id, db)


@router.get("/groups", response_model=list[GroupResponse])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read),
    section_id: uuid.UUID | None = Query(default=None),
    include_inactive: bool = Query(default=False),
) -> list[GroupResponse]:
    return await service.list_groups(
        user.establishment_id, db,
        section_id=section_id, include_inactive=include_inactive,
    )


@router.get("/groups/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read),
) -> GroupResponse:
    return await service.get_group(group_id, user.establishment_id, db)


@router.patch("/groups/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: uuid.UUID,
    payload: GroupUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> GroupResponse:
    return await service.update_group(group_id, payload, user.establishment_id, db)


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    await service.deactivate_group(group_id, user.establishment_id, db)


@router.post("/groups/{group_id}/children/{child_id}", response_model=GroupResponse)
async def assign_child(
    group_id: uuid.UUID,
    child_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> GroupResponse:
    """Assigne ou déplace un enfant vers ce groupe (même section obligatoire)."""
    return await service.assign_child(group_id, child_id, user.establishment_id, db)


@router.delete("/groups/{group_id}/children/{child_id}", response_model=GroupResponse)
async def remove_child(
    group_id: uuid.UUID,
    child_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> GroupResponse:
    return await service.remove_child(group_id, child_id, user.establishment_id, db)
