import uuid
from datetime import date as date_, datetime, time
from enum import StrEnum
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.attendance.models import EventType, ExemptionScope, ExemptionState, PersonType
from app.core.i18n import t


def _validate_timezone(v: str) -> str:
    try:
        ZoneInfo(v)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(t("validation.timezone_unknown", value=v)) from exc
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


# ── Correction manuelle (admin ou attendance:write) ───────────────
class ManualEventRequest(BaseModel):
    """Saisie manuelle (arrivée/départ — cantine aussi pour le staff) quand le
    scan est faux ou absent.

    `date` + `time` sont interprétés dans le fuseau horaire configuré de
    l'établissement (UTC par défaut). `scanned_by` = l'auteur de la correction.
    """

    person_type: PersonType
    child_id: uuid.UUID | None = None
    staff_id: uuid.UUID | None = None
    event_type: EventType = Field(description="arrival, departure — ou meal pour le staff uniquement")
    date: date_
    time: time
    companion_name:  str | None = Field(default=None, max_length=200)
    companion_phone: str | None = Field(default=None, max_length=20)


class UpdateEventRequest(BaseModel):
    """Rectification d'une ligne existante — seule l'heure change, jamais le
    type d'événement ni la personne (cohérence du journal préservée)."""

    scanned_at: datetime = Field(description="Nouvelle heure (aware de préférence ; naïve = fuseau établissement)")


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
    nickname:   str | None = None


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
    timezone: str = "UTC"
    items: list[AttendanceEventResponse]


# ── Tableaux de bord journaliers ─────────────────────────────────
class DailyStatus(BaseModel):
    """present | late | absent — absent seulement pour un jour ouvré passé/présent."""
    status:       str
    arrival_time: datetime | None
    departure_time: datetime | None
    late_minutes: int | None   # None = pas de retard calculable (pas d'horaire configuré)
    #: ⚠️ Porté par la classe de BASE : les enfants sont exemptables depuis
    #: l'arrivée des périodes, et le champ n'existait que côté personnel. Deux
    #: déclarations jumelles seraient deux occasions de n'en corriger qu'une.
    exempt:       bool = False


class ChildDailyStatus(DailyStatus):
    child: PersonBrief


class StaffDailyStatus(DailyStatus):
    staff:      PersonBrief
    meal_taken: bool


class ChildDailyStatusListResponse(BaseModel):
    date:     date_
    timezone: str = "UTC"
    total: int
    items: list[ChildDailyStatus]


class StaffDailyStatusListResponse(BaseModel):
    date:     date_
    timezone: str = "UTC"
    total: int
    items: list[StaffDailyStatus]


# ── Paramètres ──────────────────────────────────────────────────
class AttendanceSettingsRequest(BaseModel):
    expected_arrival_time:   time
    expected_departure_time: time

    @model_validator(mode="after")
    def check_order(self) -> "AttendanceSettingsRequest":
        if self.expected_departure_time <= self.expected_arrival_time:
            raise ValueError(t("validation.departure_before_arrival"))
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
    late_grace_minutes:             int = Field(default=0, ge=0, le=120)

    _check_timezone = field_validator("timezone")(_validate_timezone)

    @model_validator(mode="after")
    def check_order(self) -> "AttendanceGeneralSettingsRequest":
        if self.staff_expected_departure_time <= self.staff_expected_arrival_time:
            raise ValueError(t("validation.departure_before_arrival"))
        return self


class AttendanceGeneralSettingsResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:                              uuid.UUID
    establishment_id:                uuid.UUID
    timezone:                        str
    staff_expected_arrival_time:     time
    staff_expected_departure_time:   time
    late_grace_minutes:              int = 0


# ── Horaires personnalisés (staff) ───────────────────────────────
class StaffScheduleRequest(BaseModel):
    """Horaire personnalisé d'un membre du personnel — surcharge l'horaire
    général de l'établissement dès qu'il est posé."""

    expected_arrival_time:   time
    expected_departure_time: time

    @model_validator(mode="after")
    def check_order(self) -> "StaffScheduleRequest":
        if self.expected_departure_time <= self.expected_arrival_time:
            raise ValueError(t("validation.departure_before_arrival"))
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
    """Une ligne de l'export : statut agrégé d'une personne pour UN jour.

    Structure interne (jamais sérialisée vers un client) : elle porte des
    CODES, le rendu PDF/Excel posant les libellés dans la langue du document.
    """

    person_type:    str            # code : "child" | "staff"
    name:           str
    matricule:      str | None
    date:           date_
    status:         str            # code : present | late | absent | not_expected | exempt
    arrival_time:   datetime | None
    departure_time: datetime | None
    late_minutes:   int | None
    meal_taken:     bool | None


