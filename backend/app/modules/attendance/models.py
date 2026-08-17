"""
Présences : scan QR, journal d'événements, paramètres par département/établissement.

  AttendanceEvent — un log append-only. Chaque scan crée une ligne, jamais de
  mise à jour : présence/retard/absence du jour sont CALCULÉS à la volée à
  partir de ces événements (cf. attendance/service.py), pas stockés.

  Exactement une des deux FK (child_id / staff_id) est renseignée — imposé par
  une contrainte CHECK en base, en plus de la validation applicative.
"""

import uuid
from datetime import datetime, time
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
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
    from app.modules.organization.models import Department


class PersonType(StrEnum):
    CHILD = "child"
    STAFF = "staff"


class EventType(StrEnum):
    ARRIVAL   = "arrival"
    DEPARTURE = "departure"
    MEAL      = "meal"   # Staff uniquement — pas de cantine pour les enfants


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

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
