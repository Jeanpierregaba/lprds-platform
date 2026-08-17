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


# ── Consultation publique (site vitrine, sans authentification) ──
class PublicArticleListItem(BaseModel):
    id:           uuid.UUID
    title:        str
    tag:          TagBrief | None
    cover_url:    str | None
    published_at: datetime | None


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
