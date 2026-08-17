import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import User
from app.modules.gallery import service
from app.modules.gallery.dependencies import get_parent, get_staff
from app.modules.gallery.schemas import GalleryMediaListResponse, GallerySource
from app.modules.rbac.dependencies import require_permission
from app.modules.rbac.models import PermissionCode
from app.modules.reports.models import ReportType

router = APIRouter(prefix="/gallery", tags=["gallery"])

_read = require_permission(PermissionCode.GALLERY_READ)


@router.get("/media", response_model=GalleryMediaListResponse)
async def list_gallery_media(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read),
    source: GallerySource | None = Query(default=None),
    child_id: uuid.UUID | None = Query(default=None),
    group_id: uuid.UUID | None = Query(default=None),
    staff_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
    report_type: ReportType | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> GalleryMediaListResponse:
    """
    Admin : toute la galerie de l'établissement (rapports + messagerie).
    Staff délégué (gallery:read) : rapports uniquement — la messagerie reste
    hors RBAC, jamais accessible au staff (cf. claude.md, module Messagerie).
    """
    return await service.list_gallery_media(
        user.establishment_id, user, db,
        source=source, child_id=child_id, group_id=group_id, staff_id=staff_id,
        department_id=department_id, report_type=report_type,
        date_from=date_from, date_to=date_to, skip=skip, limit=limit,
    )


@router.get("/my-uploads", response_model=GalleryMediaListResponse)
async def list_my_uploads(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_staff),
    source: GallerySource | None = Query(default=None),
    child_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> GalleryMediaListResponse:
    """« Galerie » du portail staff — hors RBAC (aucune permission
    gallery:read requise), médias envoyés par l'utilisateur via ses propres
    rapports. Placé AVANT /mine : segments différents, pas d'ambiguïté."""
    return await service.list_my_uploads(
        user, db, source=source, child_id=child_id, skip=skip, limit=limit,
    )


@router.get("/mine", response_model=GalleryMediaListResponse)
async def list_my_gallery_media(
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
    source: GallerySource | None = Query(default=None),
    child_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> GalleryMediaListResponse:
    """Photos/vidéos de ses propres enfants — rapports VALIDÉS + messages de sa
    propre conversation (jamais les diffusions, cf. claude.md)."""
    return await service.list_my_gallery_media(
        parent, db, source=source, child_id=child_id, skip=skip, limit=limit,
    )
