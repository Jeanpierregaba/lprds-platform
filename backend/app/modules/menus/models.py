"""
Menu hebdomadaire (lundi–vendredi), rempli par l'admin ou le staff délégué
(menus:write — typiquement un staff_type=restaurateur, mais RBAC seul fait foi,
staff_type reste une métadonnée descriptive sans effet sur les droits, cf.
module Staff). Une ligne = une semaine entière pour l'établissement, `content`
JSONB validé côté Pydantic (WeekMenuContent, schemas.py) — pas de variabilité
de structure comme les rapports (toujours 5 jours × 4 créneaux), donc pas
besoin d'une validation par type : le schéma de requête FastAPI suffit déjà.
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.establishments.models import Establishment


class WeeklyMenu(Base):
    __tablename__ = "weekly_menus"
    __table_args__ = (
        UniqueConstraint("establishment_id", "week_start", name="uq_weekly_menu_week"),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    establishment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("establishments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Toujours un lundi — imposé en service (422 sinon), jamais auto-corrigé
    # silencieusement (cf. schemas.py).
    week_start: Mapped[date] = mapped_column(Date, nullable=False)

    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    # Dernier éditeur — potentiellement différent du créateur, le menu se
    # remplit souvent jour après jour par le même staff restaurateur mais
    # peut être repris par un collègue ou l'admin.
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    created_by: Mapped["User"] = relationship(foreign_keys=[created_by_id], lazy="selectin")
    updated_by: Mapped["User | None"] = relationship(
        foreign_keys=[updated_by_id], lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<WeeklyMenu {self.week_start}>"
