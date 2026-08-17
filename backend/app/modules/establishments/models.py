import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User


# Nombre maximum d'administrateurs actifs par établissement
MAX_ADMINS_PER_ESTABLISHMENT = 3


class Establishment(Base):
    __tablename__ = "establishments"

    # updated_at est calculé côté serveur (onupdate=func.now()) : sans
    # eager_defaults, l'attribut est expiré après un UPDATE et sa lecture
    # déclencherait un lazy-load interdit en async (MissingGreenlet).
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Code court et unique — sert de préfixe aux matricules des membres
    # (enfants, staff). Ex: "LPRDS" → LPRDS-2026-0001
    code: Mapped[str] = mapped_column(
        String(10), unique=True, index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    users: Mapped[list["User"]] = relationship(
        back_populates="establishment", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Establishment {self.code} — {self.name}>"
