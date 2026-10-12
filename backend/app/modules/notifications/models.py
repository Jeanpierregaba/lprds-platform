import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    # `onupdate=func.now()` sur updated_at : sans eager_defaults, l'attribut est
    # expiré après un UPDATE et sa lecture déclenche un lazy-load interdit en
    # async (MissingGreenlet → 500). Cf. CLAUDE.md § Performance — la mise à
    # jour d'un abonnement existant est exactement ce chemin.
    __mapper_args__ = {"eager_defaults": True}

    # ⚠️ Un abonnement identifie un APPAREIL, pas un compte : l'unicité porte
    # donc sur le couple. Sans elle, rien n'empêche deux lignes pour le même
    # navigateur — donc deux notifications identiques pour une seule diffusion.
    __table_args__ = (
        CheckConstraint(
            "endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth_key IS NOT NULL",
            name="ck_push_subscription_required_fields",
        ),
        UniqueConstraint("user_id", "endpoint", name="uq_push_subscription_user_endpoint"),
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
    # ⚠️ Ces trois largeurs étaient TOUTES trop courtes, et le constat ne vient
    # pas d'une relecture mais d'un appel réel : `VARCHAR(44)` contre une clé
    # `p256dh` de 87 caractères donnait « value too long for varchar(44) », en
    # 500. L'endpoint, lui, tient en 500 caractères chez Google et Mozilla mais
    # pas toujours chez Apple — un `Text` ne coûte rien en PostgreSQL et retire
    # la question.
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(128), nullable=False)  # base64url, 87 car.
    auth_key: Mapped[str] = mapped_column(String(32), nullable=False)  # base64url, 22 car.
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