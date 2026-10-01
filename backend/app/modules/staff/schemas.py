import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.modules.auth.schemas import StrongPassword
from app.modules.staff.models import StaffType


class StaffCreateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name:  str = Field(min_length=1, max_length=100)
    nickname:   str = Field(min_length=1, max_length=100)
    phone:      str = Field(min_length=1, max_length=20)
    email:      EmailStr
    # Mot de passe temporaire saisi par le créateur, communiqué par email.
    password:   StrongPassword
    staff_type: StaffType


class StaffUpdateRequest(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name:  str | None = Field(default=None, min_length=1, max_length=100)
    nickname:   str | None = Field(default=None, min_length=1, max_length=100)
    phone:      str | None = Field(default=None, min_length=1, max_length=20)
    email:      EmailStr | None = None
    staff_type: StaffType | None = None
    is_active:  bool | None = None


class StaffPasswordResetRequest(BaseModel):
    # Le créateur saisit le nouveau mot de passe ; il est envoyé au personnel.
    new_password: StrongPassword


class StaffStatusRequest(BaseModel):
    is_active: bool


class StaffResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:               uuid.UUID
    matricule:        str | None
    email:            str
    first_name:       str
    last_name:        str
    nickname:         str | None
    phone:            str | None
    staff_type:       str | None
    establishment_id: uuid.UUID | None
    is_active:        bool
    created_at:       datetime
    last_login_at:    datetime | None


class StaffListItem(BaseModel):
    model_config = {"from_attributes": True}

    id:         uuid.UUID
    matricule:  str | None
    email:      str
    first_name: str
    last_name:  str
    nickname:   str | None
    phone:      str | None
    staff_type: str | None
    is_active:  bool


class StaffListResponse(BaseModel):
    total: int
    items: list[StaffListItem]
