import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.config import settings
from app.modules.auth.models import User
from app.modules.blog.models import Article, ArticleAttachment, ArticleStatus, BlogTag
from app.modules.blog.schemas import (
    ArticleCreateRequest,
    ArticleListItem,
    ArticleListResponse,
    ArticleResponse,
    ArticleUpdateRequest,
    AttachmentResponse,
    PublicArticleDetail,
    PublicArticleListItem,
    PublicArticleListResponse,
    TagBrief,
    TagCreateRequest,
    TagListResponse,
    TagResponse,
    TagUpdateRequest,
    UserBrief,
)
from app.modules.establishments.models import Establishment

_COVER_SUBFOLDER = "blog/covers"
_MEDIA_SUBFOLDER = "blog/media"


# ── Étiquettes (créées librement par l'admin/rédacteur) ───────────
async def create_tag(
    payload: TagCreateRequest, establishment_id: uuid.UUID, db: AsyncSession
) -> TagResponse:
    existing = await db.scalar(
        select(BlogTag.id).where(
            BlogTag.establishment_id == establishment_id, BlogTag.name == payload.name
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une étiquette porte déjà ce nom",
        )
    tag = BlogTag(establishment_id=establishment_id, name=payload.name)
    db.add(tag)
    await db.flush()
    await db.refresh(tag)
    return TagResponse(id=tag.id, name=tag.name, created_at=tag.created_at)


async def list_tags(establishment_id: uuid.UUID, db: AsyncSession) -> TagListResponse:
    result = await db.execute(
        select(BlogTag)
        .where(BlogTag.establishment_id == establishment_id)
        .order_by(BlogTag.name)
    )
    return TagListResponse(items=[
        TagResponse(id=t.id, name=t.name, created_at=t.created_at)
        for t in result.scalars().all()
    ])


async def update_tag(
    tag_id: uuid.UUID, payload: TagUpdateRequest, establishment_id: uuid.UUID, db: AsyncSession
) -> TagResponse:
    tag = await _get_tag_or_404(tag_id, establishment_id, db)
    existing = await db.scalar(
        select(BlogTag.id).where(
            BlogTag.establishment_id == establishment_id,
            BlogTag.name == payload.name,
            BlogTag.id != tag_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une étiquette porte déjà ce nom",
        )
    tag.name = payload.name
    await db.flush()
    return TagResponse(id=tag.id, name=tag.name, created_at=tag.created_at)


async def delete_tag(tag_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession) -> None:
    tag = await _get_tag_or_404(tag_id, establishment_id, db)
    await db.delete(tag)
    await db.flush()


# ── Articles : gestion (admin / blog:write) ───────────────────────
async def create_article(
    payload: ArticleCreateRequest, establishment_id: uuid.UUID, author: User, db: AsyncSession
) -> ArticleResponse:
    if payload.tag_id:
        await _get_tag_or_404(payload.tag_id, establishment_id, db)
    article = Article(
        establishment_id=establishment_id,
        tag_id=payload.tag_id,
        title=payload.title,
        content=payload.content,
        status=str(ArticleStatus.DRAFT),
        created_by_id=author.id,
    )
    db.add(article)
    await db.flush()
    await db.refresh(article)
    return await _to_response(article, db)


async def update_article(
    article_id: uuid.UUID,
    payload: ArticleUpdateRequest,
    establishment_id: uuid.UUID,
    editor: User,
    db: AsyncSession,
) -> ArticleResponse:
    """Modifiable en brouillon COMME après publication (demande explicite) —
    seul un article désactivé (soft delete) ne peut plus être modifié."""
    article = await _get_article_or_404(article_id, establishment_id, db)
    if not article.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette actualité a été supprimée (soft delete)",
        )
    changes = payload.model_dump(exclude_unset=True)
    if "tag_id" in changes and changes["tag_id"]:
        await _get_tag_or_404(changes["tag_id"], establishment_id, db)
    for field, value in changes.items():
        setattr(article, field, value)
    article.updated_by_id = editor.id
    await db.flush()
    await db.refresh(article)
    return await _to_response(article, db)


async def publish_article(
    article_id: uuid.UUID, establishment_id: uuid.UUID, editor: User, db: AsyncSession
) -> ArticleResponse:
    article = await _get_article_or_404(article_id, establishment_id, db)
    if not article.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette actualité a été supprimée (soft delete)",
        )
    if article.status == str(ArticleStatus.PUBLISHED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Cette actualité est déjà publiée"
        )
    if not article.cover_storage_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Une image à la une est requise avant publication",
        )
    if not article.tag_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Une étiquette est requise avant publication",
        )
    article.status = str(ArticleStatus.PUBLISHED)
    article.published_at = datetime.now(timezone.utc)
    article.updated_by_id = editor.id
    await db.flush()
    await db.refresh(article)
    return await _to_response(article, db)


