import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.children.models import Child
    from app.modules.establishments.models import Establishment
    from app.modules.rbac.models import Role


class UserRole(StrEnum):
    SUPERADMIN = "superadmin"
    ADMIN      = "admin"
    STAFF      = "staff"
    PARENT     = "parent"


class User(Base):
    __tablename__ = "users"

    # Cf. Establishment : nécessaire pour lire updated_at après un UPDATE
    # sans déclencher de lazy-load en contexte async.
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        # values_callable : stocke les VALEURS ("superadmin") et non les noms
        # de membres ("SUPERADMIN"). Aligne la base sur l'API, le frontend et
        # les futures policies Row-Level Security.
        SAEnum(
            UserRole,
            name="userrole",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Surnom d'identification (ex: "Papa Anaïs", "Tata Victoire"), utilisé par les
    # comptes parents et staff. Nullable : superadmin/admin n'en ont pas.
    nickname: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Propres aux comptes staff (nullable pour les autres rôles) :
    # - matricule : <code établissement>-<3 alphanum>, ex. LPRDS-D2Y (unique)
    # - staff_type : poste descriptif (cf. StaffType dans le module staff),
    #   stocké en texte, validé côté API — indépendant de role et des permissions
    matricule: Mapped[str | None] = mapped_column(
        String(20), unique=True, index=True, nullable=True
    )
    staff_type: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # Exemption au contrôle de présence (module attendance). Concerne le staff ;
    # défaut False pour tous les rôles (sans effet pour non-staff).
    attendance_exempt: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    establishment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("establishments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Langue d'interface choisie par l'utilisateur ("fr" | "en").
    # C'est la SEULE source de vérité pour tout ce qui part hors navigateur —
    # emails, PDF, notifications push : le cookie du frontend n'y a pas accès,
    # et ces envois ont lieu alors que l'utilisateur n'est pas devant l'écran.
    # Défaut "fr" : langue de toutes les données antérieures à cette colonne.
    locale: Mapped[str] = mapped_column(
        String(2), default="fr", server_default="fr", nullable=False
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    establishment: Mapped["Establishment"] = relationship(
        back_populates="users", lazy="selectin"
    )

    # Rôles RBAC (droits fins du staff) — distinct de self.role (type de compte)
    roles: Mapped[list["Role"]] = relationship(
        secondary="user_roles", back_populates="users", lazy="selectin"
    )

    # Enfants assignés à ce compte parent (M2M). Vide pour les autres rôles.
    assigned_children: Mapped[list["Child"]] = relationship(
        secondary="parent_children", back_populates="parents", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<User {self.email} [{self.role}]>"
