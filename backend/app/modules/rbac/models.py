import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
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
    from app.modules.establishments.models import Establishment


class PermissionCode(StrEnum):
    """
    Catalogue des permissions. Source de vérité : ce code.
    La table `permissions` en est le reflet, synchronisé par migration.
    """

    CHILDREN_READ    = "children:read"
    CHILDREN_WRITE   = "children:write"
    CHILDREN_ARCHIVE = "children:archive"
    PARENTS_READ     = "parents:read"
    PARENTS_WRITE    = "parents:write"
    STAFF_READ       = "staff:read"
    STAFF_WRITE      = "staff:write"
    ORGANIZATION_READ  = "organization:read"
    ORGANIZATION_WRITE = "organization:write"
    ATTENDANCE_SCAN    = "attendance:scan"
    ATTENDANCE_READ    = "attendance:read"
    ATTENDANCE_WRITE   = "attendance:write"
    REPORTS_READ       = "reports:read"
    REPORTS_WRITE      = "reports:write"
    REPORTS_VALIDATE   = "reports:validate"
    GALLERY_READ       = "gallery:read"
    MENUS_READ         = "menus:read"
    MENUS_WRITE        = "menus:write"
    BLOG_WRITE         = "blog:write"


# Libellés affichables — utilisés au seed du catalogue
PERMISSION_LABELS: dict[PermissionCode, str] = {
    PermissionCode.CHILDREN_READ: "Consulter les fiches enfants",
    PermissionCode.CHILDREN_WRITE: "Créer et modifier les fiches enfants",
    PermissionCode.CHILDREN_ARCHIVE: "Activer / désactiver une fiche enfant",
    PermissionCode.PARENTS_READ: "Consulter les comptes parents",
    PermissionCode.PARENTS_WRITE: "Créer, modifier et réinitialiser les comptes parents",
    PermissionCode.STAFF_READ: "Consulter les comptes du personnel",
    PermissionCode.STAFF_WRITE: "Créer, modifier et réinitialiser les comptes du personnel",
    PermissionCode.ORGANIZATION_READ: "Consulter départements, sections et groupes",
    PermissionCode.ORGANIZATION_WRITE: "Gérer départements, sections et groupes",
    PermissionCode.ATTENDANCE_SCAN: "Scanner les codes QR de présence",
    PermissionCode.ATTENDANCE_READ: "Consulter les présences et tableaux de bord",
    PermissionCode.ATTENDANCE_WRITE: "Configurer les paramètres de présence (horaires, exemptions)",
    PermissionCode.REPORTS_READ: "Consulter les rapports",
    PermissionCode.REPORTS_WRITE: "Créer, modifier et soumettre des rapports",
    PermissionCode.REPORTS_VALIDATE: "Valider ou rejeter les rapports soumis",
    PermissionCode.GALLERY_READ: "Consulter la galerie de médias (photos/vidéos des rapports)",
    PermissionCode.MENUS_READ: "Consulter le menu de la semaine et son historique",
    PermissionCode.MENUS_WRITE: "Créer et modifier les menus de la semaine, consulter l'historique",
    PermissionCode.BLOG_WRITE: "Rédiger, publier, modifier et supprimer les actualités du site vitrine",
}


# ── Tables d'association ────────────────────────────────────────
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column(
        "role_id",
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "permission_id",
        UUID(as_uuid=True),
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column(
        "user_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "role_id",
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Permission(Base):
    """Catalogue global, en lecture seule côté API."""

    __tablename__ = "permissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String(150), nullable=False)

    def __repr__(self) -> str:
        return f"<Permission {self.code}>"


class Role(Base):
    """
    Rôle métier créé par l'admin d'un établissement (Directeur, Assistant de
    direction…). À ne pas confondre avec `User.role` (UserRole), qui est le type
    de compte (superadmin/admin/staff/parent) — les deux coexistent :
      • UserRole   → ce QU'EST le compte
      • Role (RBAC)→ ce que le staff a le DROIT de faire dans son établissement
    """

    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("establishment_id", "name", name="uq_role_name_per_estab"),
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
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    permissions: Mapped[list["Permission"]] = relationship(
        secondary=role_permissions, lazy="selectin"
    )
    users: Mapped[list["User"]] = relationship(
        secondary=user_roles, back_populates="roles", lazy="selectin"
    )
    establishment: Mapped["Establishment"] = relationship(lazy="selectin")

    def __repr__(self) -> str:
        return f"<Role {self.name}>"
