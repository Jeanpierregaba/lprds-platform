import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import media, storage
from app.core.config import settings
from app.core.i18n import DEFAULT_LOCALE, Locale, t
from app.core.translation import (
    TranslationUnavailable,
    remember_correction,
    translate_texts,
)
from app.modules.auth.models import User
from app.modules.blog.models import (
    Article,
    ArticleAttachment,
    ArticleStatus,
    TranslationStatus,
    BlogGalleryCategory,
    BlogGalleryPhoto,
    BlogTag,
)
from app.modules.blog.schemas import (
    ArticleCreateRequest,
    ArticleTranslationRequest,
    ArticleListItem,
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
    PublicArticleDetail,
    PublicArticleListItem,
    PublicArticleListResponse,
    PublicGalleryListResponse,
    PublicGalleryPhoto,
    TagBrief,
    TagCreateRequest,
    TagListResponse,
    TagResponse,
    TagUpdateRequest,
    UserBrief,
)
from app.modules.establishments.models import Establishment

logger = logging.getLogger(__name__)

_COVER_SUBFOLDER = "blog/covers"
_MEDIA_SUBFOLDER = "blog/media"
_GALLERY_SUBFOLDER = "blog/gallery"


# ── Traduction automatique de l'article ──────────────────────────
async def translate_article(article: Article, db: AsyncSession) -> None:
    """Remplit la version anglaise — best-effort, jamais bloquant.

    Publique (et non préfixée d'un souligné) parce qu'elle a un second
    appelant : la tâche de reprise `blog/tasks.py`, qui rattrape les articles
    laissés en `failed` par un incident passager.

    N'agit que si le statut le permet : une traduction `manual` (corrigée par
    un humain) n'est jamais réécrite, c'est la règle centrale du module.
    Un échec pose `failed` et s'arrête là ; l'article reste publiable et
    consultable en français, et l'UI propose « Retraduire ».
    """
    if article.translation_status == str(TranslationStatus.MANUAL):
        return
    try:
        title_en, content_en = await translate_texts(
            [article.title, article.content], db
        )
    except TranslationUnavailable as exc:
        # `info` et non `exception` : « traduction désactivée » est le cas
        # nominal en dev et en test, pas un incident à remonter en pile.
        logger.info("Traduction de l'article %s non aboutie : %s", article.id, exc)
        article.translation_status = str(TranslationStatus.FAILED)
        return
    article.title_en = title_en
    article.content_en = content_en
    article.translation_status = str(TranslationStatus.AUTO)


async def retranslate_article(
    article_id: uuid.UUID, establishment_id: uuid.UUID, editor: User, db: AsyncSession
) -> ArticleResponse:
    """Relance explicite depuis l'UI — la seule façon de repasser sur une
    traduction `manual` : c'est un geste humain qui redonne la main à la
    machine, jamais une conséquence d'un simple PATCH."""
    article = await _get_article_or_404(article_id, establishment_id, db)
    article.translation_status = str(TranslationStatus.PENDING)
    await translate_article(article, db)
    article.updated_by_id = editor.id
    await db.flush()
    await db.refresh(article)
    return await _to_response(article, db)


async def set_article_translation(
    article_id: uuid.UUID,
    payload: ArticleTranslationRequest,
    establishment_id: uuid.UUID,
    editor: User,
    db: AsyncSession,
) -> ArticleResponse:
    """Correction manuelle — verrouille la version anglaise en `manual`."""
    article = await _get_article_or_404(article_id, establishment_id, db)
    if not article.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.blog.article_deleted"),
        )
    article.title_en = payload.title_en
    article.content_en = payload.content_en
    article.translation_status = str(TranslationStatus.MANUAL)
    article.updated_by_id = editor.id
    await db.flush()
    await db.refresh(article)
    return await _to_response(article, db)


