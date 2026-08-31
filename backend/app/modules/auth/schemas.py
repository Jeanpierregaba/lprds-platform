from datetime import datetime
from typing import Annotated
import uuid
from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator
from app.modules.auth.models import UserRole


# ── Politique de mot de passe (partagée par tous les modules) ───
def validate_password_strength(v: str) -> str:
    errors = []
    if not any(c.isupper() for c in v):
        errors.append("une majuscule")
    if not any(c.isdigit() for c in v):
        errors.append("un chiffre")
    if errors:
        raise ValueError(
            f"Le mot de passe doit contenir : {', '.join(errors)}"
        )
    return v


StrongPassword = Annotated[
    str, Field(min_length=8), AfterValidator(validate_password_strength)
]

# ── Login ───────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    must_change_pwd: bool


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    # Optionnel : sans lui, seul le token d'accès courant est révoqué
    refresh_token: str | None = None

# ── Création d'utilisateur ──────────────────────────────────────
# Les règles d'autorisation (qui peut créer quel rôle) sont vérifiées
# dans le service — cf. _check_creation_permissions.
class UserCreateRequest(BaseModel):
    email:      EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name:  str = Field(min_length=1, max_length=100)
    phone:      str | None = Field(default=None, max_length=20)
    role:       UserRole
    establishment_id: uuid.UUID | None = None

# ── Réponse utilisateur (jamais le mot de passe) ───────────────
class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:               uuid.UUID
    email:            str
    first_name:       str
    last_name:        str
    phone:            str | None
    role:             UserRole
    establishment_id: uuid.UUID | None
    is_active:        bool
    must_change_pwd:  bool
    created_at:       datetime
    last_login_at:    datetime | None

# ── Reset de mot de passe ──────────────────────────────────────
class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token:        str
    new_password: StrongPassword

# ── Changement de mot de passe (1er login) ─────────────────────
class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: StrongPassword
