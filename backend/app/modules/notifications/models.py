import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    __table_args__ = (
        CheckConstraint(
            "endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth_key IS NOT NULL",
            name="ck_push_subscription_required_fields",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    establishment_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("establishments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    endpoint: Mapped[str] = mapped_column(String(500), nullable=False)
    p256dh: Mapped[str] = mapped_column(String(44), nullable=False)  # base64url
    auth_key: Mapped[str] = mapped_column(String(44), nullable=False)  # base64url
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User | None"] = relationship(lazy="selectin")
    establishment: Mapped["Establishment | None"] = relationship(lazy="selectin")

    def __repr__(self) -> str:
        return f"<PushSubscription user={self.user_id} est={self.establishment_id}>"