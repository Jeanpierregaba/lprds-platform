import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class UserBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:         uuid.UUID
    first_name: str
    last_name:  str
    nickname:   str | None = None


# ── Pièces jointes ─────────────────────────────────────────────
class AttachmentResponse(BaseModel):
    id:            uuid.UUID
    filename:      str
    content_type:  str
    size_bytes:    int
    uploaded_by:   UserBrief
    created_at:    datetime
    # Chemin de téléchargement authentifié — jamais une URL de stockage brute
    # (le fichier n'est servi qu'après vérification d'accès, cf. router).
    url:           str


# ── Diffusions (announcements) ────────────────────────────────────
class AnnouncementCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body:  str = Field(min_length=1)


class AnnouncementUpdateRequest(BaseModel):
    title:     str | None = Field(default=None, min_length=1, max_length=200)
    body:      str | None = Field(default=None, min_length=1)
    is_active: bool | None = None


class AnnouncementResponse(BaseModel):
    id:               uuid.UUID
    establishment_id: uuid.UUID
    title:            str
    body:             str
    is_active:        bool
    created_by:       UserBrief
    created_at:       datetime
    updated_at:       datetime
    # Présent seulement dans le contexte pertinent : vue admin → compteur de
    # lecture ; vue parent → statut de lecture personnel. Jamais les deux.
    read_count:    int | None = None
    total_parents: int | None = None
    is_read:       bool | None = None
    attachments:   list[AttachmentResponse] = []


class AnnouncementListResponse(BaseModel):
    total: int
    items: list[AnnouncementResponse]


# ── Conversations & messages ──────────────────────────────────────
class MessageCreateRequest(BaseModel):
    body: str = Field(min_length=1)


class MessageResponse(BaseModel):
    id:              uuid.UUID
    conversation_id: uuid.UUID
    sender:          UserBrief
    sender_role:     str
    body:            str
    read_at:         datetime | None
    created_at:      datetime
    attachments:     list[AttachmentResponse] = []


class MessageListResponse(BaseModel):
    total: int
    items: list[MessageResponse]


class ConversationResponse(BaseModel):
    id:               uuid.UUID
    establishment_id: uuid.UUID
    parent:            UserBrief
    last_message_at:   datetime | None
    unread_count:       int
    created_at:         datetime


class ConversationListResponse(BaseModel):
    total: int
    items: list[ConversationResponse]
