"""
Rapports de vie de l'enfant — quotidien / bi-mensuel / annuel, affectés par
département par l'admin. Circuit : brouillon → soumis → validé (publié au
parent) ou rejeté (retour à l'auteur pour modification, jusqu'à validation).

Contenu : `content` (JSONB), validé en service.py contre un schéma Pydantic
structuré propre à chaque type (`DailyReportContent`, `BiMensuelReportContent`,
`AnnualReportContent` — cf. schemas.py) ; `summary` (texte libre) reste
accepté mais optionnel pour les 3 types, tout étant porté par le contenu
structuré.
"""

import uuid
from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.children.models import Child
    from app.modules.establishments.models import Establishment
    from app.modules.organization.models import Department, Group


class ReportType(StrEnum):
    QUOTIDIEN  = "quotidien"
    BI_MENSUEL = "bi_mensuel"
    ANNUEL     = "annuel"


class ReportStatus(StrEnum):
    DRAFT     = "draft"      # rédaction en cours, jamais soumis (ou de nouveau après rejet)
    SUBMITTED = "submitted"  # soumis, en attente de validation admin
    REJECTED  = "rejected"   # rejeté — retourné à l'auteur pour modification
    VALIDATED = "validated"  # validé et publié au parent


# ── Vocabulaire structuré du rapport quotidien ────────────────────
# Codes stables en base, libellés hors du code métier : chaque valeur a une
# entrée "reports.vocabulary.<groupe>.<code>" dans app/locales/{fr,en}.py.
# Renommer un libellé ne touche donc jamais aux données déjà stockées, et le
# même catalogue sert l'API (/reports/vocabulary) et le PDF du bulletin.
# ⚠️ Ajouter une valeur à un enum ci-dessous impose d'ajouter sa clé dans LES
# DEUX catalogues — `test_reports_vocabulary_is_translated` y veille.
class HealthStatus(StrEnum):
    BIEN          = "bien"
    A_SURVEILLER  = "a_surveiller"
    MALADE        = "malade"



class MealAmount(StrEnum):
    BIEN_MANGE  = "bien_mange"
    PEU_MANGE   = "peu_mange"
    RIEN_MANGE  = "rien_mange"



class Mood(StrEnum):
    JOYEUX     = "joyeux"
    CALME      = "calme"
    AGITE      = "agite"
    TRISTE     = "triste"
    FATIGUE    = "fatigue"
    GRINCHEUX  = "grincheux"



class BehaviorTag(StrEnum):
    PLEASANT_DAY                    = "pleasant_day"
    ENTHUSIASTIC_PARTICIPATION      = "enthusiastic_participation"
    INTERESTED_PARTICIPATION        = "interested_participation"
    OBSERVED_BEFORE_PARTICIPATING   = "observed_before_participating"
    ATTENTIVE_FOCUSED               = "attentive_focused"
    DISTRACTED_MOMENTS              = "distracted_moments"
    CURIOUS_INTERESTED              = "curious_interested"
    ASSIMILATED_LEARNING            = "assimilated_learning"
    CAREFUL_APPLICATION             = "careful_application"
    AUTONOMOUS                      = "autonomous"
    NEEDED_SUPPORT                  = "needed_support"
    GOOD_INTERACTION                = "good_interaction"
    FOLLOWED_INSTRUCTIONS           = "followed_instructions"
    NEEDED_COMFORT                  = "needed_comfort"
    PERSEVERANCE                    = "perseverance"



# ── Vocabulaire structuré du rapport bi-mensuel ───────────────────
class ClassBehavior(StrEnum):
    CALM          = "calm"
    JOYFUL        = "joyful"
    SMILING       = "smiling"
    PARTICIPATIVE = "participative"
    RESERVED      = "reserved"
    DYNAMIC       = "dynamic"
    AGITATED      = "agitated"
    TIRED         = "tired"
    EMOTIONAL     = "emotional"



class PeerRelation(StrEnum):
    KIND_TO_PEERS     = "kind_to_peers"
    SOCIABLE          = "sociable"
    COOPERATIVE       = "cooperative"
    STRUGGLES_SHARING = "struggles_sharing"
    PREFERS_ALONE     = "prefers_alone"



class EmotionManagement(StrEnum):
    CRIED_LITTLE                 = "cried_little"
    CRIED_A_LOT                  = "cried_a_lot"
    NEEDED_REASSURANCE           = "needed_reassurance"
    EXPRESSES_BETTER             = "expresses_better"
    IMPROVING_EMOTION_MANAGEMENT = "improving_emotion_management"
    AUTONOMOUS                   = "autonomous"



