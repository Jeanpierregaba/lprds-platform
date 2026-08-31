import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Brèves (pour les réponses imbriquées) ───────────────────────
class EducatriceBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:         uuid.UUID
    matricule:  str | None
    nickname:   str | None
    first_name: str
    last_name:  str


class ChildBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:          uuid.UUID
    matricule:   str
    last_name:   str
    first_names: str


# ── Département ──────────────────────────────────────────────────
class DepartmentCreateRequest(BaseModel):
    name:        str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)


class DepartmentUpdateRequest(BaseModel):
    name:        str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)
    is_active:   bool | None = None


class DepartmentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:               uuid.UUID
    establishment_id: uuid.UUID
    name:             str
    description:      str | None
    is_active:        bool
    created_at:       datetime
    updated_at:       datetime


# ── Section ──────────────────────────────────────────────────────
class SectionCreateRequest(BaseModel):
    department_id: uuid.UUID
    name:          str = Field(min_length=1, max_length=100)
    description:   str | None = Field(default=None, max_length=300)


class SectionUpdateRequest(BaseModel):
    name:        str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)
    is_active:   bool | None = None


class SectionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:               uuid.UUID
    establishment_id: uuid.UUID
    department_id:    uuid.UUID
    name:             str
    description:      str | None
    is_active:        bool
    created_at:       datetime
    updated_at:       datetime


# ── Groupe ───────────────────────────────────────────────────────
class GroupCreateRequest(BaseModel):
    section_id:    uuid.UUID
    educatrice_id: uuid.UUID
    # Optionnel : par défaut le surnom de l'educatrice assignée.
    name:          str | None = Field(default=None, min_length=1, max_length=100)
    # Enfants à assigner (optionnel) — doivent être de la même section.
    child_ids:     list[uuid.UUID] = []


class GroupUpdateRequest(BaseModel):
    name:          str | None = Field(default=None, min_length=1, max_length=100)
    educatrice_id: uuid.UUID | None = None
    is_active:     bool | None = None


class GroupResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:               uuid.UUID
    establishment_id: uuid.UUID
    section_id:       uuid.UUID
    name:             str
    is_active:        bool
    educatrice:       EducatriceBrief
    children:         list[ChildBrief]
    created_at:       datetime
    updated_at:       datetime
