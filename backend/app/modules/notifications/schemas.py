from pydantic import BaseModel, Field, model_validator
from typing import Optional
import uuid
from datetime import datetime


class PushSubscriptionCreate(BaseModel):
    endpoint: str = Field(..., description="Push subscription endpoint URL")
    p256dh: str = Field(
        ..., description="Public DH key (base64url encoded)", min_length=44
    )
    auth_key: str = Field(
        ..., description="Authentication secret (base64url encoded)", min_length=44
    )
    user_id: Optional[uuid.UUID] = Field(
        None, description="User ID (parent/admin) — if omitted, estab_id is derived"
    )

    @model_validator(mode="after")
    def check_ownership(self) -> "PushSubscriptionCreate":
        if not self.user_id:
            raise ValueError(
                "user_id is required for per-user subscription management"
            )
        return self


class PushSubscriptionResponse(BaseModel):
    id: uuid.UUID
    endpoint: str
    p256dh: str
    auth_key: str
    user_id: Optional[uuid.UUID] = None
    establishment_id: Optional[uuid.UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PushSubscriptionDelete(BaseModel):
    subscription_id: uuid.UUID