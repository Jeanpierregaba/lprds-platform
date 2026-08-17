import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.establishments.models import Establishment
    from app.modules.organization.models import Department, Group, Section


class Child(Base):
    """
    Fiche enfant. Données sensibles (RGPD) : jamais de suppression physique,
    seulement une désactivation via is_active.
    """

    __tablename__ = "children"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Matricule = <code établissement>-<5 caractères aléatoires>. Ex: LPRDS-M87D1
    # Unique au global : le préfixe étant le code (lui-même unique), il ne peut
    # pas y avoir de collision entre établissements.
    matricule: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )

    establishment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("establishments.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # ── Informations de base ────────────────────────────────────
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    first_names: Mapped[str] = mapped_column(String(200), nullable=False)
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    admission_date: Mapped[date] = mapped_column(Date, nullable=False)
    residence_address: Mapped[str] = mapped_column(String(500), nullable=False)

    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Groupe d'appartenance — un enfant est dans 0 ou 1 groupe, toujours dans sa
    # propre section (cf. module organization). SET NULL si le groupe disparaît.
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Informations comportementales ───────────────────────────
    behavioral_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferences: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Informations médicales ──────────────────────────────────
    medical_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    dietary_restrictions: Mapped[str | None] = mapped_column(Text, nullable=True)
    medications: Mapped[str | None] = mapped_column(Text, nullable=True)
    doctor_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    doctor_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    department: Mapped["Department | None"] = relationship(lazy="selectin")
    section: Mapped["Section | None"] = relationship(lazy="selectin")
    group: Mapped["Group | None"] = relationship(
        back_populates="children", lazy="selectin"
    )

    guardians: Mapped[list["Guardian"]] = relationship(
        back_populates="child",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    authorized_persons: Mapped[list["AuthorizedPerson"]] = relationship(
        back_populates="child",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    # Comptes parents assignés à cet enfant (M2M) — cf. module parents
    parents: Mapped[list["User"]] = relationship(
        secondary="parent_children",
        back_populates="assigned_children",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Child {self.matricule} — {self.last_name} {self.first_names}>"


class Guardian(Base):
    """Parent ou tuteur. Fiche de contact : pas de compte de connexion."""

    __tablename__ = "guardians"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    child_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("children.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    first_names: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Réservé au futur portail parent : permettra de rattacher cette fiche à un
    # compte User (role=parent) sans migration de schéma.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    child: Mapped["Child"] = relationship(back_populates="guardians")
    user: Mapped["User | None"] = relationship(lazy="selectin")

    def __repr__(self) -> str:
        return f"<Guardian {self.last_name} {self.first_names}>"


class AuthorizedPerson(Base):
    """Personne autorisée à récupérer l'enfant."""

    __tablename__ = "authorized_persons"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    child_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("children.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    first_names: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    child: Mapped["Child"] = relationship(back_populates="authorized_persons")

    def __repr__(self) -> str:
        return f"<AuthorizedPerson {self.last_name} {self.first_names}>"
