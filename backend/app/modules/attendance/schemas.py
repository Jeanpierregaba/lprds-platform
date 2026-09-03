import uuid
from datetime import date as date_, datetime, time
from enum import StrEnum
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.attendance.models import EventType, PersonType


def _validate_timezone(v: str) -> str:
    try:
        ZoneInfo(v)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(
            f"Fuseau horaire inconnu : « {v} ». Utilisez un nom IANA, "
            "ex. « Africa/Porto-Novo »"
        ) from exc
    return v


# ── QR code ─────────────────────────────────────────────────────
class QRCodeResponse(BaseModel):
    person_type: PersonType
    matricule:   str
    # Jeton opaque CHIFFRÉ (cf. attendance/qrcode_utils.py) — n'encode jamais le
    # matricule. C'est ce contenu qui doit être encodé dans le QR affiché.
    qr_payload:  str
    # Image PNG prête à l'emploi, encodée en data URI base64.
    qr_image:    str


# ── Scan ────────────────────────────────────────────────────────
class ScanRequest(BaseModel):
    qr_payload:  str = Field(min_length=1, description="Jeton chiffré lu depuis le QR scanné")
    event_type:  EventType
    # Pertinent seulement pour un enfant (arrivée/départ) — ignoré pour le staff.
    companion_name:  str | None = Field(default=None, max_length=200)
    companion_phone: str | None = Field(default=None, max_length=20)


class VerifyQrRequest(BaseModel):
    """Validation du QR au moment du scan — aucun événement créé ici.

    Sert à confirmer que le code est valide et appartient bien à un membre de
    l'établissement, tout en renseignant le frontend sur l'état du jour de la
    personne (déjà arrivé ? déjà parti ? cantine prise ?) pour suggérer le bon
    type d'événement avant toute écriture."""

    qr_payload: str = Field(min_length=1, description="Jeton chiffré lu depuis le QR scanné")


class VerifyQrResponse(BaseModel):
    person_type: PersonType   # child | staff
    matricule:   str | None
    # Nom d'affichage (surnom pour le staff, sinon prénom(s) + nom)
    display_name: str
    # État du jour (calculé à la volée sur les événements du jour) — sert à
    # allumer le bon voyant côté scanneur.
    has_arrived:  bool   # un événement « arrival » existe déjà aujourd'hui
    has_departed: bool   # un événement « departure » existe déjà aujourd'hui
    has_meal:     bool   # staff uniquement : une cantine déjà prise aujourd'hui


class PersonBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:         uuid.UUID
    matricule:  str | None
    last_name:  str
    first_names: str | None = None   # enfant
    first_name:  str | None = None   # staff
    nickname:    str | None = None


class ScannerBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:         uuid.UUID
    first_name: str
    last_name:  str


class AttendanceEventResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:              uuid.UUID
    person_type:     PersonType
    event_type:      EventType
    scanned_at:      datetime
    scanned_by:      ScannerBrief
    companion_name:  str | None
    companion_phone: str | None
    child:           PersonBrief | None
    staff:           PersonBrief | None


class AttendanceEventListResponse(BaseModel):
    total: int
    items: list[AttendanceEventResponse]


# ── Tableaux de bord journaliers ─────────────────────────────────
class DailyStatus(BaseModel):
    """present | late | absent — absent seulement pour un jour ouvré passé/présent."""
    status:       str
    arrival_time: datetime | None
    departure_time: datetime | None
    late_minutes: int | None   # None = pas de retard calculable (pas d'horaire configuré)


class ChildDailyStatus(DailyStatus):
    child: PersonBrief


class StaffDailyStatus(DailyStatus):
    staff:      PersonBrief
    meal_taken: bool
    exempt:     bool


class ChildDailyStatusListResponse(BaseModel):
    date:  date_
    total: int
    items: list[ChildDailyStatus]


class StaffDailyStatusListResponse(BaseModel):
    date:  date_
    total: int
    items: list[StaffDailyStatus]


# ── Paramètres ──────────────────────────────────────────────────
class AttendanceSettingsRequest(BaseModel):
    expected_arrival_time:   time
    expected_departure_time: time

    @model_validator(mode="after")
    def check_order(self) -> "AttendanceSettingsRequest":
        if self.expected_departure_time <= self.expected_arrival_time:
            raise ValueError("L'heure de départ doit être après l'heure d'arrivée")
        return self


class DepartmentAttendanceSettingsResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:                       uuid.UUID
    department_id:            uuid.UUID
    expected_arrival_time:    time
    expected_departure_time:  time


class AttendanceGeneralSettingsRequest(BaseModel):
    """Fuseau horaire de l'établissement + horaires normaux du personnel (uniques,
    partagés par tout le staff — contrairement aux enfants, découpés par
    département)."""

    timezone:                       str = Field(max_length=50)
    staff_expected_arrival_time:    time
    staff_expected_departure_time:  time

    _check_timezone = field_validator("timezone")(_validate_timezone)

    @model_validator(mode="after")
    def check_order(self) -> "AttendanceGeneralSettingsRequest":
        if self.staff_expected_departure_time <= self.staff_expected_arrival_time:
            raise ValueError("L'heure de départ doit être après l'heure d'arrivée")
        return self


class AttendanceGeneralSettingsResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:                              uuid.UUID
    establishment_id:                uuid.UUID
    timezone:                        str
    staff_expected_arrival_time:     time
    staff_expected_departure_time:   time


# ── Horaires personnalisés (staff) ───────────────────────────────
class StaffScheduleRequest(BaseModel):
    """Horaire personnalisé d'un membre du personnel — surcharge l'horaire
    général de l'établissement dès qu'il est posé."""

    expected_arrival_time:   time
    expected_departure_time: time

    @model_validator(mode="after")
    def check_order(self) -> "StaffScheduleRequest":
        if self.expected_departure_time <= self.expected_arrival_time:
            raise ValueError("L'heure de départ doit être après l'heure d'arrivée")
        return self


class StaffScheduleResponse(BaseModel):
    staff_id:                  uuid.UUID
    expected_arrival_time:     time
    expected_departure_time:   time


# ── Export des présences ─────────────────────────────────────────
class ExportFileFormat(StrEnum):
    PDF   = "pdf"
    EXCEL = "excel"


class ExportPersonType(StrEnum):
    CHILDREN = "children"
    STAFF    = "staff"
    BOTH     = "both"


class AttendanceExportRow(BaseModel):
    """Une ligne de l'export : statut agrégé d'une personne pour UN jour."""

    person_type:    str            # libellé : "Enfant" / "Personnel"
    name:           str
    matricule:      str | None
    date:           date_
    status:         str            # libellé FR : Présent / Retard / Absent / Non attendu / Exempté
    arrival_time:   datetime | None
    departure_time: datetime | None
    late_minutes:   int | None
    meal_taken:     bool | None


# ── Exemptions staff ─────────────────────────────────────────────
class StaffExemptionRequest(BaseModel):
    exempt: bool


class StaffExemptionResponse(BaseModel):
    staff_id: uuid.UUID
    exempt:   bool
