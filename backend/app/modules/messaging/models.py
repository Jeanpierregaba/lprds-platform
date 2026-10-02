"""
Messagerie admin ↔ parents. Deux volets :
  • Announcement — diffusion : un admin publie pour tous les parents de
    l'établissement OU pour un à plusieurs départements ciblés (table
    d'association announcement_departments ; aucune ligne = tout
    l'établissement). L'audience d'un parent = les départements de ses
    enfants (via parent_children + children.department_id).
  • Conversation / Message — discussion privée : UNE conversation par parent
    (pas par admin — « l'administration » est collective), n'importe quel admin
    peut y répondre. Un seul niveau de lu/non-lu par message (lu "par l'autre
    côté"), pas de suivi par admin individuel : un admin qui ouvre le fil marque
    lu pour toute l'administration, ce qui correspond à l'usage réel (un seul
    parent en face, une équipe côté établissement). Les messages acceptent des
    pièces jointes images ET vidéos (les diffusions restent images + PDF).

⚠️ Module volontairement en dehors du RBAC : accès restreint aux comptes
UserRole.ADMIN et UserRole.PARENT uniquement (ni staff, ni superadmin), sur
demande explicite — « très sensible ».
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.establishments.models import Establishment
    from app.modules.organization.models import Department


# Ciblage d'une diffusion : une à plusieurs lignes = départements visés,
# AUCUNE ligne = tout l'établissement (broadcast). Côté département le
# ONDELETE est RESTRICT : supprimer un département ne doit jamais élargir
# silencieusement une audience ciblée vers un broadcast (les départements ne
# sont de toute façon que soft-deleted via l'API, jamais hard-deleted).
announcement_departments = Table(
    "announcement_departments",
    Base.metadata,
    Column(
        "announcement_id",
        UUID(as_uuid=True),
        ForeignKey("announcements.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "department_id",
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="RESTRICT"),
        primary_key=True,
    ),
)


class Announcement(Base):
    __tablename__ = "announcements"
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
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # Version anglaise, traduite automatiquement à la création et à chaque
    # modification du texte français. NULL = pas (encore) traduite : le parent
    # anglophone lit alors le français, comme partout ailleurs.
    #
    # Une diffusion part à TOUS les parents de l'établissement, dont les
    # anglophones : la laisser en français revenait à ne pas les informer.
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body_en: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Désactivation (soft) : jamais de suppression d'une diffusion déjà envoyée.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    created_by: Mapped["User"] = relationship(lazy="selectin")
    # Départements ciblés (vide = broadcast tout l'établissement).
    departments: Mapped[list["Department"]] = relationship(
        secondary=announcement_departments, lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Announcement {self.title}>"


class AnnouncementRead(Base):
    """Accusé de lecture d'un parent sur une diffusion."""

    __tablename__ = "announcement_reads"
    __table_args__ = (
        UniqueConstraint("announcement_id", "parent_id", name="uq_announcement_read"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    announcement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("announcements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Conversation(Base):
    """Une seule conversation par parent — pas par membre de l'administration."""

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("establishment_id", "parent_id", name="uq_conversation_per_parent"),
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
    parent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Dénormalisé pour trier la liste des conversations sans jointure/agrégat.
    last_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    parent: Mapped["User"] = relationship(lazy="selectin")

    def __repr__(self) -> str:
        return f"<Conversation parent={self.parent_id}>"


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint(
            "sender_role IN ('admin', 'parent')", name="ck_message_sender_role"
        ),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    # Photo du rôle à l'envoi ('admin'/'parent') : affichage côté parent
    # ("Administration" vs son propre nom) sans dépendre du rôle ACTUEL de
    # l'expéditeur, et permet de filtrer qui-doit-marquer-lu sans jointure.
    sender_role: Mapped[str] = mapped_column(String(10), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    # Lu "par l'autre côté" — cf. docstring du module : un seul niveau, pas de
    # suivi par admin individuel.
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    sender: Mapped["User"] = relationship(lazy="selectin")
    # Ajoutée pour le module Galerie — remonter au parent d'une conversation
    # depuis une pièce jointe sans requête séparée par élément listé.
    conversation: Mapped["Conversation"] = relationship(lazy="selectin")

    def __repr__(self) -> str:
        return f"<Message {self.sender_role}:{self.id}>"


class Attachment(Base):
    """
    Pièce jointe d'un message OU d'une diffusion (jamais les deux) — même
    pattern « double FK nullable + CHECK » que AttendanceEvent.child_id/staff_id.

    Le fichier est stocké hors base (cf. app/core/storage.py) ; seule la
    métadonnée est ici. Le nom sur disque (storage_key) est un UUID, jamais le
    nom original — celui-ci n'est conservé qu'à titre d'affichage.
    """

    __tablename__ = "attachments"
    __table_args__ = (
        CheckConstraint(
            "(message_id IS NOT NULL AND announcement_id IS NULL) OR "
            "(message_id IS NULL AND announcement_id IS NOT NULL)",
            name="ck_attachment_owner",
        ),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    announcement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    uploaded_by: Mapped["User"] = relationship(lazy="selectin")
    # Ajoutées pour le module Galerie (relations ORM pures, aucune migration) —
    # `message` pour les conversations privées, `announcement` pour les
    # diffusions (médias visibles établissement-wide, cf. galerie).
    message: Mapped["Message | None"] = relationship(lazy="selectin")
    announcement: Mapped["Announcement | None"] = relationship(lazy="selectin")

    def __repr__(self) -> str:
        return f"<Attachment {self.filename}>"
