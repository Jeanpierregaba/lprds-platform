"""
Bibliothèque de l'établissement : catalogue de livres, prêts aux enfants,
paramètres de rappel.

Décisions de conception (confirmées avec l'utilisateur avant implémentation) :
  - Un livre peut être rattaché à PLUSIEURS sections (`book_sections` M2M), mais
    la QUANTITÉ est centralisée sur le livre (pas de stock par section) : le
    nombre d'exemplaires disponibles = total_quantity - prêts en cours.
  - La date de retour est libre, avec un défaut configurable (aujourd'hui +
    `default_loan_days`, défaut 14 jours).
  - Les rappels (email + messagerie) sont déclenchables manuellement et par une
    tâche Celery beat quotidienne ; s'ils sont actifs, chaque prêt éligible est
    rappelé au plus une fois par jour (dédoublonnage via `last_reminded_on`).
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.children.models import Child
    from app.modules.establishments.models import Establishment
    from app.modules.organization.models import Section


book_sections = Table(
    "book_sections",
    Base.metadata,
    Column(
        "book_id",
        UUID(as_uuid=True),
        ForeignKey("books.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "section_id",
        UUID(as_uuid=True),
        ForeignKey("sections.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Book(Base):
    """Un livre du catalogue. Soft-delete via `is_active` (jamais de
    suppression physique, cohérent avec le reste de l'application)."""

    __tablename__ = "books"
    __table_args__ = (
        CheckConstraint("total_quantity >= 1", name="ck_book_total_quantity_positive"),
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
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    author: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Le seul texte libre du module qu'un PARENT lit. Titre et auteur sont des
    # noms propres (on ne traduit pas « Le Petit Prince ») ; la description,
    # elle, est rédigée par l'établissement — même famille que les diffusions.
    description_en: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    total_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    sections: Mapped[list["Section"]] = relationship(
        secondary=book_sections, lazy="selectin"
    )
    lendings: Mapped[list["BookLending"]] = relationship(
        back_populates="book", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Book {self.title} ({self.author})>"


class BookLending(Base):
    """
    Prêt d'un livre à un enfant. `returned_at IS NULL` = prêt en cours.
    `last_reminded_on` sert au dédoublonnage des rappels : chaque prêt éligible
    est rappelé au plus une fois par jour (plusieurs jours d'affilée si besoin).
    """

    __tablename__ = "book_lendings"
    __table_args__ = (
        CheckConstraint("due_date >= borrowed_at", name="ck_lending_due_ge_borrowed"),
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
    book_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("books.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    child_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("children.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Qui a enregistré le prêt (admin ou bibliothécaire)
    lent_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    borrowed_at: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    returned_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_reminded_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    book: Mapped["Book"] = relationship(back_populates="lendings", lazy="selectin")
    child: Mapped["Child"] = relationship(lazy="selectin")
    lent_by: Mapped["User"] = relationship(lazy="selectin")


class LibrarySettings(Base):
    """Paramètres de rappel de la bibliothèque — une ligne par établissement."""

    __tablename__ = "library_settings"
    __table_args__ = (
        UniqueConstraint("establishment_id", name="uq_library_settings_per_estab"),
        CheckConstraint("reminder_days_before >= 0", name="ck_library_reminder_days_nonneg"),
        CheckConstraint("default_loan_days >= 1", name="ck_library_default_loan_days_positive"),
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
    # Rappels activés (email parent + message dans la conversation admin↔parent)
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Seuil d'avertissement : rappel envoyé pour toute échéance dans <= N jours.
    reminder_days_before: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    # Durée de prêt par défaut (jours) quand aucune date de retour n'est saisie.
    default_loan_days: Mapped[int] = mapped_column(Integer, default=14, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")