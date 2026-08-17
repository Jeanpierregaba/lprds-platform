from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import User, UserRole
from app.modules.menus import service
from app.modules.menus.dependencies import get_establishment_member
from app.modules.menus.schemas import (
    MenuCreateRequest,
    MenuListResponse,
    MenuResponse,
    MenuWriteRequest,
)
from app.modules.rbac.dependencies import require_permission, user_permission_codes
from app.modules.rbac.models import PermissionCode

router = APIRouter(prefix="/menus", tags=["menus"])

_write = require_permission(PermissionCode.MENUS_WRITE)


async def _read_history(
    user: User = Depends(get_establishment_member),
) -> User:
    """Historique (semaines passées + liste complète) : admin, ou staff porteur
    de menus:read (consultation seule) OU menus:write (édition, inclut donc la
    lecture)."""
    if user.role == UserRole.ADMIN:
        return user
    codes = user_permission_codes(user)
    if PermissionCode.MENUS_READ.value in codes or PermissionCode.MENUS_WRITE.value in codes:
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permissions insuffisantes")


# ── Écriture (admin ou staff délégué menus:write) ─────────────────
@router.post("", response_model=MenuResponse, status_code=status.HTTP_201_CREATED)
async def create_menu(
    payload: MenuCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> MenuResponse:
    """`week_start` doit être un lundi, et ne peut pas être dans le passé —
    on ne réécrit jamais l'historique."""
    return await service.create_menu(payload, user.establishment_id, user, db)


@router.patch("/{week_start}", response_model=MenuResponse)
async def update_menu(
    week_start: date,
    payload: MenuWriteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> MenuResponse:
    """Remplace le contenu entier de la semaine (pas de fusion partielle)."""
    return await service.update_menu(week_start, payload, user.establishment_id, user, db)


@router.delete("/{week_start}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_menu(
    week_start: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    await service.delete_menu(week_start, user.establishment_id, db)


@router.get("", response_model=MenuListResponse)
async def list_menus(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read_history),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> MenuListResponse:
    """Historique complet (semaines passées et à venir) — réservé à l'admin et
    au staff délégué menus:read ou menus:write. Placé AVANT /{week_start} :
    segments différents (aucune ambiguïté), même précaution que les autres
    modules."""
    return await service.list_menus(user.establishment_id, db, skip=skip, limit=limit)


# ── Lecture (tout acteur de l'établissement) ──────────────────────
@router.get("/current", response_model=MenuResponse)
async def get_current_menu(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_establishment_member),
) -> MenuResponse:
    """Semaine en cours — ouvert à tous (admin, staff, parent), aucune
    permission requise. Placé AVANT /{week_start} pour éviter toute
    ambiguïté de routage."""
    return await service.get_current_menu(user.establishment_id, db)


@router.get("/{week_start}", response_model=MenuResponse)
async def get_menu(
    week_start: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_establishment_member),
) -> MenuResponse:
    """Semaine en cours ou à venir : ouvert à tous. Semaine passée : réservé à
    l'admin et au staff délégué menus:write (403 sinon)."""
    return await service.get_menu(week_start, user.establishment_id, user, db)
