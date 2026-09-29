from datetime import datetime
from typing import Annotated, Literal
import uuid
from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator
from app.modules.auth.models import UserRole
from app.core.i18n import t


# ── Politique de mot de passe (partagée par tous les modules) ───
def validate_password_strength(v: str) -> str:
    errors = []
    if not any(c.isupper() for c in v):
        errors.append(t("validation.password_uppercase"))
    if not any(c.isdigit() for c in v):
        errors.append(t("validation.password_digit"))
    if errors:
        raise ValueError(
            t("validation.password_requirements", missing=", ".join(errors))
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
    locale:           str
    created_at:       datetime
    last_login_at:    datetime | None


# ── Langue d'interface ─────────────────────────────────────────
class LocaleUpdateRequest(BaseModel):
    """Changement de langue, déclenché par le sélecteur FR/EN de l'en-tête.

    `Literal` plutôt qu'une simple str : une valeur inconnue est rejetée en 422
    par Pydantic, avant d'atteindre le service — la colonne ne peut donc jamais
    contenir autre chose que les deux langues réellement traduites.
    """
    locale: Literal["fr", "en"]

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
