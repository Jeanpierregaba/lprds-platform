"""
Présences : scan QR, journal d'événements, paramètres par département/établissement.

  AttendanceEvent — un log append-only. Chaque scan crée une ligne, jamais de
  mise à jour : présence/retard/absence du jour sont CALCULÉS à la volée à
  partir de ces événements (cf. attendance/service.py), pas stockés.

  Exactement une des deux FK (child_id / staff_id) est renseignée — imposé par
  une contrainte CHECK en base, en plus de la validation applicative.
"""

import uuid
from datetime import date as date_, datetime, time
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Time,
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
    from app.modules.organization.models import Department, Section


class PersonType(StrEnum):
    CHILD = "child"
    STAFF = "staff"


class EventType(StrEnum):
    ARRIVAL   = "arrival"
    DEPARTURE = "departure"
    MEAL      = "meal"   # Staff uniquement — pas de cantine pour les enfants


class ExemptionScope(StrEnum):
    """Qui une exemption couvre — et par quel chemin.

    SECTION est le chemin PRINCIPAL pour les enfants : on dispense une classe
    entière (sortie, fermeture, semaine de stage), pas vingt enfants un par un.
    CHILD reste nécessaire pour le cas particulier — un enfant en convalescence
    dans une section qui, elle, fonctionne normalement.
    """

    STAFF   = "staff"
    CHILD   = "child"
    SECTION = "section"


class ExemptionState(StrEnum):
    """État DÉRIVÉ d'une exemption, jamais stocké — cf. AttendanceExemption."""

    UPCOMING = "upcoming"   # période à venir
    ACTIVE   = "active"     # couvre aujourd'hui
    EXPIRED  = "expired"    # période passée
    REVOKED  = "revoked"    # annulée à la main


