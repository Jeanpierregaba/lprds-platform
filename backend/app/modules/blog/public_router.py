"""
Consultation publique du blog — SANS authentification, seule exception du
projet à la règle « toujours un token JWT » (cf. blog/models.py). Scopé par
`establishment_code` (le code court et unique de l'établissement, déjà utilisé
comme préfixe de matricule) plutôt que par UUID — évite d'exposer/deviner des
identifiants internes dans une URL publique.

Ne renvoie jamais que du contenu PUBLISHED + actif (jamais un brouillon, jamais
un article soft-deleted) — la vérification est dans service.py, pas ici.
"""

import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.blog import service
from app.modules.blog.models import GalleryCategory
from app.modules.blog.schemas import (
    PublicArticleDetail,
    PublicArticleListResponse,
    PublicGalleryListResponse,
    TagListResponse,
)

router = APIRouter(prefix="/public/blog", tags=["blog-public"])


@router.get("/{establishment_code}/articles", response_model=PublicArticleListResponse)
async def list_public_articles(
    establishment_code: str,
    db: AsyncSession = Depends(get_db),
    tag_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> PublicArticleListResponse:
    return await service.list_public_articles(
        establishment_code, db, tag_id=tag_id, skip=skip, limit=limit
    )


@router.get("/{establishment_code}/tags", response_model=TagListResponse)
async def list_public_tags(
    establishment_code: str, db: AsyncSession = Depends(get_db)
) -> TagListResponse:
    return await service.list_public_tags(establishment_code, db)


@router.get("/{establishment_code}/articles/{article_id}", response_model=PublicArticleDetail)
async def get_public_article(
    establishment_code: str,
    article_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> PublicArticleDetail:
    return await service.get_public_article(establishment_code, article_id, db)


@router.get("/{establishment_code}/articles/{article_id}/cover")
async def download_public_cover(
    establishment_code: str,
    article_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    article, path = await service.get_public_cover(establishment_code, article_id, db)
    return FileResponse(path, filename=article.cover_filename, media_type=article.cover_content_type)


@router.get("/{establishment_code}/articles/{article_id}/attachments/{attachment_id}")
async def download_public_attachment(
    establishment_code: str,
    article_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    attachment, path = await service.get_public_attachment(
        establishment_code, article_id, attachment_id, db
    )
    return FileResponse(path, filename=attachment.filename, media_type=attachment.content_type)


# ── Galerie (site vitrine, SANS authentification) ────────────────
@router.get("/{establishment_code}/gallery", response_model=PublicGalleryListResponse)
async def list_public_gallery(
    establishment_code: str,
    db: AsyncSession = Depends(get_db),
    category: GalleryCategory | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> PublicGalleryListResponse:
    """Toutes les photos de l'établissement — la galerie étant « publication
    immédiate », tout ce qui est uploadé est visible (pas de statut à filtrer)."""
    return await service.list_public_gallery_photos(
        establishment_code, db, category=category, skip=skip, limit=limit
    )


@router.get("/{establishment_code}/gallery/{photo_id}/image")
async def download_public_gallery_photo(
    establishment_code: str,
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Contenu binaire — lisibilité publique tant que la photo existe."""
    photo, path = await service.get_public_gallery_photo(establishment_code, photo_id, db)
    return FileResponse(path, filename=photo.filename, media_type=photo.content_type)