# ── Vocabulaires libres : étiquettes et catégories ───────────────
async def translate_label(name: str, db: AsyncSession) -> str | None:
    """Nom anglais d'une étiquette ou d'une catégorie — best-effort.

    Ces deux vocabulaires sont créés librement par l'établissement, et ils
    s'affichent **sur le site vitrine** : les pastilles de filtre de
    `/en/actualites` et `/en/galerie`. Les laisser en français était le trou le
    plus voyant du bilinguisme, sur la surface la plus exposée.

    Un échec rend `None` : la lecture publique retombe sur le français, comme
    partout. Jamais d'exception — créer une étiquette ne doit pas dépendre d'un
    service de traduction.

    Publique (et non préfixée d'un souligné) parce qu'elle a un second
    appelant : la tâche de reprise `blog/tasks.py`, qui rattrape aussi bien un
    échec passager que les lignes antérieures à la colonne `name_en`.

    Ces noms sont courts et se répètent beaucoup (« Activités », « Événement »,
    « Repas » reviennent d'un établissement à l'autre) : la mémoire de
    traduction les sert donc presque toujours sans appel au modèle.
    """
    try:
        [translated] = await translate_texts([name], db)
    except TranslationUnavailable as exc:
        logger.info("Traduction du libellé « %s » non aboutie : %s", name, exc)
        return None
    return translated[:50] if translated and translated.strip() else None


async def _apply_name_translation(
    entity, name: str, name_en: str | None, db: AsyncSession
) -> None:
    """Pose le nom français et sa version anglaise.

    Un `name_en` fourni explicitement est une **correction humaine** : il est
    gravé dans la mémoire de traduction, donc restitué à la prochaine
    traduction du même texte — y compris pour un autre établissement. C'est ce
    qui remplace, ici, le statut `manual` des articles : pour un libellé de
    deux mots qui revient partout, la mémoire est le bon support.
    """
    renamed = entity.name != name
    entity.name = name
    if name_en is not None:
        entity.name_en = name_en
        await remember_correction(db, name, name_en)
    elif renamed or entity.name_en is None:
        entity.name_en = await translate_label(name, db)


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
            detail=t("errors.blog.tag_exists"),
        )
    tag = BlogTag(establishment_id=establishment_id, name=payload.name)
    await _apply_name_translation(tag, payload.name, payload.name_en, db)
    db.add(tag)
    await db.flush()
    await db.refresh(tag)
    return _tag_response(tag)


