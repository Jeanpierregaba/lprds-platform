"""
Structure interne d'un établissement : hiérarchie département → section → groupe.

  Department  1 ──< N  Section  1 ──< N  Group
                                          │
                                          └── educatrice (1 staff, unique/section)
                                          └── enfants (N, même section, 1 groupe max)

Chaque établissement crée la sienne — les valeurs diffèrent d'un établissement à
l'autre, d'où le rattachement à establishment_id.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.children.models import Child
    from app.modules.establishments.models import Establishment


class _ScopedUnit:
    """Colonnes communes aux trois entités."""

    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Department(Base, _ScopedUnit):
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("establishment_id", "name", name="uq_department_per_estab"),
    )

    establishment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("establishments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    sections: Mapped[list["Section"]] = relationship(
        back_populates="department", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Department {self.name}>"


class Section(Base, _ScopedUnit):
    __tablename__ = "sections"
    __table_args__ = (
        # Nom unique par département (et non plus par établissement) : deux
        # départements peuvent avoir une section homonyme.
        UniqueConstraint("department_id", "name", name="uq_section_per_department"),
    )

    establishment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("establishments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Une section appartient à un département — pas de section sans département.
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    department: Mapped["Department"] = relationship(
        back_populates="sections", lazy="selectin"
    )
    groups: Mapped[list["Group"]] = relationship(
        back_populates="section", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Section {self.name}>"


class Group(Base, _ScopedUnit):
    __tablename__ = "groups"
    __table_args__ = (
        # Unicité (nom) et (educatrice) restreintes aux groupes ACTIFS : un groupe
        # désactivé ne doit bloquer ni la réutilisation du nom (= surnom de
        # l'educatrice, donc récurrent) ni la réassignation de l'educatrice.
        Index(
            "uq_group_name_active_per_section",
            "section_id",
            "name",
            unique=True,
            postgresql_where=text("is_active"),
        ),
        Index(
            "uq_group_educatrice_active_per_section",
            "section_id",
            "educatrice_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )

    establishment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("establishments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Un groupe appartient à une section — pas de groupe sans section.
    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Educatrice responsable (staff, staff_type=educateur). Obligatoire : le nom
    # du groupe reprend par défaut son surnom.
    educatrice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    section: Mapped["Section"] = relationship(
        back_populates="groups", lazy="selectin"
    )
    educatrice: Mapped["User"] = relationship(lazy="selectin")
    children: Mapped[list["Child"]] = relationship(
        back_populates="group", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Group {self.name}>"
