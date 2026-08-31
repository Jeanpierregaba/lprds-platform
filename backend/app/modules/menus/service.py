import uuid
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User, UserRole
from app.modules.menus.models import WeeklyMenu
from app.modules.menus.schemas import (
    DayMenu,
    MenuCreateRequest,
    MenuListItem,
    MenuListResponse,
    MenuResponse,
    MenuWriteRequest,
    UserBrief,
)
from app.modules.rbac.dependencies import user_permission_codes
from app.modules.rbac.models import PermissionCode

_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"]


def _current_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


def _can_see_history(current_user: User) -> bool:
    codes = user_permission_codes(current_user)
    return (
        current_user.role == UserRole.ADMIN
        or PermissionCode.MENUS_WRITE in codes
        or PermissionCode.MENUS_READ in codes
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


# ── Écriture (admin ou menus:write) ───────────────────────────────
async def create_menu(
    payload: MenuCreateRequest,
    establishment_id: uuid.UUID,
    author: User,
    db: AsyncSession,
) -> MenuResponse:
    week_start = payload.week_start
    _ensure_monday(week_start)
    _ensure_not_past(week_start)

    existing = await db.scalar(
        select(WeeklyMenu.id).where(
            WeeklyMenu.establishment_id == establishment_id,
            WeeklyMenu.week_start == week_start,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un menu existe déjà pour cette semaine — utilisez PATCH pour le modifier",
        )

    content = payload.model_dump(mode="json", exclude={"week_start"})
    menu = WeeklyMenu(
        establishment_id=establishment_id,
        week_start=week_start,
        content=content,
        created_by_id=author.id,
    )
    db.add(menu)
    await db.flush()
    await db.refresh(menu)
    return _to_response(menu)


async def update_menu(
    week_start: date,
    payload: MenuWriteRequest,
    establishment_id: uuid.UUID,
    editor: User,
    db: AsyncSession,
) -> MenuResponse:
    _ensure_not_past(week_start)
    menu = await _get_menu_or_404(week_start, establishment_id, db)

    menu.content = payload.model_dump(mode="json")
    menu.updated_by_id = editor.id
    await db.flush()
    await db.refresh(menu)
    return _to_response(menu)


async def delete_menu(
    week_start: date, establishment_id: uuid.UUID, db: AsyncSession
) -> None:
    _ensure_not_past(week_start)
    menu = await _get_menu_or_404(week_start, establishment_id, db)
    await db.delete(menu)
    await db.flush()


# ── Lecture ────────────────────────────────────────────────────────
async def get_current_menu(
    establishment_id: uuid.UUID, db: AsyncSession
) -> MenuResponse:
    """Semaine en cours — ouvert à tout acteur de l'établissement, aucune
    restriction (jamais dans le passé par construction)."""
    menu = await _get_menu_or_404(_current_monday(), establishment_id, db)
    return _to_response(menu)


async def get_menu(
    week_start: date, establishment_id: uuid.UUID, current_user: User, db: AsyncSession
) -> MenuResponse:
    """Semaine quelconque : ouvert si >= semaine en cours, sinon réservé à
    l'admin / staff avec menus:write (consultation de l'historique)."""
    if week_start < _current_monday() and not _can_see_history(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seuls l'admin et le staff restaurateur délégué peuvent consulter l'historique des menus",
        )
    menu = await _get_menu_or_404(week_start, establishment_id, db)
    return _to_response(menu)


async def list_menus(
    establishment_id: uuid.UUID, db: AsyncSession, *, skip: int = 0, limit: int = 50
) -> MenuListResponse:
    """Historique complet (passé + à venir) — réservé côté router à
    admin/menus:write (require_permission), pas de re-vérification ici."""
    total = await db.scalar(
        select(func.count()).select_from(WeeklyMenu).where(
            WeeklyMenu.establishment_id == establishment_id
        )
    )
    result = await db.execute(
        select(WeeklyMenu)
        .where(WeeklyMenu.establishment_id == establishment_id)
        .order_by(WeeklyMenu.week_start.desc())
        .offset(skip)
        .limit(limit)
    )
    items = [
        MenuListItem(
            id=m.id, week_start=m.week_start,
            week_end=m.week_start + timedelta(days=4), updated_at=m.updated_at,
        )
        for m in result.scalars().all()
    ]
    return MenuListResponse(total=total or 0, items=items)


# ── Helpers privés ──────────────────────────────────────────────
async def _get_menu_or_404(
    week_start: date, establishment_id: uuid.UUID, db: AsyncSession
) -> WeeklyMenu:
    menu = await db.scalar(
        select(WeeklyMenu).where(
            WeeklyMenu.establishment_id == establishment_id,
            WeeklyMenu.week_start == week_start,
        )
    )
    if not menu:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucun menu publié pour cette semaine",
        )
    return menu


def _user_brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id, first_name=user.first_name, last_name=user.last_name,
        nickname=user.nickname,
    )


def _to_response(menu: WeeklyMenu) -> MenuResponse:
    days = {day: DayMenu(**menu.content.get(day, {})) for day in _DAYS}
    return MenuResponse(
        id=menu.id,
        establishment_id=menu.establishment_id,
        week_start=menu.week_start,
        week_end=menu.week_start + timedelta(days=4),
        created_by=_user_brief(menu.created_by),
        updated_by=_user_brief(menu.updated_by) if menu.updated_by else None,
        created_at=menu.created_at,
        updated_at=menu.updated_at,
        **days,
    )
