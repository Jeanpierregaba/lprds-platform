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
    # Départements ciblés : UNE liste cochée AVANT l'envoi (1 à N). Vide =
    # broadcast à tous les parents de l'établissement.
    department_ids: list[uuid.UUID] = []


class AnnouncementUpdateRequest(BaseModel):
    title:     str | None = Field(default=None, min_length=1, max_length=200)
    body:      str | None = Field(default=None, min_length=1)
    is_active: bool | None = None
    # None = périmètre inchangé ; liste fournie (éventuellement vide) =
    # REMPLACE le ciblage (vide = retour au broadcast).
    department_ids: list[uuid.UUID] | None = None


class AnnouncementResponse(BaseModel):
    id:               uuid.UUID
    establishment_id: uuid.UUID
    title:            str
    body:             str
    is_active:        bool
    # [] = broadcast (tous les parents), sinon départements ciblés.
    department_ids:   list[uuid.UUID] = []
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
class ConversationStartRequest(BaseModel):
    # Le parent avec qui l'admin lance une conversation privée.
    parent_id: uuid.UUID
    # Message d'ouverture optionnel — s'il est fourni, l'admin envoie un
    # premier message au parent dans le même appel.
    body: str | None = Field(default=None, min_length=1)


class MessageCreateRequest(BaseModel):
    # Corps vide autorisé : un message peut être purement média (photo/vidéo
    # envoyée comme un message depuis la barre de saisie). L'UI n'envoie jamais
    # un message à la fois vide ET sans pièce jointe (bouton désactivé).
    body: str = Field(default="", max_length=5000)


class MessageUpdateRequest(BaseModel):
    model_config = {"str_strip_whitespace": True}

    body: str = Field(max_length=5000)


class MessageResponse(BaseModel):
    id:              uuid.UUID
    conversation_id: uuid.UUID
    sender:          UserBrief
    sender_role:     str
    body:            str | None
    edited_at:       datetime | None = None
    is_deleted:      bool = False
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