# ── Vocabulaire structuré du rapport annuel ───────────────────────
class AcquisitionLevel(StrEnum):
    ACQUIS               = "acquis"
    EN_COURS_ACQUISITION = "en_cours_acquisition"
    A_CONSOLIDER          = "a_consolider"



class DepartmentReportType(Base):
    """Types de rapport activés par l'admin pour un département donné."""

    __tablename__ = "department_report_types"
    __table_args__ = (
        UniqueConstraint(
            "department_id", "report_type", name="uq_department_report_type"
        ),
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
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report_type: Mapped[str] = mapped_column(String(20), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        # Empêche deux rapports du même type, pour le même enfant, sur la même
        # période (ex: deux rapports quotidiens le même jour).
        UniqueConstraint(
            "child_id", "report_type", "period_start", name="uq_report_period"
        ),
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
    child_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("children.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Groupe au moment de la création — dénormalisé, utile pour le filtrage
    # côté éducatrice ; NULL pour un rapport créé par un admin sans groupe.
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="SET NULL"), nullable=True
    )

    report_type: Mapped[str] = mapped_column(String(20), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    # Libellé français posé à la création — trace lisible en base (requêtes
    # manuelles, export SQL). ⚠️ Ce n'est PAS ce qui s'affiche : l'API et les
    # documents recalculent le libellé dans la langue du lecteur, via
    # `reports/service.py::period_label()`.
    period_label: Mapped[str] = mapped_column(String(50), nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=str(ReportStatus.DRAFT)
    )

    # Optionnel : requis (au niveau applicatif) seulement pour bi_mensuel/annuel
    # tant que leur contenu structuré n'est pas spécifié ; absent pour quotidien.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Version anglaise des seuls champs de TEXTE LIBRE, même arborescence que
    # `content` (les énumérations n'ont rien à y faire : elles portent des
    # codes stables, que le frontend et le PDF traduisent déjà par catalogue).
    #
    # Un rapport est le texte le plus personnel de la plateforme, et il est lu
    # par les parents — dont les anglophones. Le laisser en français revenait à
    # leur refuser ce que l'établissement écrit sur leur propre enfant.
    #
    # NULL ou champ absent = pas traduit : la lecture retombe sur le français
    # CHAMP PAR CHAMP, jamais rapport entier. Une observation ajoutée après une
    # panne s'affiche en français sans faire basculer tout le bulletin.
    # ⚠️ `none_as_null` : sans lui, SQLAlchemy écrit un `null` JSON (la VALEUR
    # null) et non un NULL SQL — si bien qu'un `WHERE content_en IS NULL` ne
    # ramène rien alors que la colonne paraît vide côté Python. Piège vécu.
    content_en: Mapped[dict | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    summary_en: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Reste-t-il du texte à traduire ? Dérivé, recalculé à chaque tentative,
    # jamais saisi.
    #
    # Les menus s'en passent (leur fenêtre utile tient en quelques lignes, un
    # filtre Python suffit). Pour les rapports, le volume est tout autre — un
    # quotidien par enfant et par jour — et le balayage doit rester exact ET
    # bon marché. Un `content_en IS NULL` ne l'aurait pas été : il rate les
    # rapports PARTIELLEMENT traduits, ceux qu'une panne en cours de
    # modification laisse derrière elle.
    translation_pending: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true", default=True, index=True
    )

    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    validated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejected_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    child: Mapped["Child"] = relationship(lazy="selectin")
    department: Mapped["Department"] = relationship(lazy="selectin")
    group: Mapped["Group | None"] = relationship(lazy="selectin")
    created_by: Mapped["User"] = relationship(
        foreign_keys=[created_by_id], lazy="selectin"
    )
    validated_by: Mapped["User | None"] = relationship(
        foreign_keys=[validated_by_id], lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Report {self.report_type} {self.status} child={self.child_id}>"


class ReportRead(Base):
    """Accusé de lecture d'un parent sur un rapport publié."""

    __tablename__ = "report_reads"
    __table_args__ = (
        UniqueConstraint("report_id", "parent_id", name="uq_report_read"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    parent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ReportAttachment(Base):
    """Photo ou vidéo de la journée — table dédiée (pas de polymorphisme avec
    les pièces jointes de la messagerie : modules indépendants, pas de FK
    croisée entre eux)."""

    __tablename__ = "report_attachments"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"),
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
    # Pas de FK inverse pré-existante — ajoutée pour le module Galerie, qui a
    # besoin de remonter à l'enfant/département/groupe depuis une pièce jointe
    # sans requête séparée par élément listé.
    report: Mapped["Report"] = relationship(lazy="selectin")

    def __repr__(self) -> str:
        return f"<ReportAttachment {self.filename}>"
