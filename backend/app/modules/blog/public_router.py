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
from app.core.i18n import Locale, coerce_locale, current_locale
from app.modules.blog import service
from app.modules.blog.schemas import (
    GalleryCategoryListResponse,
    PublicArticleDetail,
    PublicArticleListResponse,
    PublicGalleryListResponse,
    TagListResponse,
)

router = APIRouter(prefix="/public/blog", tags=["blog-public"])


def _requested_locale(locale: str | None) -> Locale:
    """Langue de lecture du site vitrine.

    `?locale=` explicite d'abord — le site sert `/en/actualites` depuis une
    URL distincte, et une réponse publique doit dépendre de l'URL seule pour
    rester indexable et cacheable. À défaut, la langue déduite de
    `Accept-Language` par le middleware, pour un visiteur qui arrive sur un
    lien nu. Une valeur inconnue retombe sur le français sans erreur : une
    page vitrine ne doit jamais renvoyer 422 à un visiteur.
    """
    return coerce_locale(locale) if locale else current_locale()


@router.get("/{establishment_code}/articles", response_model=PublicArticleListResponse)
async def list_public_articles(
    establishment_code: str,
    db: AsyncSession = Depends(get_db),
    tag_id: uuid.UUID | None = Query(default=None),
    locale: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> PublicArticleListResponse:
    return await service.list_public_articles(
        establishment_code, db, tag_id=tag_id,
        locale=_requested_locale(locale), skip=skip, limit=limit,
    )


@router.get("/{establishment_code}/tags", response_model=TagListResponse)
async def list_public_tags(
    establishment_code: str,
    locale: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> TagListResponse:
    """`name` arrive DÉJÀ dans la langue demandée — le site vitrine l'affiche
    tel quel, comme pour le titre d'un article."""
    return await service.list_public_tags(
        establishment_code, db, locale=_requested_locale(locale)
    )


@router.get("/{establishment_code}/articles/{article_id}", response_model=PublicArticleDetail)
async def get_public_article(
    establishment_code: str,
    article_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    locale: str | None = Query(default=None),
) -> PublicArticleDetail:
    return await service.get_public_article(
        establishment_code, article_id, db, locale=_requested_locale(locale)
    )


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
@router.get(
    "/{establishment_code}/gallery/categories",
    response_model=GalleryCategoryListResponse,
)
async def list_public_gallery_categories(
    establishment_code: str,
    locale: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> GalleryCategoryListResponse:
    """Catégories pour les pastilles de filtre (jamais d'identifiant exposé :
    seuls id+nom sont renvoyés, comme pour les étiquettes)."""
    return await service.list_public_gallery_categories(
        establishment_code, db, locale=_requested_locale(locale)
    )


@router.get("/{establishment_code}/gallery", response_model=PublicGalleryListResponse)
async def list_public_gallery(
    establishment_code: str,
    db: AsyncSession = Depends(get_db),
    category_id: uuid.UUID | None = Query(default=None),
    locale: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> PublicGalleryListResponse:
    """Toutes les photos de l'établissement — la galerie étant « publication
    immédiate », tout ce qui est uploadé est visible (pas de statut à filtrer)."""
    return await service.list_public_gallery_photos(
        establishment_code, db, category_id=category_id,
        locale=_requested_locale(locale), skip=skip, limit=limit,
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
