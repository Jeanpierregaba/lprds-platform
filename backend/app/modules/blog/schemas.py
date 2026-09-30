import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Briques communes ──────────────────────────────────────────────
class UserBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:         uuid.UUID
    first_name: str
    last_name:  str
    nickname:   str | None = None


class TagBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:   uuid.UUID
    name: str


class AttachmentResponse(BaseModel):
    id:           uuid.UUID
    filename:     str
    content_type: str
    size_bytes:   int
    uploaded_by:  UserBrief
    created_at:   datetime
    url:          str


# ── Étiquettes ──────────────────────────────────────────────────
class TagCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class TagUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class TagResponse(BaseModel):
    id:         uuid.UUID
    name:       str
    created_at: datetime


class TagListResponse(BaseModel):
    items: list[TagResponse]


# ── Articles (gestion, authentifié) ───────────────────────────────
class ArticleCreateRequest(BaseModel):
    title:   str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    tag_id:  uuid.UUID | None = None


class ArticleUpdateRequest(BaseModel):
    title:   str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1)
    tag_id:  uuid.UUID | None = None


class ArticleTranslationRequest(BaseModel):
    """Correction manuelle de la version anglaise.

    Écrire ici bascule `translation_status` en `manual` : à partir de là, la
    machine ne réécrit plus rien, même si le texte français change ensuite.
    """

    title_en:   str = Field(min_length=1, max_length=200)
    content_en: str = Field(min_length=1)


class ArticleListItem(BaseModel):
    id:            uuid.UUID
    title:         str
    status:        str
    tag:           TagBrief | None
    cover_url:     str | None
    is_active:     bool
    published_at:  datetime | None
    created_at:    datetime
    updated_at:    datetime


class ArticleListResponse(BaseModel):
    total: int
    items: list[ArticleListItem]


class ArticleResponse(ArticleListItem):
    establishment_id: uuid.UUID
    content:           str
    created_by:        UserBrief
    updated_by:        UserBrief | None
    attachments:        list[AttachmentResponse] = []

    # Vue de GESTION : les deux langues côte à côte, plus l'état de la
    # traduction — c'est l'écran où un rédacteur relit et corrige l'anglais.
    # La vue publique, elle, ne sert qu'UNE langue (cf. PublicArticleDetail).
    title_en:            str | None = None
    content_en:          str | None = None
    source_locale:       str = "fr"
    translation_status:  str


# ── Consultation publique (site vitrine, sans authentification) ──
class PublicArticleListItem(BaseModel):
    """Vue publique — `title` est déjà dans la langue demandée.

    Le site vitrine ne reçoit jamais les deux versions : il afficherait
    forcément l'une des deux, et envoyer l'autre doublerait la charge utile
    d'une page indexée par les moteurs de recherche.
    """

    id:           uuid.UUID
    title:        str
    tag:          TagBrief | None
    cover_url:    str | None
    published_at: datetime | None
    # Langue réellement servie — peut différer de celle demandée quand la
    # traduction manque (repli FR), ce que le frontend signale au visiteur.
    locale:       str = "fr"


class PublicArticleListResponse(BaseModel):
    total: int
    items: list[PublicArticleListItem]


class PublicArticleDetail(BaseModel):
    id:            uuid.UUID
    title:         str
    content:       str
    tag:           TagBrief | None
    cover_url:     str | None
    published_at:  datetime | None
    attachments:   list[AttachmentResponse] = []
    locale:        str = "fr"


# ── Galerie du site vitrine ──────────────────────────────────────
class GalleryCategoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class GalleryCategoryUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class GalleryCategoryResponse(BaseModel):
    id:         uuid.UUID
    name:       str
    created_at: datetime


class GalleryCategoryListResponse(BaseModel):
    items: list[GalleryCategoryResponse]


class GalleryPhotoListItem(BaseModel):
    id:           uuid.UUID
    category:     TagBrief | None
    filename:     str
    content_type: str
    size_bytes:   int
    uploaded_by:  UserBrief
    created_at:   datetime
    url:          str


class GalleryPhotoListResponse(BaseModel):
    total: int
    items: list[GalleryPhotoListItem]


class PublicGalleryPhoto(BaseModel):
    id:           uuid.UUID
    category:     TagBrief | None
    content_type: str
    size_bytes:   int
    created_at:   datetime
    url:          str


class PublicGalleryListResponse(BaseModel):
    total: int
    items: list[PublicGalleryPhoto]
