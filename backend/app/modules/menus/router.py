from datetime import date
from app.core.i18n import t
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import User, UserRole
from app.modules.menus import service
from app.modules.menus.dependencies import get_establishment_member
from app.modules.menus.schemas import (
    CurrentMenusResponse,
    MenuCreateRequest,
    MenuListResponse,
    MenuResponse,
    MenuTranslationRequest,
    MenuTranslationResponse,
    MenuWriteRequest,
    VisibleDepartmentsResponse,
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
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("errors.common.insufficient_permissions"))


# ── Écriture (admin ou staff délégué menus:write, TOUS départements) ─
@router.post("", response_model=MenuResponse, status_code=status.HTTP_201_CREATED)
async def create_menu(
    payload: MenuCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> MenuResponse:
    """`week_start` doit être un lundi, `department_id` est obligatoire (un menu
    = un département), et la semaine ne peut pas être dans le passé — on ne
    réécrit jamais l'historique. 409 si ce département a déjà un menu."""
    return await service.create_menu(payload, user.establishment_id, user, db)


@router.patch("/{week_start}", response_model=MenuResponse)
async def update_menu(
    week_start: date,
    payload: MenuWriteRequest,
    department_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> MenuResponse:
    """Remplace le contenu entier du menu (département + semaine), pas de
    fusion partielle."""
    return await service.update_menu(
        week_start, department_id, payload, user.establishment_id, user, db
    )


@router.get("/{week_start}/translation", response_model=MenuTranslationResponse)
async def get_menu_translation(
    week_start: date,
    department_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> MenuTranslationResponse:
    """Français et anglais côte à côte, pour relire la traduction automatique.

    Réservé à `menus:write` : c'est un écran d'édition, pas de consultation —
    qui lit le menu le lit déjà dans sa langue via les routes normales.
    Deux segments, donc aucune ambiguïté avec `/{week_start}`.
    """
    return await service.get_menu_translation(
        week_start, department_id, user.establishment_id, db
    )


@router.patch("/{week_start}/translation", response_model=MenuTranslationResponse)
async def set_menu_translation(
    week_start: date,
    payload: MenuTranslationRequest,
    department_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> MenuTranslationResponse:
    """Enregistre l'anglais relu — et le grave dans la mémoire de traduction,
    pour que la correction vaille aussi pour les semaines suivantes.

    Contrairement aux autres écritures du module, une semaine passée est
    acceptée : corriger une traduction ne réécrit pas ce qui a été servi.
    """
    return await service.set_menu_translation(
        week_start, department_id, payload, user.establishment_id, user, db
    )


@router.delete("/{week_start}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_menu(
    week_start: date,
    department_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    await service.delete_menu(week_start, department_id, user.establishment_id, db)


@router.get("", response_model=MenuListResponse)
async def list_menus(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read_history),
    department_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> MenuListResponse:
    """Historique complet — réservé à l'admin et au staff délégué menus:read
    ou menus:write, scopé aux départements visibles (+ filtre optionnel).
    Placé AVANT /{week_start} : segments différents (aucune ambiguïté), même
    précaution que les autres modules."""
    return await service.list_menus(
        user.establishment_id, user, db,
        department_id=department_id, skip=skip, limit=limit,
    )


# ── Lecture (scopée aux départements visibles) ───────────────────
@router.get("/departments", response_model=VisibleDepartmentsResponse)
async def get_visible_departments(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_establishment_member),
) -> VisibleDepartmentsResponse:
    """Départements dont l'appelant voit les menus — alimente les sélecteurs
    UI (le parent ne peut pas appeler /departments). Placé AVANT /{week_start}."""
    return await service.get_visible_departments(user.establishment_id, user, db)


@router.get("/current", response_model=CurrentMenusResponse)
async def get_current_menus(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_establishment_member),
) -> CurrentMenusResponse:
    """Semaine en cours — UN menu par département visible (liste vide si aucun
    publié). Le parent multi-départements reçoit tous les siens. Placé AVANT
    /{week_start} pour éviter toute ambiguïté de routage."""
    return await service.get_current_menus(user.establishment_id, user, db)


@router.get("/{week_start}", response_model=MenuResponse)
async def get_menu(
    week_start: date,
    department_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_establishment_member),
) -> MenuResponse:
    """Menu d'un département pour une semaine : 403 si hors périmètre, 403 si
    semaine passée sans droit d'historique, 404 si rien de publié."""
    return await service.get_menu(
        week_start, department_id, user.establishment_id, user, db
    )