class AttendanceEvent(Base):
    __tablename__ = "attendance_events"
    __table_args__ = (
        CheckConstraint(
            "(person_type = 'child' AND child_id IS NOT NULL AND staff_id IS NULL) "
            "OR (person_type = 'staff' AND staff_id IS NOT NULL AND child_id IS NULL)",
            name="ck_attendance_event_person",
        ),
        CheckConstraint(
            "event_type != 'meal' OR person_type = 'staff'",
            name="ck_attendance_meal_staff_only",
        ),
        Index("ix_attendance_events_establishment_scanned_at", "establishment_id", "scanned_at"),
        Index("ix_attendance_events_child_scanned_at", "child_id", "scanned_at"),
        Index("ix_attendance_events_staff_scanned_at", "staff_id", "scanned_at"),
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

    person_type: Mapped[str] = mapped_column(String(10), nullable=False)
    child_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("children.id", ondelete="CASCADE"), nullable=True
    )
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )

    event_type: Mapped[str] = mapped_column(String(10), nullable=False)
    scanned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    scanned_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Accompagnateur — pertinent seulement pour un enfant (arrivée/départ)
    companion_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    companion_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    establishment: Mapped["Establishment"] = relationship(lazy="selectin")
    child: Mapped["Child | None"] = relationship(
        foreign_keys=[child_id], lazy="selectin"
    )
    staff: Mapped["User | None"] = relationship(
        foreign_keys=[staff_id], lazy="selectin"
    )
    scanned_by: Mapped["User"] = relationship(
        foreign_keys=[scanned_by_id], lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<AttendanceEvent {self.person_type}:{self.event_type} @ {self.scanned_at}>"


class StaffAttendanceSchedule(Base):
    """
    Horaire personnalisé d'un membre du personnel.

    Par défaut, tout le personnel partage l'horaire général de l'établissement
    (AttendanceSettings.staff_expected_arrival_time / departure_time). Dès
    qu'une ligne existe ici pour un staff, elle SURCHARGE ce défaut pour le
    calcul de retard/absence de ce membre. Supprimer la ligne = revenir à
    l'horaire général.
    """

    __tablename__ = "staff_attendance_schedules"
    __table_args__ = (
        UniqueConstraint("staff_id", name="uq_staff_attendance_schedule"),
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
    staff_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    expected_arrival_time: Mapped[time] = mapped_column(Time, nullable=False)
    expected_departure_time: Mapped[time] = mapped_column(Time, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    staff: Mapped["User"] = relationship(lazy="selectin")


class DepartmentAttendanceSettings(Base):
    """Horaires normaux d'un département — utilisés pour le retard des enfants."""

    __tablename__ = "department_attendance_settings"
    __table_args__ = (
        UniqueConstraint("department_id", name="uq_dept_attendance_settings"),
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
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
    )
    expected_arrival_time: Mapped[time] = mapped_column(Time, nullable=False)
    expected_departure_time: Mapped[time] = mapped_column(Time, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    department: Mapped["Department"] = relationship(lazy="selectin")


class AttendanceSettings(Base):
    """
    Paramètres généraux du module présences — un seul jeu par établissement.

    Contient le fuseau horaire (utilisé pour calculer le retard des enfants
    ET du staff) ainsi que les horaires normaux du personnel : **tout le
    personnel partage les mêmes horaires attendus** — contrairement aux
    enfants, dont les horaires sont définis par département
    (cf. DepartmentAttendanceSettings). Le staff n'est d'ailleurs rattaché à
    aucun département dans le modèle actuel : une découpe par département
    serait de toute façon impossible sans ce lien.
    """

    __tablename__ = "attendance_settings"
    __table_args__ = (
        UniqueConstraint("establishment_id", name="uq_attendance_settings"),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    establishment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("establishments.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Nom de fuseau IANA (ex: "Africa/Porto-Novo"), validé via zoneinfo côté API.
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="UTC")
    staff_expected_arrival_time: Mapped[time] = mapped_column(Time, nullable=False)
    staff_expected_departure_time: Mapped[time] = mapped_column(Time, nullable=False)
    # Tolérance (minutes) avant qu'une arrivée tardive compte « en retard ».
    # 0 = aucun pardon (comportement historique).
    late_grace_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AttendanceExemption(Base):
    """
    Exemption de pointage, sur une PÉRIODE, pour un membre du personnel, un
    enfant ou une section entière.

    ⚠️ **La période est la seule autorité ; rien n'est « éteint » en base à
    l'échéance.** Le statut du jour est calculé à la volée (comme tout le
    module : cf. AttendanceEvent), donc il suffit que la date du jour sorte de
    [starts_on, ends_on] pour que l'exemption cesse de s'appliquer — à la
    seconde où le jour change, sans attendre quoi que ce soit.

    Basculer un drapeau `is_active=False` à l'échéance aurait deux défauts, et
    le second est pire :

    1. l'exemption resterait en force jusqu'au prochain passage du beat (une
       journée entière dans le pire des cas, et indéfiniment si le worker est
       à terre) — un enfant compté « exempté » un jour où il était attendu ;
    2. surtout, l'EXPORT recalcule le passé. Une exemption du 1er au 15
       octobre, éteinte le 16, ferait réapparaître ces quinze jours en
       « absent » : une tâche de fond réécrirait l'historique.

    La tâche planifiée ne fait donc que NOTIFIER l'admin (`expired_notified_at`
    est son anti-doublon), elle ne décide de rien.

    Les trois gestes ont par conséquent trois sens distincts, et il faut les
    trois :

    | Geste | Effet | Pour quoi |
    |---|---|---|
    | échéance | l'exemption ne couvre plus les jours suivants | fin normale |
    | `ends_on` raccourci | fin anticipée, le passé reste couvert | « finalement il revient lundi » |
    | `is_active=False` | annulation, y compris dans l'historique | « cette ligne est une erreur » |

    Aucune contrainte d'unicité : plusieurs périodes successives (ou
    chevauchantes) pour la même personne sont légitimes, et deux exemptions
    qui se recouvrent ne se contredisent pas — l'une ou l'autre suffit.
    """

    __tablename__ = "attendance_exemptions"
    __table_args__ = (
        CheckConstraint(
            "(scope = 'staff'   AND staff_id   IS NOT NULL AND child_id IS NULL AND section_id IS NULL) "
            "OR (scope = 'child'   AND child_id   IS NOT NULL AND staff_id IS NULL AND section_id IS NULL) "
            "OR (scope = 'section' AND section_id IS NOT NULL AND staff_id IS NULL AND child_id   IS NULL)",
            name="ck_attendance_exemption_target",
        ),
        CheckConstraint(
            "starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on",
            name="ck_attendance_exemption_period",
        ),
        Index("ix_attendance_exemptions_estab_scope", "establishment_id", "scope"),
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

    scope: Mapped[str] = mapped_column(String(10), nullable=False)
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    child_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("children.id", ondelete="CASCADE"), nullable=True
    )
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sections.id", ondelete="CASCADE"), nullable=True
    )

    #: Bornes INCLUSES. NULL à gauche = « depuis toujours », NULL à droite =
    #: « sans fin » — c'est ce que portaient les exemptions de personnel avant
    #: l'arrivée des périodes, et il faut pouvoir continuer à l'exprimer.
    starts_on: Mapped[date_ | None] = mapped_column(Date, nullable=True)
    ends_on: Mapped[date_ | None] = mapped_column(Date, nullable=True)

    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    #: Annulation (cf. docstring) — PAS l'échéance.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    #: Anti-doublon de la notification d'échéance. Renseigné une seule fois,
    #: par la tâche planifiée — un admin ne doit pas relire chaque matin que
    #: l'exemption de mardi dernier est finie.
    expired_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    staff: Mapped["User | None"] = relationship(
        lazy="selectin", foreign_keys=[staff_id]
    )
    child: Mapped["Child | None"] = relationship(lazy="selectin")
    section: Mapped["Section | None"] = relationship(lazy="selectin")

    def covers(self, day: date_) -> bool:
        """L'exemption couvre-t-elle ce jour ? Seule porte du calcul."""
        if not self.is_active:
            return False
        if self.starts_on is not None and day < self.starts_on:
            return False
        if self.ends_on is not None and day > self.ends_on:
            return False
        return True

    def state(self, today: date_) -> ExemptionState:
        if not self.is_active:
            return ExemptionState.REVOKED
        if self.starts_on is not None and today < self.starts_on:
            return ExemptionState.UPCOMING
        if self.ends_on is not None and today > self.ends_on:
            return ExemptionState.EXPIRED
        return ExemptionState.ACTIVE

    def __repr__(self) -> str:
        return f"<AttendanceExemption {self.scope} {self.starts_on}→{self.ends_on}>"
