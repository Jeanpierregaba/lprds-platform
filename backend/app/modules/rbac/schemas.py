import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.rbac.models import PermissionCode


class PermissionResponse(BaseModel):
    """Catalogue RBAC : le CODE seul, jamais un libellé.

    Ces libellés n'apparaissent qu'à l'écran (éditeur de rôles) — aucun
    document généré n'en a besoin, contrairement au vocabulaire des rapports.
    Ils vivent donc dans les catalogues du frontend, qui traduit par code, et
    l'API n'a plus à parler une langue. La colonne `permissions.label` reste
    en base : elle documente le catalogue seedé côté serveur.
    """

    model_config = {"from_attributes": True}

    id:   uuid.UUID
    code: str


class RoleCreateRequest(BaseModel):
    name:        str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)
    permissions: list[PermissionCode] = []


class RoleUpdateRequest(BaseModel):
    name:        str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)
    # None = inchangé ; [] = retire toutes les permissions
    permissions: list[PermissionCode] | None = None
    is_active:   bool | None = None


class RoleResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:               uuid.UUID
    establishment_id: uuid.UUID
    name:             str
    description:      str | None
    is_active:        bool
    permissions:      list[PermissionResponse]
    created_at:       datetime
    updated_at:       datetime


class UserRolesResponse(BaseModel):
    """Rôles RBAC et permissions effectives d'un membre du staff."""

    user_id:     uuid.UUID
    email:       str
    roles:       list[RoleResponse]
    permissions: list[str]