async def list_tags(establishment_id: uuid.UUID, db: AsyncSession) -> TagListResponse:
    result = await db.execute(
        select(BlogTag)
        .where(BlogTag.establishment_id == establishment_id)
        .order_by(BlogTag.name)
    )
    return TagListResponse(items=[_tag_response(tag) for tag in result.scalars().all()])


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
            detail=t("errors.blog.tag_exists"),
        )
    await _apply_name_translation(tag, payload.name, payload.name_en, db)
    await db.flush()
    return _tag_response(tag)


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
            detail=t("errors.blog.article_deleted"),
        )
    changes = payload.model_dump(exclude_unset=True)
    if "tag_id" in changes and changes["tag_id"]:
        await _get_tag_or_404(changes["tag_id"], establishment_id, db)
    text_changed = any(
        field in changes and changes[field] != getattr(article, field)
        for field in ("title", "content")
    )
    for field, value in changes.items():
        setattr(article, field, value)
    article.updated_by_id = editor.id
    # Retraduction seulement si le texte français a réellement changé ET que
    # l'article est déjà public : retoucher l'étiquette d'un brouillon ne
    # déclenche pas d'appel. `translate_article` refuse de lui-même de
    # toucher une traduction `manual`.
    if text_changed and article.status == str(ArticleStatus.PUBLISHED):
        await translate_article(article, db)
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
            detail=t("errors.blog.article_deleted"),
        )
    if article.status == str(ArticleStatus.PUBLISHED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=t("errors.blog.already_published")
        )
    if not article.cover_storage_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.blog.cover_required"),
        )
    if not article.tag_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.blog.tag_required"),
        )
    article.status = str(ArticleStatus.PUBLISHED)
    article.published_at = datetime.now(timezone.utc)
    article.updated_by_id = editor.id
    # Traduit à la publication, pas à la création : un brouillon est encore
    # en train de bouger, le traduire à chaque frappe serait du gaspillage.
    await translate_article(article, db)
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
            detail=t("errors.blog.article_deleted"),
        )

    # L'image à la une est l'illustration du site vitrine : images seules
    # (`images_only`), et une photo trop lourde est allégée plutôt que refusée —
    # c'est la page publique qui gagne à ne pas servir 40 Mo.
    accepted = await media.accept_upload(
        file,
        await file.read(),
        max_image_mb=settings.blog_max_attachment_mb,
        max_video_mb=settings.blog_max_attachment_mb,
        allow_video=False,
        images_only=True,
    )
    content_bytes, content_type = accepted.content, accepted.content_type

    old_key = article.cover_storage_key
    new_key = await storage.save_file(_COVER_SUBFOLDER, accepted.filename, content_bytes)
    if old_key:
        await storage.delete_file(old_key)

    article.cover_filename = accepted.filename
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
            status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.blog.no_cover")
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
            detail=t("errors.blog.article_deleted"),
        )

    accepted = await media.accept_upload(
        file,
        await file.read(),
        max_image_mb=settings.blog_max_attachment_mb,
        max_video_mb=settings.blog_max_attachment_mb,
        allow_video=True,
    )

    storage_key = await storage.save_file(_MEDIA_SUBFOLDER, accepted.filename, accepted.content)
    attachment = ArticleAttachment(
        article_id=article.id,
        uploaded_by_id=editor.id,
        filename=accepted.filename,
        content_type=accepted.content_type,
        size_bytes=len(accepted.content),
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
            status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.blog.media_not_found")
        )
    await storage.delete_file(attachment.storage_key)
    await db.delete(attachment)
    await db.flush()


