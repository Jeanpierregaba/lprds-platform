import uuid
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User, UserRole
from app.modules.children.models import Child
from app.modules.menus.models import WeeklyMenu
from app.modules.menus.schemas import (
    CurrentMenusResponse,
    DayMenu,
    DepartmentBrief,
    MenuCreateRequest,
    MenuListItem,
    MenuListResponse,
    MenuResponse,
    MenuWriteRequest,
    UserBrief,
    VisibleDepartmentsResponse,
)
from app.modules.organization.models import Department, Group, Section
from app.modules.parents.models import parent_children
from app.modules.rbac.dependencies import user_permission_codes
from app.modules.rbac.models import PermissionCode

_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"]


def _current_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


def _is_manager(current_user: User) -> bool:
    """Admin, ou staff porteur de menus:write — voit et gère TOUS les
    départements (la restauration reste centrale)."""
    return (
        current_user.role == UserRole.ADMIN
        or PermissionCode.MENUS_WRITE in user_permission_codes(current_user)
    )


def _can_see_history(current_user: User) -> bool:
    codes = user_permission_codes(current_user)
    return (
        current_user.role == UserRole.ADMIN
        or PermissionCode.MENUS_WRITE in codes
        or PermissionCode.MENUS_READ in codes
    )


async def _visible_department_ids(
    current_user: User, db: AsyncSession
) -> list[uuid.UUID] | None:
    """Départements dont l'utilisateur voit les menus. None = tous.
    Parent = départements de ses enfants ; éducatrice (≥ 1 groupe mené) =
    départements de ses groupes ; autre staff = tout (inchangé)."""
    if _is_manager(current_user):
        return None
    if current_user.role == UserRole.PARENT:
        result = await db.execute(
            select(Child.department_id)
            .join(parent_children, parent_children.c.child_id == Child.id)
            .where(
                parent_children.c.parent_id == current_user.id,
                Child.department_id.is_not(None),
            )
            .distinct()
        )
        return list(result.scalars().all())
    if current_user.role == UserRole.STAFF:
        result = await db.execute(
            select(Department.id)
            .join(Section, Section.department_id == Department.id)
            .join(Group, Group.section_id == Section.id)
            .where(
                Department.establishment_id == current_user.establishment_id,
                Group.educatrice_id == current_user.id,
                Group.is_active.is_(True),
            )
            .distinct()
        )
        led = list(result.scalars().all())
        if led:
            return led
    return None


async def _validate_department(
    department_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Department:
    department = await db.scalar(
        select(Department).where(
            Department.id == department_id,
            Department.establishment_id == establishment_id,
        )
    )
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Département introuvable"
        )
    return department


def _ensure_visible(
    department_id: uuid.UUID, visible: list[uuid.UUID] | None
) -> None:
    """Hors périmètre → 403 (jamais 404 : on ne révèle pas l'existence —
    même principe que partout ailleurs)."""
    if visible is not None and department_id not in visible:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ce menu ne concerne pas votre département",
        )


def _ensure_monday(week_start: date) -> None:
    if week_start.weekday() != 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="week_start doit être un lundi",
        )


def _ensure_not_past(week_start: date) -> None:
    """On ne réécrit jamais l'historique — création/modification/suppression
    limitées à la semaine en cours ou à venir."""
    if week_start < _current_monday():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Impossible de créer/modifier/supprimer le menu d'une semaine déjà passée",
        )


