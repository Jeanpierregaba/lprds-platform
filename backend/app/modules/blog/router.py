import uuid

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import User
from app.modules.blog import service
from app.modules.blog.models import ArticleStatus
from app.modules.blog.schemas import (
    ArticleCreateRequest,
    ArticleListResponse,
    ArticleResponse,
    ArticleUpdateRequest,
    AttachmentResponse,
    GalleryCategoryCreateRequest,
    GalleryCategoryListResponse,
    GalleryCategoryResponse,
    GalleryCategoryUpdateRequest,
    GalleryPhotoListItem,
    GalleryPhotoListResponse,
    TagCreateRequest,
    TagListResponse,
    TagResponse,
    TagUpdateRequest,
)
from app.modules.rbac.dependencies import require_permission
from app.modules.rbac.models import PermissionCode

router = APIRouter(prefix="/blog", tags=["blog"])

_write = require_permission(PermissionCode.BLOG_WRITE)


# ── Étiquettes ──────────────────────────────────────────────────
@router.post("/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    payload: TagCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> TagResponse:
    return await service.create_tag(payload, user.establishment_id, db)


@router.get("/tags", response_model=TagListResponse)
async def list_tags(
    db: AsyncSession = Depends(get_db), user: User = Depends(_write)
) -> TagListResponse:
    return await service.list_tags(user.establishment_id, db)


@router.patch("/tags/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: uuid.UUID,
    payload: TagUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> TagResponse:
    return await service.update_tag(tag_id, payload, user.establishment_id, db)


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    """Suppression définitive de l'étiquette (pas de soft delete pour les
    étiquettes, contrairement aux articles) — les articles qui la portaient
    passent à tag=None (ON DELETE SET NULL)."""
    await service.delete_tag(tag_id, user.establishment_id, db)


# ── Articles (gestion — brouillons inclus, réservé à blog:write) ─
@router.post("/articles", response_model=ArticleResponse, status_code=status.HTTP_201_CREATED)
async def create_article(
    payload: ArticleCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> ArticleResponse:
    """Créé en brouillon — jamais visible publiquement avant /publish."""
    return await service.create_article(payload, user.establishment_id, user, db)


@router.get("/articles", response_model=ArticleListResponse)
async def list_articles(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
    article_status: ArticleStatus | None = Query(default=None, alias="status"),
    tag_id: uuid.UUID | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ArticleListResponse:
    return await service.list_articles(
        user.establishment_id, db, article_status=article_status, tag_id=tag_id,
        include_inactive=include_inactive, skip=skip, limit=limit,
    )


@router.get("/articles/{article_id}", response_model=ArticleResponse)
async def get_article(
    article_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> ArticleResponse:
    return await service.get_article(article_id, user.establishment_id, db)


@router.patch("/articles/{article_id}", response_model=ArticleResponse)
async def update_article(
    article_id: uuid.UUID,
    payload: ArticleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> ArticleResponse:
    """Modifiable en brouillon COMME après publication."""
    return await service.update_article(article_id, payload, user.establishment_id, user, db)


@router.delete("/articles/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_article(
    article_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    """Soft delete — jamais de suppression définitive."""
    await service.delete_article(article_id, user.establishment_id, user, db)


@router.post("/articles/{article_id}/publish", response_model=ArticleResponse)
async def publish_article(
    article_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> ArticleResponse:
    """Nécessite une image à la une et une étiquette (422 sinon)."""
    return await service.publish_article(article_id, user.establishment_id, user, db)


# ── Image à la une ────────────────────────────────────────────────
@router.post("/articles/{article_id}/cover", response_model=ArticleResponse)
async def set_article_cover(
    article_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> ArticleResponse:
    return await service.set_article_cover(article_id, user.establishment_id, user, file, db)


@router.get("/articles/{article_id}/cover")
async def download_article_cover(
    article_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> FileResponse:
    article, path = await service.get_article_cover_for_staff(article_id, user.establishment_id, db)
    return FileResponse(path, filename=article.cover_filename, media_type=article.cover_content_type)


# ── Médias (galerie image/vidéo) ──────────────────────────────────
@router.post(
    "/articles/{article_id}/attachments",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_article_attachment(
    article_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> AttachmentResponse:
    return await service.add_article_attachment(article_id, user.establishment_id, user, file, db)


@router.get("/articles/{article_id}/attachments/{attachment_id}")
async def download_article_attachment(
    article_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> FileResponse:
    attachment, path = await service.get_article_attachment_for_staff(
        article_id, attachment_id, user.establishment_id, db
    )
    return FileResponse(path, filename=attachment.filename, media_type=attachment.content_type)


@router.delete(
    "/articles/{article_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_article_attachment(
    article_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    await service.delete_article_attachment(article_id, attachment_id, user.establishment_id, db)


# ── Galerie du site vitrine ──────────────────────────────────────
# ⚠️ Les routes /gallery/categories* sont déclarées AVANT /gallery/{photo_id} :
# « categories » ne parse pas en UUID et tomberait sinon en 422.
@router.post(
    "/gallery/categories",
    response_model=GalleryCategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_gallery_category(
    payload: GalleryCategoryCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> GalleryCategoryResponse:
    """Crée une catégorie de photo (nom libre, unique par établissement)."""
    return await service.create_gallery_category(payload, user.establishment_id, db)


@router.get("/gallery/categories", response_model=GalleryCategoryListResponse)
async def list_gallery_categories(
    db: AsyncSession = Depends(get_db), user: User = Depends(_write)
) -> GalleryCategoryListResponse:
    return await service.list_gallery_categories(user.establishment_id, db)


@router.patch(
    "/gallery/categories/{category_id}", response_model=GalleryCategoryResponse
)
async def update_gallery_category(
    category_id: uuid.UUID,
    payload: GalleryCategoryUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> GalleryCategoryResponse:
    return await service.update_gallery_category(
        category_id, payload, user.establishment_id, db
    )


@router.delete("/gallery/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gallery_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    """Suppression définitive — les photos restent publiées, sans catégorie."""
    await service.delete_gallery_category(category_id, user.establishment_id, db)


@router.post(
    "/gallery",
    response_model=GalleryPhotoListItem,
    status_code=status.HTTP_201_CREATED,
)
async def upload_gallery_photo(
    category_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> GalleryPhotoListItem:
    """Upload = publication immédiate sur le site vitrine. 404 si la catégorie
    n'appartient pas à l'établissement."""
    return await service.create_gallery_photo(user.establishment_id, user, category_id, file, db)


@router.get("/gallery", response_model=GalleryPhotoListResponse)
async def list_gallery_photos(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
    category_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> GalleryPhotoListResponse:
    return await service.list_gallery_photos(
        user.establishment_id, db, category_id=category_id, skip=skip, limit=limit
    )


@router.get("/gallery/{photo_id}/image")
async def download_gallery_photo(
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> FileResponse:
    photo, path = await service.get_gallery_photo_for_staff(photo_id, user.establishment_id, db)
    return FileResponse(path, filename=photo.filename, media_type=photo.content_type)


@router.delete("/gallery/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gallery_photo(
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    """Suppression définitive — la photo disparaît immédiatement du site public."""
    await service.delete_gallery_photo(photo_id, user.establishment_id, db)
