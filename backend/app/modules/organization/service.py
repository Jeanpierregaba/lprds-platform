import uuid
from app.core.i18n import t

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User, UserRole
from app.modules.organization.models import Department, Group, Section
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
from app.modules.staff.models import StaffType

# ── Départements ────────────────────────────────────────────────
async def create_department(
    payload: DepartmentCreateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> DepartmentResponse:
    await _ensure_department_name_available(payload.name, establishment_id, db)
    dept = Department(
        establishment_id=establishment_id,
        name=payload.name,
        description=payload.description,
    )
    db.add(dept)
    await db.flush()
    return DepartmentResponse.model_validate(dept)


async def list_departments(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    include_inactive: bool = False,
) -> list[DepartmentResponse]:
    filters = [Department.establishment_id == establishment_id]
    if not include_inactive:
        filters.append(Department.is_active.is_(True))
    result = await db.execute(
        select(Department).where(*filters).order_by(Department.name)
    )
    return [DepartmentResponse.model_validate(d) for d in result.scalars().all()]


async def update_department(
    department_id: uuid.UUID,
    payload: DepartmentUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> DepartmentResponse:
    dept = await get_or_404(Department, department_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] != dept.name:
        await _ensure_department_name_available(changes["name"], establishment_id, db)
    for field, value in changes.items():
        setattr(dept, field, value)
    await db.flush()
    return DepartmentResponse.model_validate(dept)


async def deactivate_department(
    department_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    dept = await get_or_404(Department, department_id, establishment_id, db)
    dept.is_active = False
    await db.flush()


# ── Sections ─────────────────────────────────────────────────────
async def create_section(
    payload: SectionCreateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> SectionResponse:
    # Pas de section sans département (du même établissement)
    await get_or_404(Department, payload.department_id, establishment_id, db)
    await _ensure_section_name_available(payload.name, payload.department_id, db)

    section = Section(
        establishment_id=establishment_id,
        department_id=payload.department_id,
        name=payload.name,
        description=payload.description,
    )
    db.add(section)
    await db.flush()
    return SectionResponse.model_validate(section)


async def list_sections(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    department_id: uuid.UUID | None = None,
    include_inactive: bool = False,
) -> list[SectionResponse]:
    filters = [Section.establishment_id == establishment_id]
    if department_id:
        filters.append(Section.department_id == department_id)
    if not include_inactive:
        filters.append(Section.is_active.is_(True))
    result = await db.execute(
        select(Section).where(*filters).order_by(Section.name)
    )
    return [SectionResponse.model_validate(s) for s in result.scalars().all()]


async def update_section(
    section_id: uuid.UUID,
    payload: SectionUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> SectionResponse:
    section = await get_or_404(Section, section_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] != section.name:
        await _ensure_section_name_available(changes["name"], section.department_id, db)
    for field, value in changes.items():
        setattr(section, field, value)
    await db.flush()
    return SectionResponse.model_validate(section)


async def deactivate_section(
    section_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    section = await get_or_404(Section, section_id, establishment_id, db)
    section.is_active = False
    await db.flush()


# ── Groupes ──────────────────────────────────────────────────────
async def create_group(
    payload: GroupCreateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> GroupResponse:
    section = await get_or_404(Section, payload.section_id, establishment_id, db)
    educatrice = await _resolve_educatrice(payload.educatrice_id, establishment_id, db)
    await _ensure_educatrice_free_in_section(
        payload.section_id, educatrice.id, db
    )

    name = payload.name or educatrice.nickname or \
        f"{educatrice.first_name} {educatrice.last_name}"
    await _ensure_group_name_available(name, payload.section_id, db)

    group = Group(
        establishment_id=establishment_id,
        section_id=section.id,
        educatrice_id=educatrice.id,
        name=name,
    )
    db.add(group)
    await db.flush()

    await _assign_children(group, payload.child_ids, establishment_id, db)
    await db.flush()
    await db.refresh(group)
    return GroupResponse.model_validate(group)


async def list_groups(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    section_id: uuid.UUID | None = None,
    include_inactive: bool = False,
) -> list[GroupResponse]:
    filters = [Group.establishment_id == establishment_id]
    if section_id:
        filters.append(Group.section_id == section_id)
    if not include_inactive:
        filters.append(Group.is_active.is_(True))
    result = await db.execute(
        select(Group).where(*filters).order_by(Group.name)
    )
    return [GroupResponse.model_validate(g) for g in result.scalars().all()]


async def get_group(
    group_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> GroupResponse:
    return GroupResponse.model_validate(
        await get_or_404(Group, group_id, establishment_id, db)
    )


async def update_group(
    group_id: uuid.UUID,
    payload: GroupUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> GroupResponse:
    group = await get_or_404(Group, group_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)

    if "educatrice_id" in changes and changes["educatrice_id"] != group.educatrice_id:
        educatrice = await _resolve_educatrice(
            changes["educatrice_id"], establishment_id, db
        )
        await _ensure_educatrice_free_in_section(
            group.section_id, educatrice.id, db, exclude_group_id=group.id
        )
        group.educatrice_id = educatrice.id
        changes.pop("educatrice_id")

    if "name" in changes and changes["name"] != group.name:
        await _ensure_group_name_available(
            changes["name"], group.section_id, db, exclude_group_id=group.id
        )

    for field, value in changes.items():
        setattr(group, field, value)

    await db.flush()
    await db.refresh(group)
    return GroupResponse.model_validate(group)


async def deactivate_group(
    group_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    group = await get_or_404(Group, group_id, establishment_id, db)
    group.is_active = False
    await db.flush()


async def assign_child(
    group_id: uuid.UUID,
    child_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> GroupResponse:
    """
    Assigne (ou déplace) un enfant vers ce groupe. Comme child.group_id est unique,
    l'enfant quitte automatiquement son groupe précédent — le déplacement reste
    donc « dans la même section » puisque la section de l'enfant est fixe et doit
    correspondre à celle du groupe.
    """
    group = await get_or_404(Group, group_id, establishment_id, db)
    from app.modules.children.models import Child

    child = await _get_child_or_404(child_id, establishment_id, db)
    _ensure_child_matches_section(child, group)
    child.group_id = group.id
    await db.flush()
    await db.refresh(group)
    return GroupResponse.model_validate(group)


async def remove_child(
    group_id: uuid.UUID,
    child_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> GroupResponse:
    group = await get_or_404(Group, group_id, establishment_id, db)
    child = await _get_child_or_404(child_id, establishment_id, db)
    if child.group_id != group.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.organization.child_not_in_group"),
        )
    child.group_id = None
    await db.flush()
    await db.refresh(group)
    return GroupResponse.model_validate(group)


# ── Helper exposé (utilisé par le module children) ──────────────
async def get_or_404(
    model,
    unit_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
):
    result = await db.execute(
        select(model).where(
            model.id == unit_id,
            model.establishment_id == establishment_id,
        )
    )
    unit = result.scalar_one_or_none()
    if not unit:
        # Le nom de l'entité fait partie de la PHRASE affichée : le poser en
        # français ici rendrait « Département not found… » à un parent anglophone.
        # D'où un passage par le catalogue, et un repli explicite plutôt qu'une
        # clé devinée depuis `__tablename__` (que `t()` renverrait telle quelle).
        unit_keys = {
            "departments": "organization.unit.departments",
            "sections": "organization.unit.sections",
            "groups": "organization.unit.groups",
        }
        label = t(unit_keys.get(model.__tablename__, "organization.unit.other"))
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.organization.label_not_found", label=label),
        )
    return unit


# ── Helpers privés ──────────────────────────────────────────────
async def _resolve_educatrice(
    educatrice_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> User:
    result = await db.execute(
        select(User).where(
            User.id == educatrice_id,
            User.establishment_id == establishment_id,
            User.role == UserRole.STAFF,
            User.is_active.is_(True),
        )
    )
    educatrice = result.scalar_one_or_none()
    if not educatrice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.organization.educatrice_not_found"),
        )
    if educatrice.staff_type != str(StaffType.EDUCATEUR):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.organization.educator_type_required"),
        )
    return educatrice


async def _ensure_educatrice_free_in_section(
    section_id: uuid.UUID,
    educatrice_id: uuid.UUID,
    db: AsyncSession,
    *,
    exclude_group_id: uuid.UUID | None = None,
) -> None:
    filters = [
        Group.section_id == section_id,
        Group.educatrice_id == educatrice_id,
        Group.is_active.is_(True),
    ]
    if exclude_group_id:
        filters.append(Group.id != exclude_group_id)
    existing = await db.scalar(select(Group.id).where(*filters))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.organization.educatrice_busy"),
        )


def _ensure_child_matches_section(child, group: Group) -> None:
    if child.section_id != group.section_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.organization.child_wrong_section"),
        )


async def _assign_children(
    group: Group,
    child_ids: list[uuid.UUID],
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    if not child_ids:
        return
    from app.modules.children.models import Child

    unique_ids = set(child_ids)
    result = await db.execute(
        select(Child).where(
            Child.id.in_(unique_ids),
            Child.establishment_id == establishment_id,
        )
    )
    children = list(result.scalars().all())
    if len(children) != len(unique_ids):
        missing = unique_ids - {c.id for c in children}
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.organization.children_not_found",
                     ids=", ".join(str(m) for m in missing)),
        )
    for child in children:
        _ensure_child_matches_section(child, group)
        child.group_id = group.id


async def _get_child_or_404(
    child_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
):
    from app.modules.children.models import Child

    result = await db.execute(
        select(Child).where(
            Child.id == child_id,
            Child.establishment_id == establishment_id,
        )
    )
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.organization.child_not_found"),
        )
    return child


async def _ensure_department_name_available(
    name: str,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    existing = await db.scalar(
        select(Department.id).where(
            Department.establishment_id == establishment_id,
            Department.name == name,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.organization.department_exists", name=name),
        )


async def _ensure_section_name_available(
    name: str,
    department_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    existing = await db.scalar(
        select(Section.id).where(
            Section.department_id == department_id,
            Section.name == name,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.organization.section_exists", name=name),
        )


async def _ensure_group_name_available(
    name: str,
    section_id: uuid.UUID,
    db: AsyncSession,
    *,
    exclude_group_id: uuid.UUID | None = None,
) -> None:
    # Cohérent avec l'index partiel : on ne compare qu'aux groupes actifs
    filters = [
        Group.section_id == section_id,
        Group.name == name,
        Group.is_active.is_(True),
    ]
    if exclude_group_id:
        filters.append(Group.id != exclude_group_id)
    existing = await db.scalar(select(Group.id).where(*filters))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.organization.group_exists", name=name),
        )