# ── Écriture (admin ou menus:write, TOUS les départements) ──────
async def create_menu(
    payload: MenuCreateRequest,
    establishment_id: uuid.UUID,
    author: User,
    db: AsyncSession,
) -> MenuResponse:
    week_start = payload.week_start
    _ensure_monday(week_start)
    _ensure_not_past(week_start)
    department = await _validate_department(payload.department_id, establishment_id, db)

    existing = await db.scalar(
        select(WeeklyMenu.id).where(
            WeeklyMenu.establishment_id == establishment_id,
            WeeklyMenu.department_id == payload.department_id,
            WeeklyMenu.week_start == week_start,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un menu existe déjà pour cette semaine et ce département — utilisez PATCH pour le modifier",
        )

    content = payload.model_dump(mode="json", exclude={"week_start", "department_id"})
    menu = WeeklyMenu(
        establishment_id=establishment_id,
        department_id=payload.department_id,
        week_start=week_start,
        content=content,
        created_by_id=author.id,
    )
    db.add(menu)
    await db.flush()
    await db.refresh(menu)
    return _to_response(menu, department_name=department.name)


async def update_menu(
    week_start: date,
    department_id: uuid.UUID,
    payload: MenuWriteRequest,
    establishment_id: uuid.UUID,
    editor: User,
    db: AsyncSession,
) -> MenuResponse:
    _ensure_not_past(week_start)
    menu = await _get_menu_or_404(week_start, department_id, establishment_id, db)

    menu.content = payload.model_dump(mode="json")
    menu.updated_by_id = editor.id
    await db.flush()
    await db.refresh(menu)
    names = await _department_names(establishment_id, db)
    return _to_response(menu, department_name=names.get(menu.department_id))


async def delete_menu(
    week_start: date,
    department_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    _ensure_not_past(week_start)
    menu = await _get_menu_or_404(week_start, department_id, establishment_id, db)
    await db.delete(menu)
    await db.flush()


# ── Lecture (scopée par départements visibles) ───────────────────
async def get_visible_departments(
    establishment_id: uuid.UUID, current_user: User, db: AsyncSession
) -> VisibleDepartmentsResponse:
    visible = await _visible_department_ids(current_user, db)
    names = await _department_names(establishment_id, db)
    if visible is None:
        items = [
            DepartmentBrief(id=d_id, name=name or "")
            for d_id, name in names.items()
            if name is not None
        ]
    else:
        items = [
            DepartmentBrief(id=d_id, name=names[d_id])
            for d_id in visible
            if d_id in names
        ]
    items.sort(key=lambda d: d.name)
    return VisibleDepartmentsResponse(total=len(items), items=items)


async def get_current_menus(
    establishment_id: uuid.UUID, current_user: User, db: AsyncSession
) -> CurrentMenusResponse:
    """Semaine en cours — un menu par département visible (liste vide si aucun
    publié). Jamais dans le passé par construction."""
    visible = await _visible_department_ids(current_user, db)
    filters = [
        WeeklyMenu.establishment_id == establishment_id,
        WeeklyMenu.week_start == _current_monday(),
    ]
    if visible is not None:
        if not visible:
            return CurrentMenusResponse(items=[])
        filters.append(WeeklyMenu.department_id.in_(visible))
    result = await db.execute(
        select(WeeklyMenu).where(*filters).order_by(WeeklyMenu.department_id)
    )
    menus = result.scalars().all()
    names = await _department_names(establishment_id, db)
    return CurrentMenusResponse(
        items=[_to_response(m, department_name=names.get(m.department_id)) for m in menus]
    )


async def get_menu(
    week_start: date,
    department_id: uuid.UUID,
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> MenuResponse:
    """Semaine quelconque d'un département : 403 si hors périmètre, 403 si
    semaine passée sans droit d'historique (le contrôle d'accès prime sur
    l'existence, comme partout), 404 si aucun menu publié."""
    _ensure_visible(
        department_id, await _visible_department_ids(current_user, db)
    )
    if week_start < _current_monday() and not _can_see_history(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seuls l'admin et le staff restaurateur délégué peuvent consulter l'historique des menus",
        )
    menu = await _get_menu_or_404(week_start, department_id, establishment_id, db)
    names = await _department_names(establishment_id, db)
    return _to_response(menu, department_name=names.get(menu.department_id))


async def list_menus(
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
    *,
    department_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
) -> MenuListResponse:
    """Historique complet — réservé côté router à admin/menus:read/menus:write.
    Scopé aux départements visibles (+ filtre optionnel)."""
    visible = await _visible_department_ids(current_user, db)
    filters = [WeeklyMenu.establishment_id == establishment_id]
    if visible is not None:
        if not visible:
            return MenuListResponse(total=0, items=[])
        filters.append(WeeklyMenu.department_id.in_(visible))
    if department_id is not None:
        _ensure_visible(department_id, visible)
        filters.append(WeeklyMenu.department_id == department_id)

    total = await db.scalar(
        select(func.count()).select_from(WeeklyMenu).where(*filters)
    )
    result = await db.execute(
        select(WeeklyMenu)
        .where(*filters)
        .order_by(WeeklyMenu.week_start.desc(), WeeklyMenu.department_id)
        .offset(skip)
        .limit(limit)
    )
    menus = result.scalars().all()
    names = await _department_names(establishment_id, db)
    items = [
        MenuListItem(
            id=m.id, department_id=m.department_id,
            department_name=names.get(m.department_id),
            week_start=m.week_start,
            week_end=m.week_start + timedelta(days=4), updated_at=m.updated_at,
        )
        for m in menus
    ]
    return MenuListResponse(total=total or 0, items=items)


# ── Helpers privés ──────────────────────────────────────────────
async def _department_names(
    establishment_id: uuid.UUID, db: AsyncSession
) -> dict[uuid.UUID, str | None]:
    """Nom des départements (le parent ne peut pas appeler /departments —
    organization:read requis — le nom est donc dénormalisé dans la réponse)."""
    result = await db.execute(
        select(Department.id, Department.name).where(
            Department.establishment_id == establishment_id
        )
    )
    return dict(result.all())


async def _get_menu_or_404(
    week_start: date,
    department_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> WeeklyMenu:
    menu = await db.scalar(
        select(WeeklyMenu).where(
            WeeklyMenu.establishment_id == establishment_id,
            WeeklyMenu.department_id == department_id,
            WeeklyMenu.week_start == week_start,
        )
    )
    if not menu:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucun menu publié pour cette semaine et ce département",
        )
    return menu


def _user_brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id, first_name=user.first_name, last_name=user.last_name,
        nickname=user.nickname,
    )


def _to_response(menu: WeeklyMenu, *, department_name: str | None = None) -> MenuResponse:
    days = {day: DayMenu(**menu.content.get(day, {})) for day in _DAYS}
    return MenuResponse(
        id=menu.id,
        establishment_id=menu.establishment_id,
        department_id=menu.department_id,
        department_name=department_name,
        week_start=menu.week_start,
        week_end=menu.week_start + timedelta(days=4),
        created_by=_user_brief(menu.created_by),
        updated_by=_user_brief(menu.updated_by) if menu.updated_by else None,
        created_at=menu.created_at,
        updated_at=menu.updated_at,
        **days,
    )
