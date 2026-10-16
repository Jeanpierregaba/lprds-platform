"""
Requêtes de l'annuaire — colonnes explicitement nommées, jamais l'entité ORM.

⚠️ `select(Child)` hydraterait l'objet entier, donc le dossier médical, pour
n'en garder que deux champs : le filtrage se fait au niveau du SCHÉMA, pas de
la requête, et un ajout de colonne sensible sur `children` entrerait en base
de l'appelant sans que personne ne le décide. Nommer les colonnes rend
l'omission volontaire et durable.
"""
import uuid

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.children.models import Child
from app.modules.auth.models import User, UserRole
from app.modules.directory.schemas import (
    DirectoryChild,
    DirectoryChildrenResponse,
    DirectoryStaff,
    DirectoryStaffResponse,
    DirectoryUnit,
    DirectoryUnitsResponse,
)
from app.modules.organization.models import Department, Group, Section


def _apply_search(stmt: Select, search: str | None, *columns) -> Select:
    if not search:
        return stmt
    pattern = f"%{search.strip()}%"
    return stmt.where(or_(*(col.ilike(pattern) for col in columns)))


async def list_children(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    search: str | None = None,
    section_id: uuid.UUID | None = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> DirectoryChildrenResponse:
    filters = [Child.establishment_id == establishment_id]
    if not include_inactive:
        filters.append(Child.is_active.is_(True))
    if section_id is not None:
        filters.append(Child.section_id == section_id)

    base = select(
        Child.id,
        Child.matricule,
        Child.first_names,
        Child.last_name,
        Child.department_id,
        Department.name.label("department_name"),
        Child.section_id,
        Section.name.label("section_name"),
        Child.is_active,
        Child.photo_storage_key,
    ).outerjoin(
        Department, Department.id == Child.department_id
    ).outerjoin(
        Section, Section.id == Child.section_id
    ).where(*filters)
    base = _apply_search(base, search, Child.first_names, Child.last_name, Child.matricule)

    total = await db.scalar(
        select(func.count()).select_from(base.subquery())
    ) or 0
    rows = await db.execute(
        base.order_by(Child.last_name, Child.first_names).offset(skip).limit(limit)
    )

    return DirectoryChildrenResponse(
        total=total,
        items=[
            DirectoryChild(
                id=r.id,
                # ⚠️ Un enfant n'a pas de surnom : `display_name()` ne
                # s'applique pas ici (cf. app/core/people.py).
                display_name=f"{r.first_names} {r.last_name}".strip(),
                first_names=r.first_names,
                last_name=r.last_name,
                matricule=r.matricule,
                department_id=r.department_id,
                department_name=r.department_name,
                section_id=r.section_id,
                section_name=r.section_name,
                is_active=r.is_active,
                has_photo=r.photo_storage_key is not None,
            )
            for r in rows
        ],
    )


async def list_staff(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    search: str | None = None,
    staff_type: str | None = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> DirectoryStaffResponse:
    filters = [
        User.establishment_id == establishment_id,
        User.role == UserRole.STAFF,
    ]
    if not include_inactive:
        filters.append(User.is_active.is_(True))
    if staff_type:
        filters.append(User.staff_type == staff_type)

    base = select(
        User.id,
        User.matricule,
        User.nickname,
        User.first_name,
        User.last_name,
        User.staff_type,
        User.is_active,
    ).where(*filters)
    base = _apply_search(
        base, search, User.first_name, User.last_name, User.nickname, User.matricule
    )

    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await db.execute(
        base.order_by(User.last_name, User.first_name).offset(skip).limit(limit)
    )

    return DirectoryStaffResponse(
        total=total,
        items=[
            DirectoryStaff(
                id=r.id,
                # Le SURNOM est le nom affiché partout, l'état civil n'est
                # que le repli — même règle que `display_name()`, appliquée
                # ici sur des colonnes et non sur une entité chargée.
                display_name=(r.nickname or "").strip()
                or f"{r.first_name} {r.last_name}".strip(),
                matricule=r.matricule,
                staff_type=r.staff_type,
                is_active=r.is_active,
            )
            for r in rows
        ],
    )


async def list_units(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    include_inactive: bool = False,
) -> DirectoryUnitsResponse:
    """
    Départements, sections et groupes, pour les sélecteurs de périmètre.

    ⚠️ `include_inactive` n'est pas une commodité : un livre, un rapport ou un
    enfant peut rester rattaché à une section DÉSACTIVÉE, et un écran qui ne
    connaît pas son nom affiche un identifiant brut à la place — le genre de
    défaut qui ne se voit qu'à l'écran.
    """
    def _scoped(model):
        stmt = select(model).where(model.establishment_id == establishment_id)
        if not include_inactive:
            stmt = stmt.where(model.is_active.is_(True))
        return stmt

    departments = await db.execute(
        _scoped(Department)
        .with_only_columns(Department.id, Department.name, Department.is_active)
        .order_by(Department.name)
    )
    sections = await db.execute(
        _scoped(Section)
        .with_only_columns(
            Section.id, Section.name, Section.department_id, Section.is_active
        )
        .order_by(Section.name)
    )
    groups = await db.execute(
        _scoped(Group)
        .with_only_columns(Group.id, Group.name, Group.section_id, Group.is_active)
        .order_by(Group.name)
    )
    return DirectoryUnitsResponse(
        departments=[
            DirectoryUnit(id=r.id, name=r.name, is_active=r.is_active)
            for r in departments
        ],
        sections=[
            DirectoryUnit(
                id=r.id, name=r.name,
                department_id=r.department_id, is_active=r.is_active,
            )
            for r in sections
        ],
        groups=[
            DirectoryUnit(
                id=r.id, name=r.name,
                section_id=r.section_id, is_active=r.is_active,
            )
            for r in groups
        ],
    )
