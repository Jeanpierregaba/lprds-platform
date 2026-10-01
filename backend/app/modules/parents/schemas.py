import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.modules.auth.schemas import StrongPassword


class ChildBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:          uuid.UUID
    matricule:   str
    last_name:   str
    first_names: str


class ParentCreateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name:  str = Field(min_length=1, max_length=100)
    nickname:   str = Field(min_length=1, max_length=100)
    phone:      str = Field(min_length=1, max_length=20)
    email:      EmailStr
    # Mot de passe temporaire saisi par le créateur, communiqué par email.
    password:   StrongPassword
    # Au moins un enfant à assigner.
    child_ids:  list[uuid.UUID] = Field(min_length=1)


class ParentUpdateRequest(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name:  str | None = Field(default=None, min_length=1, max_length=100)
    nickname:   str | None = Field(default=None, min_length=1, max_length=100)
    phone:      str | None = Field(default=None, min_length=1, max_length=20)
    email:      EmailStr | None = None
    is_active:  bool | None = None
    # None = inchangé ; une liste fournie REMPLACE l'assignation (min 1 enfant).
    child_ids:  list[uuid.UUID] | None = Field(default=None, min_length=1)


class ParentPasswordResetRequest(BaseModel):
    # L'admin/staff saisit le nouveau mot de passe ; il est envoyé au parent.
    new_password: StrongPassword


class ParentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:               uuid.UUID
    email:            str
    first_name:       str
    last_name:        str
    nickname:         str | None
    phone:            str | None
    establishment_id: uuid.UUID | None
    is_active:        bool
    created_at:       datetime
    last_login_at:    datetime | None
    assigned_children: list[ChildBrief] = Field(
        default=[], validation_alias="assigned_children"
    )


class ParentListItem(BaseModel):
    model_config = {"from_attributes": True}

    id:          uuid.UUID
    email:       str
    first_name:  str
    last_name:   str
    nickname:    str | None
    phone:       str | None
    is_active:   bool
    children_count: int = 0


class ParentListResponse(BaseModel):
    total: int
    items: list[ParentListItem]
