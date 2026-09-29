import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, model_validator
from app.core.i18n import t


# ── Parents / Tuteurs ───────────────────────────────────────────
class GuardianRequest(BaseModel):
    last_name:   str = Field(min_length=1, max_length=100)
    first_names: str = Field(min_length=1, max_length=200)
    phone:       str = Field(min_length=1, max_length=20)
    email:       EmailStr | None = None


class GuardianResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:          uuid.UUID
    last_name:   str
    first_names: str
    phone:       str
    email:       str | None


# ── Personnes autorisées ────────────────────────────────────────
class AuthorizedPersonRequest(BaseModel):
    last_name:   str = Field(min_length=1, max_length=100)
    first_names: str = Field(min_length=1, max_length=200)
    phone:       str = Field(min_length=1, max_length=20)


class AuthorizedPersonResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:          uuid.UUID
    last_name:   str
    first_names: str
    phone:       str


# ── Documents du dossier d'inscription ─────────────────────────
class ChildAttachmentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:           uuid.UUID
    filename:     str
    content_type: str
    size_bytes:   int
    created_at:   datetime
    # Chemin de téléchargement authentifié — jamais servi en statique.
    url:          str


# ── Enfant ──────────────────────────────────────────────────────
class ChildCreateRequest(BaseModel):
    # Informations de base
    last_name:         str = Field(min_length=1, max_length=100)
    first_names:       str = Field(min_length=1, max_length=200)
    birth_date:        date
    admission_date:    date
    residence_address: str = Field(min_length=1, max_length=500)
    department_id:     uuid.UUID | None = None
    section_id:        uuid.UUID | None = None

    # Informations comportementales
    behavioral_notes: str | None = None
    preferences:      str | None = None

    # Informations médicales
    medical_notes:        str | None = None
    dietary_restrictions: str | None = None
    medications:          str | None = None
    doctor_name:          str | None = Field(default=None, max_length=150)
    doctor_phone:         str | None = Field(default=None, max_length=20)

    guardians:          list[GuardianRequest] = Field(default_factory=list)
    authorized_persons: list[AuthorizedPersonRequest] = []

    @model_validator(mode="after")
    def check_dates(self) -> "ChildCreateRequest":
        if self.birth_date > date.today():
            raise ValueError(t("validation.birth_date_future"))
        if self.admission_date < self.birth_date:
            raise ValueError(t("validation.admission_before_birth"))
        return self


class ChildUpdateRequest(BaseModel):
    last_name:         str | None = Field(default=None, min_length=1, max_length=100)
    first_names:       str | None = Field(default=None, min_length=1, max_length=200)
    birth_date:        date | None = None
    admission_date:    date | None = None
    residence_address: str | None = Field(default=None, min_length=1, max_length=500)
    department_id:     uuid.UUID | None = None
    section_id:        uuid.UUID | None = None

    behavioral_notes: str | None = None
    preferences:      str | None = None

    medical_notes:        str | None = None
    dietary_restrictions: str | None = None
    medications:          str | None = None
    doctor_name:          str | None = Field(default=None, max_length=150)
    doctor_phone:         str | None = Field(default=None, max_length=20)

    # None = inchangé. Une liste fournie REMPLACE l'ensemble existant.
    guardians:          list[GuardianRequest] | None = Field(default=None, min_length=1)
    authorized_persons: list[AuthorizedPersonRequest] | None = None


class ChildStatusRequest(BaseModel):
    is_active: bool


class UnitBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:   uuid.UUID
    name: str


class ChildResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:               uuid.UUID
    matricule:        str
    establishment_id: uuid.UUID

    last_name:         str
    first_names:       str
    birth_date:        date
    admission_date:    date
    residence_address: str
    department:        UnitBrief | None
    section:           UnitBrief | None

    behavioral_notes: str | None
    preferences:      str | None

    medical_notes:        str | None
    dietary_restrictions: str | None
    medications:          str | None
    doctor_name:          str | None
    doctor_phone:         str | None

    is_active:  bool
    created_at: datetime
    updated_at: datetime

    guardians:          list[GuardianResponse]
    authorized_persons: list[AuthorizedPersonResponse]
    documents:          list[ChildAttachmentResponse] = []


class ChildListItem(BaseModel):
    """Vue allégée : pas de données médicales dans les listes."""

    model_config = {"from_attributes": True}

    id:             uuid.UUID
    matricule:      str
    last_name:      str
    first_names:    str
    birth_date:     date
    admission_date: date
    department:     UnitBrief | None
    section:        UnitBrief | None
    is_active:      bool


class ChildListResponse(BaseModel):
    total: int
    items: list[ChildListItem]


# ── Import / export ─────────────────────────────────────────────
class ChildImportRowResult(BaseModel):
    """Une ligne du fichier : créée / mise à jour / rejetée, jamais silencieuse."""

    ligne: int
    matricule: str | None = None
    # Code stable, jamais un libellé : le frontend traduit (cf. claude.md,
    # « la base ne dépend jamais du texte affiché »).
    statut: str  # "created" | "updated" | "rejected"
    avertissements: list[str] = []
    erreur: str | None = None


class ChildImportReportResponse(BaseModel):
    crees: int
    mis_a_jour: int
    rejetees: int
    lignes: list[ChildImportRowResult]
