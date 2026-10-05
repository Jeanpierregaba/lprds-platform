"""
Blog du site vitrine — actualités, événements, projets pédagogiques publiés
par l'admin ou le staff délégué (blog:write). Deux volets :
  • Gestion (authentifiée, module courant) — CRUD + workflow draft/published.
  • Consultation (PUBLIQUE, sans authentification) — cf. blog/public_router.py,
    seule exception du projet à la règle « jamais de fichier/donnée servi sans
    authentification » : un article PUBLISHED et actif est, par nature, du
    contenu de site vitrine destiné au grand public.

Étiquettes (BlogTag) : liste géré librement par l'admin/rédacteur (créées à la
volée), PAS un enum fermé comme Mood/HealthStatus — choix explicite de
l'utilisateur, la variété des sujets d'un blog ne se prête pas à un vocabulaire
figé en code.
"""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    String,
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


class ArticleStatus(StrEnum):
    DRAFT     = "draft"
    PUBLISHED = "published"


class TranslationStatus(StrEnum):
    """État de la version anglaise d'un article.

    `AUTO` et `MANUAL` portent la règle centrale du module : une traduction
    corrigée à la main n'est JAMAIS réécrite par la machine. Tant que le
    statut vaut `auto`, chaque modification du contenu français relance la
    traduction ; dès qu'un humain l'a corrigée (`manual`), le contenu anglais
    n'appartient plus qu'à lui.
    """

    PENDING = "pending"  # à traduire (délai dépassé, ou pas encore tenté)
    AUTO    = "auto"     # traduit par la machine, réécrasable
    MANUAL  = "manual"   # corrigé à la main — jamais réécrasé
    FAILED  = "failed"   # tentative en échec — repli FR à la lecture


class BlogGalleryCategory(Base):
    """Catégorie de photo de la galerie — liste libre gérée par
    l'admin/rédacteur (créée à la volée), comme BlogTag pour les articles.
    Remplace l'ancien enum figé GalleryCategory (migration) : la variété des
    sujets d'une galerie photo ne se prête pas à un vocabulaire fermé."""

    __tablename__ = "blog_gallery_categories"
    __table_args__ = (
        UniqueConstraint("establishment_id", "name", name="uq_blog_gallery_category_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    establishment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("establishments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    # Version anglaise du nom, remplie par traduction automatique à la création
    # et à chaque renommage. NULL = pas (encore) traduit : la lecture publique
    # retombe alors sur le français, comme partout ailleurs.
    #
    # Pas de colonne « corrigé à la main » ici, à la différence des articles :
    # une correction saisie par le rédacteur est gravée dans
    # `translation_memory`, qui la restituera à la prochaine traduction du même
    # texte. La mémoire tient donc le rôle du drapeau, pour un nom de deux mots
    # qui revient d'un établissement à l'autre.
    name_en: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<BlogGalleryCategory {self.name}>"


class BlogTag(Base):
    __tablename__ = "blog_tags"
    __table_args__ = (
        UniqueConstraint("establishment_id", "name", name="uq_blog_tag_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    establishment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("establishments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    # Version anglaise du nom, remplie par traduction automatique à la création
    # et à chaque renommage. NULL = pas (encore) traduit : la lecture publique
    # retombe alors sur le français, comme partout ailleurs.
    #
    # Pas de colonne « corrigé à la main » ici, à la différence des articles :
    # une correction saisie par le rédacteur est gravée dans
    # `translation_memory`, qui la restituera à la prochaine traduction du même
    # texte. La mémoire tient donc le rôle du drapeau, pour un nom de deux mots
    # qui revient d'un établissement à l'autre.
    name_en: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<BlogTag {self.name}>"


class Article(Base):
    __tablename__ = "articles"
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
    tag_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("blog_tags.id", ondelete="SET NULL"), nullable=True
    )

    title:   Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # ── Version anglaise ────────────────────────────────────────
    # Colonnes dédiées plutôt qu'une table `article_translations` : il n'y a
    # que deux langues, décidées produit, et une table de traduction
    # généraliserait un besoin qui n'existe pas (pas de troisième langue
    # prévue). Nullables : un brouillon n'est pas encore traduit, et un
    # échec laisse simplement la version anglaise absente (repli FR).
    title_en:   Mapped[str | None] = mapped_column(String(200), nullable=True)
    content_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Langue de rédaction. Toujours "fr" aujourd'hui, mais la colonne évite
    # d'avoir à deviner le sens de la traduction le jour où un rédacteur
    # écrira directement en anglais.
    source_locale: Mapped[str] = mapped_column(String(2), nullable=False, default="fr")
    translation_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=str(TranslationStatus.PENDING)
    )

    # Image à la une — une seule, colonnes directes (pas de table à part,
    # contrairement aux médias ci-dessous qui sont une vraie liste). Absente
    # tant que l'upload dédié (POST .../cover) n'a pas eu lieu.
    cover_filename:     Mapped[str | None] = mapped_column(String(255), nullable=True)
    cover_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cover_size_bytes:   Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    cover_storage_key:  Mapped[str | None] = mapped_column(String(500), nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=str(ArticleStatus.DRAFT)
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Soft delete explicite (demande utilisateur) — jamais de suppression
    # définitive, même après publication.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
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
    tag: Mapped["BlogTag | None"] = relationship(lazy="selectin")
    created_by: Mapped["User"] = relationship(foreign_keys=[created_by_id], lazy="selectin")
    updated_by: Mapped["User | None"] = relationship(
        foreign_keys=[updated_by_id], lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Article {self.status} {self.title!r}>"


class ArticleAttachment(Base):
    """Médias (image/vidéo) de la galerie d'un article — distincts de l'image
    à la une. Table dédiée, même pattern que ReportAttachment/messaging
    Attachment (pas de polymorphisme entre modules)."""

    __tablename__ = "article_attachments"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    article_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("articles.id", ondelete="CASCADE"),
        nullable=False, index=True,
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

    def __repr__(self) -> str:
        return f"<ArticleAttachment {self.filename}>"


class BlogGalleryPhoto(Base):
    """Photo de la galerie du site vitrine. Liste volontairement simple :
    1 ligne = 1 photo, upload = publication immédiate (pas de workflow, pas de
    titre/légende — cf. décisions produit), catégorie libre
    (BlogGalleryCategory, NULL = sans catégorie, ex. après suppression de sa
    catégorie). Table dédiée, même pattern que ArticleAttachment."""

    __tablename__ = "blog_gallery_photos"
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
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("blog_gallery_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    category: Mapped["BlogGalleryCategory | None"] = relationship(lazy="selectin")
    uploaded_by: Mapped["User"] = relationship(lazy="selectin")

    def __repr__(self) -> str:
        return f"<BlogGalleryPhoto {self.category_id} {self.filename}>"