async def delete_article(
    article_id: uuid.UUID, establishment_id: uuid.UUID, editor: User, db: AsyncSession
) -> None:
    """Soft delete — jamais de suppression définitive, même publiée."""
    article = await _get_article_or_404(article_id, establishment_id, db)
    article.is_active = False
    article.updated_by_id = editor.id
    await db.flush()


async def get_article(
    article_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> ArticleResponse:
    article = await _get_article_or_404(article_id, establishment_id, db)
    return await _to_response(article, db)


async def list_articles(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    article_status: ArticleStatus | None = None,
    tag_id: uuid.UUID | None = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> ArticleListResponse:
    filters = [Article.establishment_id == establishment_id]
    if not include_inactive:
        filters.append(Article.is_active.is_(True))
    if article_status:
        filters.append(Article.status == str(article_status))
    if tag_id:
        filters.append(Article.tag_id == tag_id)

    total = await db.scalar(select(func.count()).select_from(Article).where(*filters))
    result = await db.execute(
        select(Article)
        .where(*filters)
        .order_by(Article.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = [_to_list_item(a) for a in result.scalars().all()]
    return ArticleListResponse(total=total or 0, items=items)


# ── Image à la une ────────────────────────────────────────────────
async def set_article_cover(
    article_id: uuid.UUID,
    establishment_id: uuid.UUID,
    editor: User,
    file: UploadFile,
    db: AsyncSession,
) -> ArticleResponse:
    article = await _get_article_or_404(article_id, establishment_id, db)
    if not article.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette actualité a été supprimée (soft delete)",
        )

    content_bytes = await file.read()
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="L'image à la une doit être une image (pas une vidéo)",
        )
    _validate_attachment(content_bytes, content_type)

    old_key = article.cover_storage_key
    new_key = await storage.save_file(_COVER_SUBFOLDER, file.filename or "cover", content_bytes)
    if old_key:
        await storage.delete_file(old_key)

    article.cover_filename = file.filename or "cover"
    article.cover_content_type = content_type
    article.cover_size_bytes = len(content_bytes)
    article.cover_storage_key = new_key
    article.updated_by_id = editor.id
    await db.flush()
    await db.refresh(article)
    return await _to_response(article, db)


async def get_article_cover_for_staff(
    article_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> tuple[Article, Path]:
    article = await _get_article_or_404(article_id, establishment_id, db)
    if not article.cover_storage_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Aucune image à la une"
        )
    return article, storage.resolve_path(article.cover_storage_key)


# ── Médias (galerie image/vidéo) ──────────────────────────────────
async def add_article_attachment(
    article_id: uuid.UUID,
    establishment_id: uuid.UUID,
    editor: User,
    file: UploadFile,
    db: AsyncSession,
) -> AttachmentResponse:
    article = await _get_article_or_404(article_id, establishment_id, db)
    if not article.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette actualité a été supprimée (soft delete)",
        )

    content_bytes = await file.read()
    content_type = file.content_type or ""
    _validate_attachment(content_bytes, content_type)

    storage_key = await storage.save_file(_MEDIA_SUBFOLDER, file.filename or "media", content_bytes)
    attachment = ArticleAttachment(
        article_id=article.id,
        uploaded_by_id=editor.id,
        filename=file.filename or "media",
        content_type=content_type,
        size_bytes=len(content_bytes),
        storage_key=storage_key,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)
    return _attachment_response(attachment, public=False)


async def delete_article_attachment(
    article_id: uuid.UUID, attachment_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> None:
    await _get_article_or_404(article_id, establishment_id, db)
    attachment = await db.scalar(
        select(ArticleAttachment).where(
            ArticleAttachment.id == attachment_id, ArticleAttachment.article_id == article_id
        )
    )
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Média introuvable"
        )
    await storage.delete_file(attachment.storage_key)
    await db.delete(attachment)
    await db.flush()


async def get_article_attachment_for_staff(
    article_id: uuid.UUID, attachment_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> tuple[ArticleAttachment, Path]:
    await _get_article_or_404(article_id, establishment_id, db)
    return await _get_attachment_or_404(article_id, attachment_id, db)


# ── Consultation publique (site vitrine, SANS authentification) ──
async def get_public_establishment_or_404(
    establishment_code: str, db: AsyncSession
) -> Establishment:
    establishment = await db.scalar(
        select(Establishment).where(
            Establishment.code == establishment_code, Establishment.is_active.is_(True)
        )
    )
    if not establishment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Établissement introuvable")
    return establishment


async def list_public_articles(
    establishment_code: str,
    db: AsyncSession,
    *,
    tag_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
) -> PublicArticleListResponse:
    establishment = await get_public_establishment_or_404(establishment_code, db)
    filters = [
        Article.establishment_id == establishment.id,
        Article.status == str(ArticleStatus.PUBLISHED),
        Article.is_active.is_(True),
    ]
    if tag_id:
        filters.append(Article.tag_id == tag_id)

    total = await db.scalar(select(func.count()).select_from(Article).where(*filters))
    result = await db.execute(
        select(Article)
        .where(*filters)
        .order_by(Article.published_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = [
        PublicArticleListItem(
            id=a.id, title=a.title,
            tag=TagBrief(id=a.tag.id, name=a.tag.name) if a.tag else None,
            cover_url=_public_cover_url(establishment_code, a),
            published_at=a.published_at,
        )
        for a in result.scalars().all()
    ]
    return PublicArticleListResponse(total=total or 0, items=items)


async def get_public_article(
    establishment_code: str, article_id: uuid.UUID, db: AsyncSession
) -> PublicArticleDetail:
    establishment = await get_public_establishment_or_404(establishment_code, db)
    article = await db.scalar(
        select(Article).where(
            Article.id == article_id,
            Article.establishment_id == establishment.id,
            Article.status == str(ArticleStatus.PUBLISHED),
            Article.is_active.is_(True),
        )
    )
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actualité introuvable")
    attachments = await _attachments_for_article(article.id, db)
    return PublicArticleDetail(
        id=article.id, title=article.title, content=article.content,
        tag=TagBrief(id=article.tag.id, name=article.tag.name) if article.tag else None,
        cover_url=_public_cover_url(establishment_code, article),
        published_at=article.published_at,
        attachments=[
            _attachment_response(a, public=True, establishment_code=establishment_code, article_id=article.id)
            for a in attachments
        ],
    )


async def list_public_tags(establishment_code: str, db: AsyncSession) -> TagListResponse:
    establishment = await get_public_establishment_or_404(establishment_code, db)
    return await list_tags(establishment.id, db)


async def get_public_cover(
    establishment_code: str, article_id: uuid.UUID, db: AsyncSession
) -> tuple[Article, Path]:
    establishment = await get_public_establishment_or_404(establishment_code, db)
    article = await db.scalar(
        select(Article).where(
            Article.id == article_id,
            Article.establishment_id == establishment.id,
            Article.status == str(ArticleStatus.PUBLISHED),
            Article.is_active.is_(True),
        )
    )
    if not article or not article.cover_storage_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Introuvable")
    return article, storage.resolve_path(article.cover_storage_key)


async def get_public_attachment(
    establishment_code: str, article_id: uuid.UUID, attachment_id: uuid.UUID, db: AsyncSession
) -> tuple[ArticleAttachment, Path]:
    establishment = await get_public_establishment_or_404(establishment_code, db)
    article = await db.scalar(
        select(Article).where(
            Article.id == article_id,
            Article.establishment_id == establishment.id,
            Article.status == str(ArticleStatus.PUBLISHED),
            Article.is_active.is_(True),
        )
    )
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Introuvable")
    return await _get_attachment_or_404(article.id, attachment_id, db)


# ── Helpers privés ──────────────────────────────────────────────
def _validate_attachment(content_bytes: bytes, content_type: str) -> None:
    max_bytes = settings.blog_max_attachment_mb * 1024 * 1024
    if len(content_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Fichier trop volumineux (max {settings.blog_max_attachment_mb} Mo)",
        )
    if not content_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Fichier vide"
        )
    if content_type not in settings.blog_allowed_attachment_types_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Type de fichier non autorisé : {content_type or 'inconnu'}. "
                f"Autorisés : {', '.join(sorted(settings.blog_allowed_attachment_types_set))}"
            ),
        )


async def _get_tag_or_404(tag_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession) -> BlogTag:
    tag = await db.scalar(
        select(BlogTag).where(BlogTag.id == tag_id, BlogTag.establishment_id == establishment_id)
    )
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Étiquette introuvable")
    return tag


async def _get_article_or_404(
    article_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Article:
    article = await db.scalar(
        select(Article).where(
            Article.id == article_id, Article.establishment_id == establishment_id
        )
    )
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actualité introuvable")
    return article


async def _get_attachment_or_404(
    article_id: uuid.UUID, attachment_id: uuid.UUID, db: AsyncSession
) -> tuple[ArticleAttachment, Path]:
    attachment = await db.scalar(
        select(ArticleAttachment).where(
            ArticleAttachment.id == attachment_id, ArticleAttachment.article_id == article_id
        )
    )
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Média introuvable")
    return attachment, storage.resolve_path(attachment.storage_key)


async def _attachments_for_article(
    article_id: uuid.UUID, db: AsyncSession
) -> list[ArticleAttachment]:
    result = await db.execute(
        select(ArticleAttachment)
        .where(ArticleAttachment.article_id == article_id)
        .order_by(ArticleAttachment.created_at)
    )
    return list(result.scalars().all())


def _user_brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id, first_name=user.first_name, last_name=user.last_name,
        nickname=user.nickname,
    )


def _attachment_response(
    attachment: ArticleAttachment,
    *,
    public: bool,
    establishment_code: str | None = None,
    article_id: uuid.UUID | None = None,
) -> AttachmentResponse:
    if public:
        url = f"/api/v1/public/blog/{establishment_code}/articles/{article_id}/attachments/{attachment.id}"
    else:
        url = f"/api/v1/blog/articles/{attachment.article_id}/attachments/{attachment.id}"
    return AttachmentResponse(
        id=attachment.id, filename=attachment.filename, content_type=attachment.content_type,
        size_bytes=attachment.size_bytes, uploaded_by=_user_brief(attachment.uploaded_by),
        created_at=attachment.created_at, url=url,
    )


def _internal_cover_url(article: Article) -> str | None:
    if not article.cover_storage_key:
        return None
    return f"/api/v1/blog/articles/{article.id}/cover"


def _public_cover_url(establishment_code: str, article: Article) -> str | None:
    if not article.cover_storage_key:
        return None
    return f"/api/v1/public/blog/{establishment_code}/articles/{article.id}/cover"


def _to_list_item(article: Article) -> ArticleListItem:
    return ArticleListItem(
        id=article.id, title=article.title, status=article.status,
        tag=TagBrief(id=article.tag.id, name=article.tag.name) if article.tag else None,
        cover_url=_internal_cover_url(article),
        is_active=article.is_active, published_at=article.published_at,
        created_at=article.created_at, updated_at=article.updated_at,
    )


async def _to_response(article: Article, db: AsyncSession) -> ArticleResponse:
    item = _to_list_item(article)
    attachments = await _attachments_for_article(article.id, db)
    return ArticleResponse(
        **item.model_dump(),
        establishment_id=article.establishment_id,
        content=article.content,
        created_by=_user_brief(article.created_by),
        updated_by=_user_brief(article.updated_by) if article.updated_by else None,
        attachments=[_attachment_response(a, public=False) for a in attachments],
    )