async def get_article_attachment_for_staff(
    article_id: uuid.UUID, attachment_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> tuple[ArticleAttachment, Path]:
    await _get_article_or_404(article_id, establishment_id, db)
    return await _get_attachment_or_404(article_id, attachment_id, db)


# ── Galerie du site vitrine ──────────────────────────────────────
async def create_gallery_category(
    payload: GalleryCategoryCreateRequest, establishment_id: uuid.UUID, db: AsyncSession
) -> GalleryCategoryResponse:
    """Comme create_tag : nom libre unique par établissement (409 sinon)."""
    existing = await db.scalar(
        select(BlogGalleryCategory.id).where(
            BlogGalleryCategory.establishment_id == establishment_id,
            BlogGalleryCategory.name == payload.name,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.blog.category_exists"),
        )
    category = BlogGalleryCategory(establishment_id=establishment_id, name=payload.name)
    await _apply_name_translation(category, payload.name, payload.name_en, db)
    db.add(category)
    await db.flush()
    await db.refresh(category)
    return _gallery_category_response(category)


async def list_gallery_categories(
    establishment_id: uuid.UUID, db: AsyncSession
) -> GalleryCategoryListResponse:
    result = await db.execute(
        select(BlogGalleryCategory)
        .where(BlogGalleryCategory.establishment_id == establishment_id)
        .order_by(BlogGalleryCategory.name)
    )
    return GalleryCategoryListResponse(items=[
        _gallery_category_response(c) for c in result.scalars().all()
    ])


async def update_gallery_category(
    category_id: uuid.UUID, payload: GalleryCategoryUpdateRequest,
    establishment_id: uuid.UUID, db: AsyncSession,
) -> GalleryCategoryResponse:
    category = await _get_gallery_category_or_404(category_id, establishment_id, db)
    existing = await db.scalar(
        select(BlogGalleryCategory.id).where(
            BlogGalleryCategory.establishment_id == establishment_id,
            BlogGalleryCategory.name == payload.name,
            BlogGalleryCategory.id != category_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.blog.category_exists"),
        )
    await _apply_name_translation(category, payload.name, payload.name_en, db)
    await db.flush()
    return _gallery_category_response(category)


async def delete_gallery_category(
    category_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> None:
    """Suppression définitive — les photos restent publiées mais passent « sans
    catégorie » (FK ON DELETE SET NULL), comme les articles sans étiquette."""
    category = await _get_gallery_category_or_404(category_id, establishment_id, db)
    await db.delete(category)
    await db.flush()


async def _get_gallery_category_or_404(
    category_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> BlogGalleryCategory:
    category = await db.scalar(
        select(BlogGalleryCategory).where(
            BlogGalleryCategory.id == category_id,
            BlogGalleryCategory.establishment_id == establishment_id,
        )
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.blog.category_not_found"))
    return category


def _localized_name(entity, locale: Locale) -> str:
    """Nom à afficher au public. Repli français si l'anglais manque.

    Jamais utilisé côté gestion : l'admin édite le français, et voit l'anglais
    dans un champ à part (`name_en`) pour pouvoir le corriger.
    """
    if locale is Locale.EN and entity.name_en:
        return entity.name_en
    return entity.name


def _tag_response(tag: BlogTag) -> TagResponse:
    return TagResponse(
        id=tag.id, name=tag.name, name_en=tag.name_en, created_at=tag.created_at
    )


def _gallery_category_response(category: BlogGalleryCategory) -> GalleryCategoryResponse:
    return GalleryCategoryResponse(
        id=category.id, name=category.name, name_en=category.name_en,
        created_at=category.created_at,
    )


def _tag_brief(tag: BlogTag | None, locale: Locale = DEFAULT_LOCALE) -> TagBrief | None:
    if tag is None:
        return None
    return TagBrief(id=tag.id, name=_localized_name(tag, locale))


def _category_brief(
    category: BlogGalleryCategory | None, locale: Locale = DEFAULT_LOCALE
) -> TagBrief | None:
    if category is None:
        return None
    return TagBrief(id=category.id, name=_localized_name(category, locale))


async def create_gallery_photo(
    establishment_id: uuid.UUID,
    editor: User,
    category_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession,
) -> GalleryPhotoListItem:
    """Upload = publication immédiate (pas de workflow). La catégorie doit
    appartenir à l'établissement (404 sinon)."""
    category = await _get_gallery_category_or_404(category_id, establishment_id, db)
    accepted = await media.accept_upload(
        file,
        await file.read(),
        max_image_mb=settings.blog_max_attachment_mb,
        max_video_mb=settings.blog_max_attachment_mb,
        allow_video=False,
        images_only=True,
    )

    storage_key = await storage.save_file(_GALLERY_SUBFOLDER, accepted.filename, accepted.content)
    photo = BlogGalleryPhoto(
        establishment_id=establishment_id,
        category_id=category.id,
        filename=accepted.filename,
        content_type=accepted.content_type,
        size_bytes=len(accepted.content),
        storage_key=storage_key,
        uploaded_by_id=editor.id,
    )
    db.add(photo)
    await db.flush()
    await db.refresh(photo)
    return _gallery_item(photo)


async def list_gallery_photos(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    category_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
) -> GalleryPhotoListResponse:
    filters = [BlogGalleryPhoto.establishment_id == establishment_id]
    if category_id:
        filters.append(BlogGalleryPhoto.category_id == category_id)

    total = await db.scalar(select(func.count()).select_from(BlogGalleryPhoto).where(*filters))
    result = await db.execute(
        select(BlogGalleryPhoto)
        .where(*filters)
        .order_by(BlogGalleryPhoto.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = [_gallery_item(p) for p in result.scalars().all()]
    return GalleryPhotoListResponse(total=total or 0, items=items)


async def get_gallery_photo_for_staff(
    photo_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> tuple[BlogGalleryPhoto, Path]:
    photo = await _get_gallery_photo_or_404(photo_id, establishment_id, db)
    return photo, storage.resolve_path(photo.storage_key)


async def delete_gallery_photo(
    photo_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> None:
    """Suppression définitive — la photo disparaît du site public dès le DELETE
    (rien à désactiver, contrairement aux articles soft-deleted)."""
    photo = await _get_gallery_photo_or_404(photo_id, establishment_id, db)
    await storage.delete_file(photo.storage_key)
    await db.delete(photo)
    await db.flush()


async def list_public_gallery_photos(
    establishment_code: str,
    db: AsyncSession,
    *,
    category_id: uuid.UUID | None = None,
    locale: Locale = DEFAULT_LOCALE,
    skip: int = 0,
    limit: int = 50,
) -> PublicGalleryListResponse:
    establishment = await get_public_establishment_or_404(establishment_code, db)
    filters = [BlogGalleryPhoto.establishment_id == establishment.id]
    if category_id:
        filters.append(BlogGalleryPhoto.category_id == category_id)

    total = await db.scalar(select(func.count()).select_from(BlogGalleryPhoto).where(*filters))
    result = await db.execute(
        select(BlogGalleryPhoto)
        .where(*filters)
        .order_by(BlogGalleryPhoto.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = [
        PublicGalleryPhoto(
            id=p.id, category=_category_brief(p.category, locale), content_type=p.content_type,
            size_bytes=p.size_bytes, created_at=p.created_at,
            url=_public_gallery_url(establishment_code, p.id),
        )
        for p in result.scalars().all()
    ]
    return PublicGalleryListResponse(total=total or 0, items=items)


async def list_public_gallery_categories(
    establishment_code: str, db: AsyncSession, locale: Locale = DEFAULT_LOCALE
) -> GalleryCategoryListResponse:
    """Catégories pour les pastilles de filtre du site vitrine (public).

    `name` porte le libellé DANS LA LANGUE DEMANDÉE — le site vitrine l'affiche
    tel quel. `name_en` reste exposé pour la gestion, pas pour la vitrine.
    """
    establishment = await get_public_establishment_or_404(establishment_code, db)
    result = await db.execute(
        select(BlogGalleryCategory)
        .where(BlogGalleryCategory.establishment_id == establishment.id)
        .order_by(BlogGalleryCategory.name)
    )
    return GalleryCategoryListResponse(items=[
        GalleryCategoryResponse(
            id=c.id, name=_localized_name(c, locale), name_en=c.name_en,
            created_at=c.created_at,
        )
        for c in result.scalars().all()
    ])


async def get_public_gallery_photo(
    establishment_code: str, photo_id: uuid.UUID, db: AsyncSession
) -> tuple[BlogGalleryPhoto, Path]:
    establishment = await get_public_establishment_or_404(establishment_code, db)
    photo = await db.scalar(
        select(BlogGalleryPhoto).where(
            BlogGalleryPhoto.id == photo_id,
            BlogGalleryPhoto.establishment_id == establishment.id,
        )
    )
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.blog.photo_not_found"))
    return photo, storage.resolve_path(photo.storage_key)


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.establishment_not_found"))
    return establishment


async def list_public_articles(
    establishment_code: str,
    db: AsyncSession,
    *,
    tag_id: uuid.UUID | None = None,
    locale: Locale = DEFAULT_LOCALE,
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
    items = []
    for a in result.scalars().all():
        title, _content, served = _public_text(a, locale)
        items.append(PublicArticleListItem(
            id=a.id, title=title,
            tag=_tag_brief(a.tag, locale),
            cover_url=_public_cover_url(establishment_code, a),
            published_at=a.published_at,
            locale=served,
        ))
    return PublicArticleListResponse(total=total or 0, items=items)


async def get_public_article(
    establishment_code: str,
    article_id: uuid.UUID,
    db: AsyncSession,
    *,
    locale: Locale = DEFAULT_LOCALE,
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.blog.article_not_found"))
    attachments = await _attachments_for_article(article.id, db)
    title, content, served = _public_text(article, locale)
    return PublicArticleDetail(
        id=article.id, title=title, content=content, locale=served,
        tag=_tag_brief(article.tag, locale),
        cover_url=_public_cover_url(establishment_code, article),
        published_at=article.published_at,
        attachments=[
            _attachment_response(a, public=True, establishment_code=establishment_code, article_id=article.id)
            for a in attachments
        ],
    )


async def list_public_tags(
    establishment_code: str, db: AsyncSession, locale: Locale = DEFAULT_LOCALE
) -> TagListResponse:
    """Étiquettes des pastilles de filtre du site vitrine (public).

    Comme pour les catégories, `name` est déjà dans la langue demandée.
    """
    establishment = await get_public_establishment_or_404(establishment_code, db)
    result = await db.execute(
        select(BlogTag)
        .where(BlogTag.establishment_id == establishment.id)
        .order_by(BlogTag.name)
    )
    return TagListResponse(items=[
        TagResponse(
            id=tag.id, name=_localized_name(tag, locale), name_en=tag.name_en,
            created_at=tag.created_at,
        )
        for tag in result.scalars().all()
    ])


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.not_found"))
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.not_found"))
    return await _get_attachment_or_404(article.id, attachment_id, db)


# ── Helpers privés ──────────────────────────────────────────────
async def _get_tag_or_404(tag_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession) -> BlogTag:
    tag = await db.scalar(
        select(BlogTag).where(BlogTag.id == tag_id, BlogTag.establishment_id == establishment_id)
    )
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.blog.tag_not_found"))
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.blog.article_not_found"))
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.blog.media_not_found"))
    return attachment, storage.resolve_path(attachment.storage_key)


async def _get_gallery_photo_or_404(
    photo_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> BlogGalleryPhoto:
    photo = await db.scalar(
        select(BlogGalleryPhoto).where(
            BlogGalleryPhoto.id == photo_id,
            BlogGalleryPhoto.establishment_id == establishment_id,
        )
    )
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.blog.photo_not_found"))
    return photo


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


def _internal_gallery_url(photo_id: uuid.UUID) -> str:
    return f"/api/v1/blog/gallery/{photo_id}/image"


def _public_gallery_url(establishment_code: str, photo_id: uuid.UUID) -> str:
    return f"/api/v1/public/blog/{establishment_code}/gallery/{photo_id}/image"


def _gallery_item(photo: BlogGalleryPhoto) -> GalleryPhotoListItem:
    return GalleryPhotoListItem(
        id=photo.id, category=_category_brief(photo.category), filename=photo.filename,
        content_type=photo.content_type, size_bytes=photo.size_bytes,
        uploaded_by=_user_brief(photo.uploaded_by), created_at=photo.created_at,
        url=_internal_gallery_url(photo.id),
    )


def _to_list_item(article: Article) -> ArticleListItem:
    return ArticleListItem(
        id=article.id, title=article.title, status=article.status,
        # Vue de GESTION : le français, que le rédacteur édite.
        tag=_tag_brief(article.tag),
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
        title_en=article.title_en,
        content_en=article.content_en,
        source_locale=article.source_locale,
        translation_status=article.translation_status,
    )


def _public_text(article: Article, locale: Locale) -> tuple[str, str, str]:
    """(titre, contenu, langue réellement servie) pour le site vitrine.

    Repli FR explicite quand la version anglaise manque (jamais traduite,
    traduction en échec, ou article publié avant l'arrivée de la
    fonctionnalité) : mieux vaut du français lisible qu'une page vide, et le
    `locale` renvoyé permet au frontend de le signaler honnêtement.
    """
    if locale is Locale.EN and article.title_en and article.content_en:
        return article.title_en, article.content_en, str(Locale.EN)
    return article.title, article.content, str(DEFAULT_LOCALE)
