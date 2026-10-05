import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.modules.auth.schemas import StrongPassword, UserResponse
from app.core.i18n import t

# Code établissement : 2 à 10 caractères alphanumériques, majuscules.
# Sert de préfixe aux matricules des membres — d'où la contrainte stricte.
_CODE_RE = re.compile(r"^[A-Z0-9]{2,10}$")


def _normalize_code(v: str) -> str:
    code = v.strip().upper()
    if not _CODE_RE.match(code):
        raise ValueError(t("validation.establishment_code"))
    return code


# ── Admin créé en même temps que l'établissement ───────────────
class EstablishmentAdminCreate(BaseModel):
    email:      EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name:  str = Field(min_length=1, max_length=100)
    phone:      str | None = Field(default=None, max_length=20)
    password:   StrongPassword


# ── Création d'un établissement ────────────────────────────────
class EstablishmentCreateRequest(BaseModel):
    code:    str = Field(min_length=2, max_length=10)
    name:    str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=500)
    email:   EmailStr
    phone:   str = Field(min_length=1, max_length=20)
    admin:   EstablishmentAdminCreate

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return _normalize_code(v)


# ── Modification d'un établissement ────────────────────────────
class EstablishmentUpdateRequest(BaseModel):
    code:      str | None = Field(default=None, min_length=2, max_length=10)
    name:      str | None = Field(default=None, min_length=1, max_length=200)
    address:   str | None = Field(default=None, min_length=1, max_length=500)
    email:     EmailStr | None = None
    phone:     str | None = Field(default=None, min_length=1, max_length=20)
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str | None) -> str | None:
        return _normalize_code(v) if v is not None else None


# ── Réponses ───────────────────────────────────────────────────
class EstablishmentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:         uuid.UUID
    code:       str
    name:       str
    address:    str
    email:      str
    phone:      str
    is_active:  bool
    created_at: datetime
    updated_at: datetime


class EstablishmentDetailResponse(EstablishmentResponse):
    admins: list[UserResponse] = []


class EstablishmentListResponse(BaseModel):
    total: int
    items: list[EstablishmentResponse]