# ── Enquête d'absence (parents des absents) ─────────────────────
class AbsentNotifiedParent(BaseModel):
    parent_name: str
    children_names: list[str]
    email_sent: bool
    message_sent: bool


class AbsenceInquiryResponse(BaseModel):
    date: date_
    total_absent: int
    notified: list[AbsentNotifiedParent]
    skipped_no_parent: list[str]
    already_notified: list[str]


# ── Exemptions (personnel, enfant, section) ─────────────────────
class ExemptionPeriod(BaseModel):
    """Bornes INCLUSES. `None` à gauche = depuis toujours, `None` à droite =
    sans fin — c'est ce qu'exprimait l'ancien booléen de personnel, et il faut
    pouvoir continuer à le dire."""

    starts_on: date_ | None = None
    ends_on:   date_ | None = None
    reason:    str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def check_period(self) -> "ExemptionPeriod":
        if (
            self.starts_on is not None
            and self.ends_on is not None
            and self.ends_on < self.starts_on
        ):
            raise ValueError(t("validation.end_before_start"))
        return self


class ExemptionCreateRequest(ExemptionPeriod):
    """⚠️ `scope` décide lequel des trois identifiants est exigé — un seul, et
    celui-là. Laisser les trois facultatifs côté type puis trancher ici évite
    trois schémas jumeaux, donc trois occasions de n'en corriger que deux."""

    scope:      ExemptionScope
    staff_id:   uuid.UUID | None = None
    child_id:   uuid.UUID | None = None
    section_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def check_target(self) -> "ExemptionCreateRequest":
        attendu = {
            ExemptionScope.STAFF:   "staff_id",
            ExemptionScope.CHILD:   "child_id",
            ExemptionScope.SECTION: "section_id",
        }[self.scope]
        fournis = [
            nom
            for nom in ("staff_id", "child_id", "section_id")
            if getattr(self, nom) is not None
        ]
        if fournis != [attendu]:
            raise ValueError(
                t("validation.exemption_target", scope=str(self.scope), field=attendu)
            )
        return self


class ExemptionUpdateRequest(ExemptionPeriod):
    """⚠️ La période est REMPLACÉE en entier, jamais fusionnée — même contrat
    que `PATCH /menus/{week_start}`.

    Une fusion partielle demanderait de distinguer « champ absent » de « champ
    mis à None », et `None` est ici une valeur pleine de sens (sans fin). Le
    sentinelle que ça imposerait coûterait plus cher en surprises qu'un corps
    complet n'en coûte à écrire.

    La PORTÉE, elle, ne se modifie pas : déplacer une exemption d'un enfant à
    un autre, c'est en annuler une et en créer une autre.
    """


class ExemptionResponse(BaseModel):
    id:         uuid.UUID
    scope:      ExemptionScope
    staff_id:   uuid.UUID | None
    child_id:   uuid.UUID | None
    section_id: uuid.UUID | None

    #: Ce que l'écran affiche. Résolu côté serveur : la règle du surnom
    #: (« Tata Victoire ») vit dans `app.core.people`, pas dans chaque liste.
    target_name:  str
    #: Section de l'enfant — contexte utile pour distinguer deux homonymes, et
    #: pour comprendre pourquoi un enfant est couvert sans l'être nommément.
    section_name: str | None = None

    starts_on: date_ | None
    ends_on:   date_ | None
    reason:    str | None
    is_active: bool

    #: ⚠️ DÉRIVÉ des dates, jamais lu en base — rien n'est éteint à l'échéance
    #: (cf. la docstring du modèle). C'est ce champ qui fait lire « Expirée »
    #: dans la liste sans que l'historique de l'export bouge.
    state: ExemptionState


class ExemptionListResponse(BaseModel):
    total: int
    items: list[ExemptionResponse]
