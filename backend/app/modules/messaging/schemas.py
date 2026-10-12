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
    # Exige une signature des parents destinataires. Faux par défaut.
    requires_signature: bool = False


class AnnouncementUpdateRequest(BaseModel):
    title:     str | None = Field(default=None, min_length=1, max_length=200)
    body:      str | None = Field(default=None, min_length=1)
    # Version anglaise imposée par l'admin. Absente, elle est retraduite dès
    # que le texte FRANÇAIS change — et conservée tant qu'il ne bouge pas :
    # même règle que les créneaux de menu, sans colonne de statut à tenir.
    title_en:  str | None = Field(default=None, min_length=1, max_length=200)
    body_en:   str | None = Field(default=None, min_length=1)
    is_active: bool | None = None
    # None = périmètre inchangé ; liste fournie (éventuellement vide) =
    # REMPLACE le ciblage (vide = retour au broadcast).
    department_ids: list[uuid.UUID] | None = None
    # ⚠️ Repasser à `false` cesse de DEMANDER la signature ; les signatures
    # déjà recueillies ne sont jamais effacées (cf. service).
    requires_signature: bool | None = None


class AnnouncementResponse(BaseModel):
    id:               uuid.UUID
    establishment_id: uuid.UUID
    # Vue de GESTION : le français, que l'admin a écrit et édite.
    # Vue PARENT : la langue du lecteur, repli français champ par champ.
    title:            str
    body:             str
    # Exposé pour la gestion uniquement — jamais ce que le parent affiche.
    title_en:         str | None = None
    body_en:          str | None = None
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
    # Signature — exposé aux deux côtés, parce que le drapeau gouverne
    # l'affichage chez l'un comme chez l'autre.
    requires_signature: bool = False
    # Vue admin : combien de parents de l'audience ont signé.
    signature_count: int | None = None
    # Vue parent : SA signature. `signed_at` porte la date affichée en
    # confirmation (« signé le … ») — sans elle, le parent n'a aucune trace
    # de ce qu'il a attesté.
    is_signed:  bool | None = None
    signed_at:  datetime | None = None


class AnnouncementListResponse(BaseModel):
    total: int
    items: list[AnnouncementResponse]


class AnnouncementSignRequest(BaseModel):
    """Le parent recopie son nom : c'est ce qui distingue l'attestation de
    l'accusé de lecture, qu'un simple affichage suffit à poser."""

    signed_name: str = Field(min_length=2, max_length=200)


class AnnouncementRecipient(BaseModel):
    """Un parent de l'audience, et ce qu'il a fait de la diffusion.

    Trois états se lisent dans les deux dates : rien (non lu), `read_at`
    seul (lu), `signed_at` renseigné (signé). L'admin a besoin des trois —
    celui qui l'intéresse le plus étant justement le premier, qu'une liste
    des seuls lecteurs ne montrerait pas.
    """

    parent:       UserBrief
    email:        str
    read_at:      datetime | None = None
    signed_at:    datetime | None = None
    # Le nom TEL QUE TAPÉ par le parent, à côté de celui du compte : un écart
    # est exposé, jamais refusé (cf. modèle).
    signed_name:  str | None = None


class AnnouncementRecipientListResponse(BaseModel):
    total:              int
    read_count:         int
    signature_count:    int
    requires_signature: bool
    items:              list[AnnouncementRecipient]


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
