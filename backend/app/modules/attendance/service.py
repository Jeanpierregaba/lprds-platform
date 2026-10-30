import asyncio
import logging
import uuid
from datetime import date as date_, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import links
from app.core.redis import redis_client
from app.core.i18n import (
    DEFAULT_LOCALE,
    Locale,
    coerce_locale,
    format_long_date,
    t,
)
from app.core.people import display_name as display_name_of
from app.modules.attendance import email as attendance_email
from app.modules.attendance.models import (
    AttendanceEvent,
    AttendanceExemption,
    AttendanceSettings,
    DepartmentAttendanceSettings,
    EventType,
    ExemptionScope,
    PersonType,
    StaffAttendanceSchedule,
)
from app.modules.attendance.qrcode_utils import (
    decrypt_qr_payload,
    encrypt_qr_payload,
    render_qr_image,
)
from app.modules.attendance.schemas import (
    AbsenceInquiryResponse,
    AbsentNotifiedParent,
    AttendanceEventListResponse,
    AttendanceEventResponse,
    AttendanceExportRow,
    AttendanceGeneralSettingsRequest,
    AttendanceGeneralSettingsResponse,
    AttendanceSettingsRequest,
    ChildDailyStatus,
    ChildDailyStatusListResponse,
    DepartmentAttendanceSettingsResponse,
    ExportFileFormat,
    ExportPersonType,
    ManualEventRequest,
    PersonBrief,
    QRCodeResponse,
    ScanRequest,
    ScannerBrief,
    ExemptionCreateRequest,
    ExemptionListResponse,
    ExemptionResponse,
    ExemptionUpdateRequest,
    StaffDailyStatus,
    StaffDailyStatusListResponse,
    StaffScheduleRequest,
    StaffScheduleResponse,
    UpdateEventRequest,
    VerifyQrRequest,
    VerifyQrResponse,
)
from app.modules.auth.models import User, UserRole
from app.modules.children.models import Child
from app.modules.establishments.models import Establishment
from app.modules.organization import service as org_service
from app.modules.organization.models import Department, Group, Section
from app.modules.parents.models import parent_children
from app.modules.attendance.export import render_attendance_pdf, render_attendance_xlsx

logger = logging.getLogger(__name__)

# ── QR code ─────────────────────────────────────────────────────
async def get_child_qrcode(
    child_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> QRCodeResponse:
    child = await _get_child_or_404(child_id, establishment_id, db)
    token = encrypt_qr_payload(PersonType.CHILD, child.id)
    return QRCodeResponse(
        person_type=PersonType.CHILD,
        matricule=child.matricule,
        qr_payload=token,
        qr_image=render_qr_image(token),
    )


async def get_staff_qrcode(
    staff_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> QRCodeResponse:
    staff = await _get_staff_or_404(staff_id, establishment_id, db)
    token = encrypt_qr_payload(PersonType.STAFF, staff.id)
    return QRCodeResponse(
        person_type=PersonType.STAFF,
        matricule=staff.matricule,
        qr_payload=token,
        qr_image=render_qr_image(token),
    )


# ── Scan ────────────────────────────────────────────────────────
async def scan(
    payload: ScanRequest,
    establishment_id: uuid.UUID,
    scanned_by: User,
    db: AsyncSession,
) -> AttendanceEventResponse:
    person_type, person_id = decrypt_qr_payload(payload.qr_payload)

    # Anti-rebond : même personne + même geste dans les 60 dernières secondes
    # = double-clic ou badge présenté 2 fois (journal append-only oblige, on
    # refuse plutôt que de polluer). Un geste différent reste accepté aussitôt.
    window_start = datetime.now(tz=timezone.utc) - timedelta(seconds=60)
    recent = await db.scalar(
        select(AttendanceEvent.id).where(
            AttendanceEvent.establishment_id == establishment_id,
            AttendanceEvent.event_type == str(payload.event_type),
            (
                (AttendanceEvent.child_id == person_id)
                if person_type == PersonType.CHILD
                else (AttendanceEvent.staff_id == person_id)
            ),
            AttendanceEvent.scanned_at >= window_start,
        )
    )
    if recent:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.attendance.duplicate_scan"),
        )

    if person_type == PersonType.CHILD:
        if payload.event_type == EventType.MEAL:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("errors.attendance.no_meal_for_children"),
            )
        child = await _get_active_child_or_404(person_id, establishment_id, db)
        event = AttendanceEvent(
            establishment_id=establishment_id,
            person_type=str(PersonType.CHILD),
            child_id=child.id,
            event_type=str(payload.event_type),
            scanned_by_id=scanned_by.id,
            companion_name=payload.companion_name,
            companion_phone=payload.companion_phone,
        )
    else:
        if payload.companion_name or payload.companion_phone:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("errors.attendance.no_companion_for_staff"),
            )
        staff = await _get_active_staff_or_404(person_id, establishment_id, db)
        event = AttendanceEvent(
            establishment_id=establishment_id,
            person_type=str(PersonType.STAFF),
            staff_id=staff.id,
            event_type=str(payload.event_type),
            scanned_by_id=scanned_by.id,
        )

    db.add(event)
    await db.flush()
    await db.refresh(event)
    return await _to_event_response(event, db)


# ── Correction manuelle (admin ou attendance:write) ───────────────
async def create_manual_event(
    payload: ManualEventRequest,
    establishment_id: uuid.UUID,
    corrected_by: User,
    db: AsyncSession,
) -> AttendanceEventResponse:
    """Saisie manuelle d'une arrivée/départ : scan faux ou jamais scanné.

    Mêmes gardes que le scan (personne active de l'établissement, pas de
    cantine pour un enfant, pas d'accompagnateur pour le staff) + refus d'une
    heure dans le futur. La ligne porte `scanned_by` = l'auteur de la
    correction, pas un scanneur QR."""
    if payload.event_type == EventType.MEAL and payload.person_type == PersonType.CHILD:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.attendance.no_meal_for_children"),
        )
    tz = await _get_timezone(establishment_id, db)
    scanned_at = datetime.combine(payload.date, payload.time, tzinfo=tz)
    if scanned_at > datetime.now(tz=tz):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.attendance.time_future"),
        )

    if payload.person_type == PersonType.CHILD:
        if not payload.child_id or payload.staff_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("errors.attendance.child_id_required"),
            )
        child = await _get_active_child_or_404(
            payload.child_id, establishment_id, db
        )
        event = AttendanceEvent(
            establishment_id=establishment_id,
            person_type=str(PersonType.CHILD),
            child_id=child.id,
            event_type=str(payload.event_type),
            scanned_at=scanned_at,
            scanned_by_id=corrected_by.id,
            companion_name=payload.companion_name,
            companion_phone=payload.companion_phone,
        )
    else:
        if not payload.staff_id or payload.child_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("errors.attendance.staff_id_required"),
            )
        if payload.companion_name or payload.companion_phone:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("errors.attendance.no_companion_for_staff"),
            )
        staff = await _get_active_staff_or_404(
            payload.staff_id, establishment_id, db
        )
        event = AttendanceEvent(
            establishment_id=establishment_id,
            person_type=str(PersonType.STAFF),
            staff_id=staff.id,
            event_type=str(payload.event_type),
            scanned_at=scanned_at,
            scanned_by_id=corrected_by.id,
        )

    db.add(event)
    await db.flush()
    await db.refresh(event)
    return await _to_event_response(event, db)


async def update_event(
    event_id: uuid.UUID,
    payload: UpdateEventRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> AttendanceEventResponse:
    """Rectifie l'heure d'une ligne existante. Type d'événement et personne
    inchangés — seule l'heure est corrigée (décision produit)."""
    event = await db.scalar(
        select(AttendanceEvent).where(
            AttendanceEvent.id == event_id,
            AttendanceEvent.establishment_id == establishment_id,
        )
    )
    if not event:
        raise HTTPException(status_code=404, detail=t("errors.attendance.event_not_found"))

    scanned_at = payload.scanned_at
    tz = await _get_timezone(establishment_id, db)
    if scanned_at.tzinfo is None:
        scanned_at = scanned_at.replace(tzinfo=tz)
    else:
        scanned_at = scanned_at.astimezone(tz)
    # Même repère que la création manuelle : l'heure locale de
    # l'établissement (pas UTC — écart d'une heure selon le fuseau).
    if scanned_at > datetime.now(tz=tz):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.attendance.time_future"),
        )
    # Cohérence temporelle a minima : une arrivée déplacée après le dernier
    # départ du même jour (ou un départ avant la première arrivée) est
    # refusée — sinon le statut calculé devient absurde.
    day_start, day_end = _local_day_bounds(tz, scanned_at.astimezone(tz).date())
    siblings = (
        await db.execute(
            select(AttendanceEvent).where(
                AttendanceEvent.establishment_id == establishment_id,
                AttendanceEvent.scanned_at >= day_start,
                AttendanceEvent.scanned_at < day_end,
                AttendanceEvent.id != event.id,
                (
                    (AttendanceEvent.child_id == event.child_id)
                    if event.child_id is not None
                    else (AttendanceEvent.staff_id == event.staff_id)
                ),
            )
        )
    ).scalars().all()
    arrivals = sorted(
        e.scanned_at for e in siblings if e.event_type == str(EventType.ARRIVAL)
    )
    departures = sorted(
        e.scanned_at for e in siblings if e.event_type == str(EventType.DEPARTURE)
    )
    if event.event_type == str(EventType.ARRIVAL) and departures and scanned_at > departures[-1]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.attendance.arrival_after_departure"),
        )
    if event.event_type == str(EventType.DEPARTURE) and arrivals and scanned_at < arrivals[0]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.attendance.departure_before_arrival"),
        )
    event.scanned_at = scanned_at
    await db.flush()
    await db.refresh(event)
    return await _to_event_response(event, db)


# ── Vérification du QR (avant tout scan) ──────────────────────────
async def verify_qr(
    payload: VerifyQrRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> VerifyQrResponse:
    """Valide un QR scanné et renseigne l'état du jour de la personne, sans
    créer d'événement. Le QR doit déchiffrer, exister et appartenir à un
    membre ACTIF de l'établissement courant."""
    person_type, person_id = decrypt_qr_payload(payload.qr_payload)

    # « Aujourd'hui » dans le fuseau de l'établissement, pas la date serveur
    # (souvent UTC) — sinon l'état du jour répond pour le mauvais jour.
    tz = await _get_timezone(establishment_id, db)
    today = datetime.now(tz=tz).date()
    events_formatted: dict[uuid.UUID, list[AttendanceEvent]] = {}

    if person_type == PersonType.CHILD:
        child = await _get_active_child_or_404(person_id, establishment_id, db)
        display_name = f"{child.first_names} {child.last_name}".strip()
        matricule = child.matricule
        events_formatted = await _events_for_day(
            establishment_id, PersonType.CHILD, today, db, tz
        )
        day_events = events_formatted.get(child.id, [])
        return VerifyQrResponse(
            person_type=PersonType.CHILD,
            matricule=matricule,
            display_name=display_name,
            has_arrived=any(e.event_type == str(EventType.ARRIVAL) for e in day_events),
            has_departed=any(e.event_type == str(EventType.DEPARTURE) for e in day_events),
            has_meal=False,
        )

    staff = await _get_active_staff_or_404(person_id, establishment_id, db)
    display_name = display_name_of(staff)
    events_formatted = await _events_for_day(
        establishment_id, PersonType.STAFF, today, db, tz
    )
    day_events = events_formatted.get(staff.id, [])
    return VerifyQrResponse(
        person_type=PersonType.STAFF,
        matricule=staff.matricule,
        display_name=display_name,
        has_arrived=any(e.event_type == str(EventType.ARRIVAL) for e in day_events),
        has_departed=any(e.event_type == str(EventType.DEPARTURE) for e in day_events),
        has_meal=any(e.event_type == str(EventType.MEAL) for e in day_events),
    )


# ── Journal des événements ────────────────────────────────────────
async def list_events(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    person_type: PersonType | None = None,
    child_id: uuid.UUID | None = None,
    staff_id: uuid.UUID | None = None,
    date_from: date_ | None = None,
    date_to: date_ | None = None,
    skip: int = 0,
    limit: int = 50,
) -> AttendanceEventListResponse:
    filters = [AttendanceEvent.establishment_id == establishment_id]
    if person_type:
        filters.append(AttendanceEvent.person_type == str(person_type))
    if child_id:
        exists = await db.scalar(
            select(Child.id).where(
                Child.id == child_id, Child.establishment_id == establishment_id
            )
        )
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.child_not_found"))
        filters.append(AttendanceEvent.child_id == child_id)
    if staff_id:
        exists = await db.scalar(
            select(User.id).where(
                User.id == staff_id,
                User.establishment_id == establishment_id,
                User.role == UserRole.STAFF,
            )
        )
        if not exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=t("errors.common.staff_not_found"),
            )
        filters.append(AttendanceEvent.staff_id == staff_id)
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.attendance.start_after_end"),
        )
    tz = await _get_timezone(establishment_id, db)
    if date_from:
        start, _ = _local_day_bounds(tz, date_from)
        filters.append(AttendanceEvent.scanned_at >= start)
    if date_to:
        _, end = _local_day_bounds(tz, date_to)
        filters.append(AttendanceEvent.scanned_at < end)

    total = await db.scalar(
        select(func.count()).select_from(AttendanceEvent).where(*filters)
    )
    result = await db.execute(
        select(AttendanceEvent)
        .where(*filters)
        .order_by(AttendanceEvent.scanned_at.desc())
        .offset(skip)
        .limit(limit)
    )
    events = result.scalars().all()
    return AttendanceEventListResponse(
        total=total or 0,
        timezone=str(tz),
        items=[await _to_event_response(e, db) for e in events],
    )


# ── Exemptions : l'index, seule porte du calcul ──────────────────
class _ExemptionIndex:
    """Les exemptions d'un établissement, prêtes à répondre « ce jour-là ? ».

    ⚠️ **Chargé une fois pour toute une PÉRIODE**, puis interrogé jour par
    jour en mémoire. L'export parcourt jusqu'à 366 jours : une requête par
    jour ferait 366 allers-retours là où un seul suffit, et le découpage
    serait de toute façon le même.

    ⚠️ Une seule implémentation pour les TROIS lieux qui décident d'un statut
    — tableau de bord des enfants, tableau de bord du personnel, export. Les
    écrire trois fois, c'était trois occasions d'oublier la section quelque
    part, et le symptôme serait un enfant « absent » dans l'export et
    « exempté » à l'écran le même jour.
    """

    def __init__(self, rows: list[AttendanceExemption]) -> None:
        self._staff: dict[uuid.UUID, list[AttendanceExemption]] = {}
        self._child: dict[uuid.UUID, list[AttendanceExemption]] = {}
        self._section: dict[uuid.UUID, list[AttendanceExemption]] = {}
        for row in rows:
            if row.scope == str(ExemptionScope.STAFF) and row.staff_id:
                self._staff.setdefault(row.staff_id, []).append(row)
            elif row.scope == str(ExemptionScope.CHILD) and row.child_id:
                self._child.setdefault(row.child_id, []).append(row)
            elif row.scope == str(ExemptionScope.SECTION) and row.section_id:
                self._section.setdefault(row.section_id, []).append(row)

    def covers_staff(self, staff_id: uuid.UUID, day: date_) -> bool:
        return any(e.covers(day) for e in self._staff.get(staff_id, ()))

    def covers_child(
        self, child_id: uuid.UUID, section_id: uuid.UUID | None, day: date_
    ) -> bool:
        """Un enfant est couvert par SA propre exemption OU par celle de sa
        section — un OU, jamais une exclusion.

        La section est le chemin principal (on dispense une classe entière) ;
        l'exemption nominative reste là pour le cas particulier. Prévoir en
        plus de RETIRER un enfant d'une section exemptée n'a pas été demandé,
        et inventer une exception à l'exception rendrait la règle illisible.
        """
        if any(e.covers(day) for e in self._child.get(child_id, ())):
            return True
        if section_id is None:
            return False
        return any(e.covers(day) for e in self._section.get(section_id, ()))


async def _load_exemptions(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    date_from: date_,
    date_to: date_,
) -> _ExemptionIndex:
    """Les exemptions qui CHEVAUCHENT la période — bornes NULL incluses.

    ⚠️ `is_active` est filtré ici et retesté dans `covers()` : la requête
    réduit le volume, le modèle reste la seule autorité. Si l'une des deux
    disparaissait, l'autre tiendrait encore.
    """
    rows = (
        await db.execute(
            select(AttendanceExemption).where(
                AttendanceExemption.establishment_id == establishment_id,
                AttendanceExemption.is_active.is_(True),
                (AttendanceExemption.starts_on.is_(None))
                | (AttendanceExemption.starts_on <= date_to),
                (AttendanceExemption.ends_on.is_(None))
                | (AttendanceExemption.ends_on >= date_from),
            )
        )
    ).scalars().all()
    return _ExemptionIndex(list(rows))


# ── Tableaux de bord journaliers ─────────────────────────────────
async def get_children_daily_status(
    establishment_id: uuid.UUID,
    target_date: date_,
    db: AsyncSession,
    *,
    department_id: uuid.UUID | None = None,
    section_id: uuid.UUID | None = None,
    group_ids: list[uuid.UUID] | None = None,
) -> ChildDailyStatusListResponse:
    filters = [Child.establishment_id == establishment_id, Child.is_active.is_(True)]
    if department_id:
        # 404 si hors établissement (pas un vide silencieux) — même
        # discipline que le reste du projet.
        await org_service.get_or_404(Department, department_id, establishment_id, db)
        filters.append(Child.department_id == department_id)
    if section_id:
        await org_service.get_or_404(Section, section_id, establishment_id, db)
        filters.append(Child.section_id == section_id)
    if group_ids is not None:
        if not group_ids:
            return ChildDailyStatusListResponse(date=target_date, total=0, items=[])
        filters.append(Child.group_id.in_(group_ids))
    children = (await db.execute(select(Child).where(*filters))).scalars().all()

    tz = await _get_timezone(establishment_id, db)
    general_settings = await _get_general_settings(establishment_id, db)
    grace = general_settings.late_grace_minutes if general_settings else 0
    events_by_child = await _events_for_day(
        establishment_id, PersonType.CHILD, target_date, db, tz
    )
    settings_by_dept = await _department_settings_map(establishment_id, db)
    exemptions = await _load_exemptions(
        establishment_id, db, date_from=target_date, date_to=target_date
    )
    weekday = _is_weekday(target_date)

    items = []
    for child in children:
        events = events_by_child.get(child.id, [])
        arrival = _earliest(events, EventType.ARRIVAL)
        departure = _latest(events, EventType.DEPARTURE)
        dept_settings = settings_by_dept.get(child.department_id) if child.department_id else None
        expected = dept_settings.expected_arrival_time if dept_settings else None
        exempt = exemptions.covers_child(child.id, child.section_id, target_date)
        # Exempté ET venu quand même : on calcule normalement. Une exemption
        # dispense de pointer, elle n'efface pas un pointage — le même choix
        # que pour le personnel depuis l'origine.
        if exempt and arrival is None:
            status_, late_minutes = "exempt", None
        else:
            status_, late_minutes = _compute_status(arrival, weekday, expected, tz, grace)
        items.append(
            ChildDailyStatus(
                child=_child_brief(child),
                status=status_,
                arrival_time=arrival,
                departure_time=departure,
                late_minutes=late_minutes,
                exempt=exempt,
            )
        )
    return ChildDailyStatusListResponse(
        date=target_date, timezone=str(tz), total=len(items), items=items
    )


async def get_my_group_daily_status(
    staff_id: uuid.UUID,
    establishment_id: uuid.UUID,
    target_date: date_,
    db: AsyncSession,
) -> ChildDailyStatusListResponse:
    """« Présence » du portail staff — statut du jour des enfants du/des
    groupe(s) menés par l'educatrice. Hors RBAC, comme Mon Groupe."""
    led_group_ids = (
        await db.execute(
            select(Group.id).where(
                Group.educatrice_id == staff_id, Group.is_active.is_(True)
            )
        )
    ).scalars().all()
    return await get_children_daily_status(
        establishment_id, target_date, db, group_ids=list(led_group_ids)
    )


async def get_staff_daily_status(
    establishment_id: uuid.UUID,
    target_date: date_,
    db: AsyncSession,
) -> StaffDailyStatusListResponse:
    staff_members = (
        await db.execute(
            select(User).where(
                User.establishment_id == establishment_id,
                User.role == UserRole.STAFF,
                User.is_active.is_(True),
            )
        )
    ).scalars().all()

    general_settings = await _get_general_settings(establishment_id, db)
    tz = _tz_of(general_settings)
    grace = general_settings.late_grace_minutes if general_settings else 0
    events_by_staff = await _events_for_day(
        establishment_id, PersonType.STAFF, target_date, db, tz
    )
    schedule_map = await _staff_schedule_map(establishment_id, db)
    exemptions = await _load_exemptions(
        establishment_id, db, date_from=target_date, date_to=target_date
    )
    weekday = _is_weekday(target_date)

    items = []
    for member in staff_members:
        events = events_by_staff.get(member.id, [])
        arrival = _earliest(events, EventType.ARRIVAL)
        departure = _latest(events, EventType.DEPARTURE)
        meal_taken = any(e.event_type == str(EventType.MEAL) for e in events)

        # Horaire personnalisé prioritaire ; repli sur l'horaire général.
        schedule = schedule_map.get(member.id)
        expected = (
            schedule.expected_arrival_time
            if schedule
            else (general_settings.staff_expected_arrival_time if general_settings else None)
        )

        exempt = exemptions.covers_staff(member.id, target_date)
        if exempt and arrival is None:
            status_, late_minutes = "exempt", None
        else:
            status_, late_minutes = _compute_status(arrival, weekday, expected, tz, grace)

        items.append(
            StaffDailyStatus(
                staff=_staff_brief(member),
                status=status_,
                arrival_time=arrival,
                departure_time=departure,
                late_minutes=late_minutes,
                meal_taken=meal_taken,
                exempt=exempt,
            )
        )
    return StaffDailyStatusListResponse(
        date=target_date, timezone=str(tz), total=len(items), items=items
    )


# ── Paramètres : département (enfants) ───────────────────────────
async def upsert_department_settings(
    department_id: uuid.UUID,
    payload: AttendanceSettingsRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> DepartmentAttendanceSettingsResponse:
    await org_service.get_or_404(Department, department_id, establishment_id, db)

    # Upsert atomique (ON CONFLICT) : 2 PUT concurrents ne violent plus la
    # contrainte d'unicité en 500.
    stmt = (
        pg_insert(DepartmentAttendanceSettings)
        .values(
            establishment_id=establishment_id,
            department_id=department_id,
            expected_arrival_time=payload.expected_arrival_time,
            expected_departure_time=payload.expected_departure_time,
        )
        .on_conflict_do_update(
            index_elements=["department_id"],
            set_={
                "expected_arrival_time": payload.expected_arrival_time,
                "expected_departure_time": payload.expected_departure_time,
            },
        )
        .returning(DepartmentAttendanceSettings)
    )
    result = await db.execute(stmt)
    settings = result.scalar_one()
    await db.flush()
    return DepartmentAttendanceSettingsResponse.model_validate(settings)


async def get_department_settings(
    department_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> DepartmentAttendanceSettingsResponse:
    await org_service.get_or_404(Department, department_id, establishment_id, db)
    settings = await db.scalar(
        select(DepartmentAttendanceSettings).where(
            DepartmentAttendanceSettings.department_id == department_id
        )
    )
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.attendance.no_department_schedule"),
        )
    return DepartmentAttendanceSettingsResponse.model_validate(settings)


# ── Paramètres généraux : fuseau horaire + horaires du personnel ──
async def upsert_general_settings(
    payload: AttendanceGeneralSettingsRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> AttendanceGeneralSettingsResponse:
    stmt = (
        pg_insert(AttendanceSettings)
        .values(
            establishment_id=establishment_id,
            timezone=payload.timezone,
            staff_expected_arrival_time=payload.staff_expected_arrival_time,
            staff_expected_departure_time=payload.staff_expected_departure_time,
            late_grace_minutes=payload.late_grace_minutes,
        )
        .on_conflict_do_update(
            index_elements=["establishment_id"],
            set_={
                "timezone": payload.timezone,
                "staff_expected_arrival_time": payload.staff_expected_arrival_time,
                "staff_expected_departure_time": payload.staff_expected_departure_time,
                "late_grace_minutes": payload.late_grace_minutes,
            },
        )
        .returning(AttendanceSettings)
    )
    result = await db.execute(stmt)
    settings = result.scalar_one()
    await db.flush()
    return AttendanceGeneralSettingsResponse.model_validate(settings)


async def get_general_settings(
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> AttendanceGeneralSettingsResponse:
    settings = await _get_general_settings(establishment_id, db)
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.attendance.no_settings"),
        )
    return AttendanceGeneralSettingsResponse.model_validate(settings)


# ── Horaires personnalisés (staff) ───────────────────────────────
async def upsert_staff_schedule(
    staff_id: uuid.UUID,
    payload: StaffScheduleRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> StaffScheduleResponse:
    """Pose (ou remplace) l'horaire personnalisé d'un membre du personnel."""
    staff = await _get_staff_or_404(staff_id, establishment_id, db)
    stmt = (
        pg_insert(StaffAttendanceSchedule)
        .values(
            establishment_id=establishment_id,
            staff_id=staff.id,
            expected_arrival_time=payload.expected_arrival_time,
            expected_departure_time=payload.expected_departure_time,
        )
        .on_conflict_do_update(
            index_elements=["staff_id"],
            set_={
                "expected_arrival_time": payload.expected_arrival_time,
                "expected_departure_time": payload.expected_departure_time,
            },
        )
        .returning(StaffAttendanceSchedule)
    )
    result = await db.execute(stmt)
    schedule = result.scalar_one()
    await db.flush()
    return StaffScheduleResponse(
        staff_id=staff.id,
        expected_arrival_time=schedule.expected_arrival_time,
        expected_departure_time=schedule.expected_departure_time,
    )


async def get_staff_schedule(
    staff_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> StaffScheduleResponse:
    staff = await _get_staff_or_404(staff_id, establishment_id, db)
    schedule = await db.scalar(
        select(StaffAttendanceSchedule).where(StaffAttendanceSchedule.staff_id == staff_id)
    )
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.attendance.no_staff_schedule"),
        )
    return StaffScheduleResponse(
        staff_id=staff.id,
        expected_arrival_time=schedule.expected_arrival_time,
        expected_departure_time=schedule.expected_departure_time,
    )


async def delete_staff_schedule(
    staff_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Supprime l'horaire personnalisé → le staff retombe sur l'horaire général."""
    await _get_staff_or_404(staff_id, establishment_id, db)
    schedule = await db.scalar(
        select(StaffAttendanceSchedule).where(StaffAttendanceSchedule.staff_id == staff_id)
    )
    if schedule:
        await db.delete(schedule)
        await db.flush()


# ── Export des présences ─────────────────────────────────────────
# Les lignes d'export portent des CODES (`present`, `child`…) ; les libellés
# sont posés par le rendu, dans la langue du document — sans quoi un même
# calcul produirait des documents figés en français.
_FILENAME_SCOPE = {
    ExportPersonType.CHILDREN: "children",
    ExportPersonType.STAFF: "staff",
    ExportPersonType.BOTH: "both",
}


async def get_attendance_export(
    establishment_id: uuid.UUID,
    file_format: ExportFileFormat,
    export_scope: ExportPersonType,
    date_from: date_,
    date_to: date_,
    db: AsyncSession,
    *,
    department_id: uuid.UUID | None = None,
    section_id: uuid.UUID | None = None,
    child_id: uuid.UUID | None = None,
    staff_id: uuid.UUID | None = None,
    locale: Locale = DEFAULT_LOCALE,
) -> tuple[bytes, str]:
    """Construit l'export agrégé (statut par personne × jour) et le rend dans
    le format demandé. Retourne (octets du fichier, nom de fichier).
    `child_id` / `staff_id` restreignent l'export à UNE personne précise
    (exclusifs l'un de l'autre, 422 sinon ; 404 si hors établissement) et
    priment sur `export_scope` / département / section."""
    if date_to < date_from:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.attendance.end_before_start"),
        )
    if (date_to - date_from).days + 1 > 366:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.attendance.range_too_long"),
        )

    establishment = await db.scalar(
        select(Establishment).where(Establishment.id == establishment_id)
    )
    establishment_name = establishment.name if establishment else "Établissement"

    rows = await _build_export_rows(
        establishment_id, export_scope, date_from, date_to, db,
        department_id=department_id, section_id=section_id,
        child_id=child_id, staff_id=staff_id,
    )

    # Extension OS-friendly : l'enum API reste `excel`, mais le fichier
    # téléchargé porte `.xlsx` (double-clic / détection MIME).
    ext = "xlsx" if file_format == ExportFileFormat.EXCEL else file_format.value
    # Nom selon le périmètre EFFECTIF (child_id/staff_id re-scopent en local).
    effective_scope = export_scope
    if child_id:
        effective_scope = ExportPersonType.CHILDREN
    elif staff_id:
        effective_scope = ExportPersonType.STAFF
    scope_label = t(
        f"attendance.export.filename.{_FILENAME_SCOPE[effective_scope]}", locale
    )
    filename = f"{scope_label}_{date_from.isoformat()}_{date_to.isoformat()}.{ext}"
    renderer = (
        render_attendance_pdf
        if file_format == ExportFileFormat.PDF
        else render_attendance_xlsx
    )
    content = await asyncio.to_thread(
        renderer, establishment_name, date_from, date_to, rows, locale
    )
    return content, filename


async def _build_export_rows(
    establishment_id: uuid.UUID,
    export_scope: ExportPersonType,
    date_from: date_,
    date_to: date_,
    db: AsyncSession,
    *,
    department_id: uuid.UUID | None = None,
    section_id: uuid.UUID | None = None,
    child_id: uuid.UUID | None = None,
    staff_id: uuid.UUID | None = None,
) -> list[AttendanceExportRow]:
    if child_id and staff_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.attendance.ids_exclusive"),
        )
    # Export d'une personne précise : on la résout d'abord (404 si hors
    # établissement — on ne révèle pas l'existence, comme partout).
    only_child: Child | None = None
    only_staff: User | None = None
    if child_id:
        only_child = await db.scalar(
            select(Child).where(
                Child.id == child_id, Child.establishment_id == establishment_id
            )
        )
        if not only_child:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.child_not_found")
            )
        export_scope = ExportPersonType.CHILDREN
    if staff_id:
        only_staff = await db.scalar(
            select(User).where(
                User.id == staff_id,
                User.establishment_id == establishment_id,
                User.role == UserRole.STAFF,
            )
        )
        if not only_staff:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.staff_not_found")
            )
        export_scope = ExportPersonType.STAFF

    want_children = export_scope in (ExportPersonType.CHILDREN, ExportPersonType.BOTH)
    want_staff = export_scope in (ExportPersonType.STAFF, ExportPersonType.BOTH)

    children: list[Child] = []
    staff_members: list[User] = []
    if want_children:
        if only_child is not None:
            children = [only_child]
        else:
            filters = [Child.establishment_id == establishment_id, Child.is_active.is_(True)]
            if department_id:
                filters.append(Child.department_id == department_id)
            if section_id:
                filters.append(Child.section_id == section_id)
            children = (await db.execute(select(Child).where(*filters))).scalars().all()
    if want_staff:
        if only_staff is not None:
            staff_members = [only_staff]
        else:
            staff_members = (
                await db.execute(
                    select(User).where(
                        User.establishment_id == establishment_id,
                        User.role == UserRole.STAFF,
                        User.is_active.is_(True),
                    )
                )
            ).scalars().all()

    if not children and not staff_members:
        return []

    general_settings = await _get_general_settings(establishment_id, db)
    tz = _tz_of(general_settings)
    grace = general_settings.late_grace_minutes if general_settings else 0
    dept_settings = await _department_settings_map(establishment_id, db)
    schedule_map = await _staff_schedule_map(establishment_id, db)

    events = await _events_for_range(
        establishment_id, export_scope, date_from, date_to, db, tz
    )
    by_person_day: dict[tuple[uuid.UUID, date_], list[AttendanceEvent]] = {}
    event_child_ids: set[uuid.UUID] = set()
    event_staff_ids: set[uuid.UUID] = set()
    for e in events:
        if e.person_type == str(PersonType.CHILD):
            event_child_ids.add(e.child_id)
            person_id = e.child_id
        else:
            event_staff_ids.add(e.staff_id)
            person_id = e.staff_id
        # Bucket calé sur la journée LOCALE (pas UTC) — cf. _local_day_bounds.
        by_person_day.setdefault((person_id, _local_date(e.scanned_at, tz)), []).append(e)

    # Périmètre complet : les inactifs ayant scanné dans la période sont
    # inclus (sinon leurs scans disparaissent), avec les mêmes filtres
    # département/section que les actifs.
    if want_children and only_child is None:
        known_child_ids = {c.id for c in children}
        extra_child_ids = event_child_ids - known_child_ids
        if extra_child_ids:
            extra_filters = [
                Child.establishment_id == establishment_id,
                Child.id.in_(extra_child_ids),
            ]
            if department_id:
                extra_filters.append(Child.department_id == department_id)
            if section_id:
                extra_filters.append(Child.section_id == section_id)
            children = list(children) + list(
                (await db.execute(select(Child).where(*extra_filters))).scalars().all()
            )
    if want_staff and only_staff is None:
        extra_staff_ids = event_staff_ids - {m.id for m in staff_members}
        if extra_staff_ids:
            staff_members = list(staff_members) + list(
                (await db.execute(
                    select(User).where(
                        User.establishment_id == establishment_id,
                        User.role == UserRole.STAFF,
                        User.id.in_(extra_staff_ids),
                    )
                )).scalars().all()
            )

    # Une seule requête pour toute la période (jusqu'à 366 jours) — cf.
    # _ExemptionIndex.
    exemptions = await _load_exemptions(
        establishment_id, db, date_from=date_from, date_to=date_to
    )

    rows: list[AttendanceExportRow] = []
    current = date_from
    while current <= date_to:
        weekday = _is_weekday(current)

        if want_children:
            for child in children:
                dept = dept_settings.get(child.department_id) if child.department_id else None
                expected = dept.expected_arrival_time if dept else None
                day_events = by_person_day.get((child.id, current), [])
                arrival = _earliest(day_events, EventType.ARRIVAL)
                departure = _latest(day_events, EventType.DEPARTURE)
                if arrival is None and exemptions.covers_child(
                    child.id, child.section_id, current
                ):
                    status_, late = "exempt", None
                else:
                    status_, late = _compute_status(arrival, weekday, expected, tz, grace)
                rows.append(AttendanceExportRow(
                    person_type="child",
                    name=f"{child.first_names} {child.last_name}".strip(),
                    matricule=child.matricule,
                    date=current,
                    status=status_,
                    arrival_time=_to_local(arrival, tz),
                    departure_time=_to_local(departure, tz),
                    late_minutes=late,
                    meal_taken=None,
                ))

        if want_staff:
            for member in staff_members:
                schedule = schedule_map.get(member.id)
                expected = (
                    schedule.expected_arrival_time
                    if schedule
                    else (general_settings.staff_expected_arrival_time if general_settings else None)
                )
                day_events = by_person_day.get((member.id, current), [])
                arrival = _earliest(day_events, EventType.ARRIVAL)
                departure = _latest(day_events, EventType.DEPARTURE)
                meal_taken = any(e.event_type == str(EventType.MEAL) for e in day_events)
                if arrival is None and exemptions.covers_staff(member.id, current):
                    status_, late = "exempt", None
                else:
                    status_, late = _compute_status(arrival, weekday, expected, tz, grace)
                name = display_name_of(member)
                rows.append(AttendanceExportRow(
                    person_type="staff",
                    name=name,
                    matricule=member.matricule,
                    date=current,
                    status=status_,
                    arrival_time=_to_local(arrival, tz),
                    departure_time=_to_local(departure, tz),
                    late_minutes=late,
                    meal_taken=meal_taken,
                ))

        current += timedelta(days=1)

    rows.sort(key=lambda r: (r.person_type, r.name.lower(), r.date))
    return rows


async def _events_for_range(
    establishment_id: uuid.UUID,
    export_scope: ExportPersonType,
    date_from: date_,
    date_to: date_,
    db: AsyncSession,
    tz: ZoneInfo,
) -> list[AttendanceEvent]:
    start, _ = _local_day_bounds(tz, date_from)
    _, end = _local_day_bounds(tz, date_to)
    filters = [
        AttendanceEvent.establishment_id == establishment_id,
        AttendanceEvent.scanned_at >= start,
        AttendanceEvent.scanned_at < end,
    ]
    if export_scope == ExportPersonType.CHILDREN:
        filters.append(AttendanceEvent.person_type == str(PersonType.CHILD))
    elif export_scope == ExportPersonType.STAFF:
        filters.append(AttendanceEvent.person_type == str(PersonType.STAFF))
    result = await db.execute(select(AttendanceEvent).where(*filters))
    return list(result.scalars().all())


# ── Enquête d'absence (parents des absents) ─────────────────────
_ABSENCE_NOTIFY_TTL_SECONDS = 48 * 3600


def _absence_notify_key(establishment_id: uuid.UUID, target: date_, child_id: uuid.UUID) -> str:
    return f"absence-notify:{establishment_id}:{target.isoformat()}:{child_id}"


async def send_absence_inquiries(
    establishment_id: uuid.UUID,
    sender: User,
    db: AsyncSession,
    *,
    target_date: date_,
    department_id: uuid.UUID | None = None,
    section_id: uuid.UUID | None = None,
    child_id: uuid.UUID | None = None,
    force: bool = False,
) -> AbsenceInquiryResponse:
    """Enquête manuelle : email + message conversation aux comptes parents
    assignés aux enfants absents (aucune arrivée scannée) — pour connaître le
    motif de l'absence. Déclenché au clic (pas d'automatisme).

    - Destinataires = comptes parents (role=parent, actifs) assignés à
      l'enfant via `parent_children`. Sans compte parent → `skipped_no_parent`.
    - Anti-doublon : un enfant notifié ne l'est plus le même jour (clé Redis
      48 h) — un second clic ne touche que les nouveaux absents.
    - `child_id` = relance individuelle d'un seul enfant (404 hors
      établissement, 422 s'il n'est pas absent) ; `force=True` renvoie même
      s'il a déjà été notifié aujourd'hui (relance explicite).
    - Best-effort sur les deux canaux (email + conversation), comme les
      rappels bibliothèque : échec journalisé, jamais bloquant.
    """
    if child_id:
        child = await db.scalar(
            select(Child).where(
                Child.id == child_id, Child.establishment_id == establishment_id
            )
        )
        if not child:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.child_not_found"))
        tz = await _get_timezone(establishment_id, db)
        day_events = await _events_for_day(
            establishment_id, PersonType.CHILD, target_date, db, tz
        )
        arrivals = [
            e for e in day_events.get(child.id, [])
            if e.event_type == str(EventType.ARRIVAL)
        ]
        if arrivals:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("errors.attendance.child_not_absent"),
            )
        # ⚠️ La relance individuelle ne passe PAS par le statut du jour : elle
        # fabrique « absent » à la main. Il faut donc y refuser l'exemption
        # explicitement — l'envoi en masse, lui, est protégé par construction
        # (un enfant exempté a le statut `exempt`, jamais `absent`). La garde
        # n'existait que dans l'une des deux voies, et c'est la voie ciblée,
        # celle qu'on emprunte justement pour UN enfant précis.
        #
        # Demander « pourquoi votre enfant était-il absent ? » quand c'est
        # l'établissement lui-même qui l'a dispensé est le pire message
        # possible pour un parent.
        exemptions = await _load_exemptions(
            establishment_id, db, date_from=target_date, date_to=target_date
        )
        if exemptions.covers_child(child.id, child.section_id, target_date):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("errors.attendance.child_exempt"),
            )
        absent_items = [ChildDailyStatus(
            child=_child_brief(child),
            status="absent",
            arrival_time=None,
            departure_time=None,
            late_minutes=None,
        )]
    else:
        daily = await get_children_daily_status(
            establishment_id, target_date, db,
            department_id=department_id, section_id=section_id,
        )
        absent_items = [i for i in daily.items if i.status == "absent"]

    establishment = await db.scalar(
        select(Establishment).where(Establishment.id == establishment_id)
    )
    establishment_name = establishment.name if establishment else "Établissement"

    # Enfants déjà notifiés aujourd'hui → ignorés (nouveaux absents seuls),
    # sauf relance individuelle forcée (qui repose quand même la clé).
    fresh: list = []
    already_notified: list[str] = []
    for item in absent_items:
        key = _absence_notify_key(establishment_id, target_date, item.child.id)
        name = f"{item.child.first_names} {item.child.last_name}".strip()
        if force:
            try:
                await redis_client.set(key, "1", ex=_ABSENCE_NOTIFY_TTL_SECONDS)
            except Exception:
                logger.exception("Redis indisponible pour l'anti-doublon d'absence")
            fresh.append(item)
            continue
        try:
            is_new = await redis_client.set(key, "1", nx=True, ex=_ABSENCE_NOTIFY_TTL_SECONDS)
        except Exception:
            logger.exception("Redis indisponible pour l'anti-doublon d'absence — envoi quand même")
            is_new = True
        if is_new:
            fresh.append(item)
        else:
            already_notified.append(name)

    # Comptes parents assignés à chaque enfant encore frais.
    children_names: dict[uuid.UUID, str] = {
        i.child.id: f"{i.child.first_names} {i.child.last_name}".strip() for i in fresh
    }
    parents_by_child: dict[uuid.UUID, list[User]] = {cid: [] for cid in children_names}
    if children_names:
        rows = (
            await db.execute(
                select(User, parent_children.c.child_id)
                .join(parent_children, parent_children.c.parent_id == User.id)
                .where(
                    User.establishment_id == establishment_id,
                    User.role == UserRole.PARENT,
                    User.is_active.is_(True),
                    parent_children.c.child_id.in_(list(children_names)),
                )
            )
        ).all()
        for parent, cid in rows:
            parents_by_child[cid].append(parent)

    # Regroupés par parent : un email + un message par parent.
    by_parent: dict[uuid.UUID, dict] = {}
    skipped_no_parent: list[str] = []
    for cid, cname in children_names.items():
        parents = [p for p in parents_by_child[cid] if p.email]
        if not parents:
            skipped_no_parent.append(cname)
            continue
        for parent in parents:
            entry = by_parent.setdefault(parent.id, {"parent": parent, "children": []})
            if cname not in entry["children"]:
                entry["children"].append(cname)

    from app.modules.messaging.service import get_or_create_own_conversation, send_message

    notified: list[AbsentNotifiedParent] = []
    for entry in by_parent.values():
        parent = entry["parent"]
        cnames: list[str] = entry["children"]
        # Un envoi par parent, dans SA langue : le libellé de date comme le
        # corps du message sont donc rendus ici, pas en amont de la boucle.
        parent_locale = coerce_locale(parent.locale)
        date_label = format_long_date(target_date, parent_locale)
        try:
            await attendance_email.send_absence_inquiry_email(
                to=parent.email,
                parent_first_name=parent.first_name,
                children_names=cnames,
                date_label=date_label,
                establishment_name=establishment_name,
                locale=parent_locale,
            )
            email_sent = True
        except Exception:
            logger.exception("Échec d'envoi du mail d'absence vers %s", parent.email)
            email_sent = False
        try:
            conversation = await get_or_create_own_conversation(parent, db)
            kids = ", ".join(cnames)
            await send_message(
                conversation=conversation,
                sender=sender,
                body=t(
                    "conversations.absence_inquiry",
                    parent_locale,
                    children=kids,
                    date=date_label,
                ),
                db=db,
            )
            message_sent = True
        except Exception:
            logger.exception("Échec d'injection du message d'absence en conversation")
            message_sent = False
        notified.append(
            AbsentNotifiedParent(
                parent_name=display_name_of(parent),
                children_names=cnames,
                email_sent=email_sent,
                message_sent=message_sent,
            )
        )

    return AbsenceInquiryResponse(
        date=target_date,
        total_absent=len(absent_items),
        notified=notified,
        skipped_no_parent=sorted(skipped_no_parent),
        already_notified=sorted(already_notified),
    )


# ── Exemptions : CRUD ───────────────────────────────────────────
async def _exemption_response(
    row: AttendanceExemption, today: date_
) -> ExemptionResponse:
    """⚠️ `target_name` est résolu CÔTÉ SERVEUR : la règle du surnom
    (« Tata Victoire ») vit dans `app.core.people`, et la rejouer dans chaque
    écran est exactement ce que le module Annuaire a dû refermer ailleurs."""
    if row.scope == str(ExemptionScope.STAFF):
        target_name = display_name_of(row.staff) if row.staff else "—"
        section_name = None
    elif row.scope == str(ExemptionScope.CHILD):
        child = row.child
        # Pas de surnom sur une fiche enfant — et `first_names` est au pluriel.
        target_name = (
            f"{child.first_names} {child.last_name}".strip() if child else "—"
        )
        section_name = child.section.name if child and child.section else None
    else:
        target_name = row.section.name if row.section else "—"
        section_name = None
    return ExemptionResponse(
        id=row.id,
        scope=ExemptionScope(row.scope),
        staff_id=row.staff_id,
        child_id=row.child_id,
        section_id=row.section_id,
        target_name=target_name,
        section_name=section_name,
        starts_on=row.starts_on,
        ends_on=row.ends_on,
        reason=row.reason,
        is_active=row.is_active,
        state=row.state(today),
    )


#: Ordre d'affichage : ce qui demande une décision d'abord. « Expirée » passe
#: avant « annulée » — la première peut être prolongée, la seconde est classée.
_STATE_ORDER = {"active": 0, "upcoming": 1, "expired": 2, "revoked": 3}


async def list_exemptions(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    scope: ExemptionScope | None = None,
    include_revoked: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> ExemptionListResponse:
    filters = [AttendanceExemption.establishment_id == establishment_id]
    if scope is not None:
        filters.append(AttendanceExemption.scope == str(scope))
    if not include_revoked:
        filters.append(AttendanceExemption.is_active.is_(True))
    rows = (
        await db.execute(select(AttendanceExemption).where(*filters))
    ).scalars().all()

    today = await _local_today(establishment_id, db)
    items = [await _exemption_response(r, today) for r in rows]
    # Tri côté application : l'état est DÉRIVÉ des dates, SQL ne sait pas
    # l'ordonner sans le réimplémenter — et une seconde implémentation de la
    # règle divergerait.
    items.sort(key=lambda i: (_STATE_ORDER[str(i.state)], i.target_name.lower()))
    return ExemptionListResponse(total=len(items), items=items[skip : skip + limit])


async def create_exemption(
    payload: ExemptionCreateRequest,
    establishment_id: uuid.UUID,
    author: User,
    db: AsyncSession,
) -> ExemptionResponse:
    # La cible doit vivre dans CET établissement — 404 sinon, jamais 403 : on
    # ne révèle pas l'existence d'un enfant ni d'une section d'ailleurs.
    if payload.scope == ExemptionScope.STAFF:
        await _get_active_staff_or_404(payload.staff_id, establishment_id, db)
    elif payload.scope == ExemptionScope.CHILD:
        await _get_active_child_or_404(payload.child_id, establishment_id, db)
    else:
        await org_service.get_or_404(Section, payload.section_id, establishment_id, db)

    row = AttendanceExemption(
        establishment_id=establishment_id,
        scope=str(payload.scope),
        staff_id=payload.staff_id,
        child_id=payload.child_id,
        section_id=payload.section_id,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
        reason=payload.reason,
        created_by_id=author.id,
    )
    db.add(row)
    await db.flush()
    # Les relations sont renseignées par leur FK : `selectin` ne joue qu'au
    # chargement par requête, pas sur un objet fraîchement ajouté.
    await db.refresh(row)
    return await _exemption_response(row, await _local_today(establishment_id, db))


async def update_exemption(
    exemption_id: uuid.UUID,
    payload: ExemptionUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> ExemptionResponse:
    """La période est remplacée en entier (cf. ExemptionUpdateRequest).

    Raccourcir `ends_on` est la **fin anticipée** : les jours déjà couverts le
    restent. C'est ce qui la distingue de l'annulation.
    """
    row = await _get_exemption_or_404(exemption_id, establishment_id, db)
    row.starts_on = payload.starts_on
    row.ends_on = payload.ends_on
    row.reason = payload.reason
    # Une période qu'on rouvre doit pouvoir être notifiée à nouveau le jour où
    # elle s'achèvera vraiment — sans ça, prolonger une exemption expirée la
    # ferait finir en silence.
    row.expired_notified_at = None
    await db.flush()
    return await _exemption_response(row, await _local_today(establishment_id, db))


async def revoke_exemption(
    exemption_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Annulation : la ligne est conservée mais ne compte plus, **y compris
    dans l'historique**.

    ⚠️ C'est volontairement différent d'une fin anticipée. « Cette exemption
    est une erreur » et « finalement il revient lundi » ne disent pas la même
    chose, et confondre les deux ferait soit réécrire le passé sans le vouloir,
    soit laisser une saisie fautive marquer un mois d'export. Idempotent.
    """
    row = await _get_exemption_or_404(exemption_id, establishment_id, db)
    row.is_active = False
    await db.flush()


async def _get_exemption_or_404(
    exemption_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> AttendanceExemption:
    row = await db.scalar(
        select(AttendanceExemption).where(
            AttendanceExemption.id == exemption_id,
            AttendanceExemption.establishment_id == establishment_id,
        )
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.attendance.exemption_not_found"),
        )
    return row


async def _local_today(establishment_id: uuid.UUID, db: AsyncSession) -> date_:
    """Aujourd'hui dans le fuseau de l'établissement, jamais en UTC.

    Une exemption qui finit le 15 s'achève quand le 16 commence SUR PLACE.
    Avec `date.today()` en UTC, un établissement à UTC+1 verrait l'exemption
    expirer une heure trop tôt ou trop tard selon le sens du décalage — et
    c'est le genre d'écart qu'on ne remarque qu'un jour sur trente.
    """
    tz = await _get_timezone(establishment_id, db)
    return datetime.now(tz).date()


# ── Helpers privés ──────────────────────────────────────────────
async def _get_child_or_404(
    child_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Child:
    """Utilisé pour la génération du QR : n'exige pas que la fiche soit active."""
    child = await db.scalar(
        select(Child).where(
            Child.id == child_id, Child.establishment_id == establishment_id
        )
    )
    if not child:
        raise HTTPException(status_code=404, detail=t("errors.common.child_not_found"))
    return child


async def _get_active_child_or_404(
    child_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Child:
    """Utilisé au scan : une fiche désactivée ne doit pas pouvoir pointer."""
    child = await _get_child_or_404(child_id, establishment_id, db)
    if not child.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.common.child_inactive"),
        )
    return child


async def _get_staff_or_404(
    staff_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> User:
    """Utilisé pour la génération du QR : n'exige pas que le compte soit actif."""
    staff = await db.scalar(
        select(User).where(
            User.id == staff_id,
            User.establishment_id == establishment_id,
            User.role == UserRole.STAFF,
        )
    )
    if not staff:
        raise HTTPException(status_code=404, detail=t("errors.common.staff_not_found"))
    return staff


async def _get_active_staff_or_404(
    staff_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> User:
    """Utilisé au scan : un compte désactivé ne doit pas pouvoir pointer."""
    staff = await _get_staff_or_404(staff_id, establishment_id, db)
    if not staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.attendance.account_disabled"),
        )
    return staff


async def _to_event_response(
    event: AttendanceEvent, db: AsyncSession
) -> AttendanceEventResponse:
    return AttendanceEventResponse(
        id=event.id,
        person_type=PersonType(event.person_type),
        event_type=EventType(event.event_type),
        scanned_at=event.scanned_at,
        scanned_by=ScannerBrief(
            id=event.scanned_by.id,
            first_name=event.scanned_by.first_name,
            last_name=event.scanned_by.last_name,
        ),
        companion_name=event.companion_name,
        companion_phone=event.companion_phone,
        child=_child_brief(event.child) if event.child else None,
        staff=_staff_brief(event.staff) if event.staff else None,
    )


def _child_brief(child: Child) -> PersonBrief:
    return PersonBrief(
        id=child.id,
        matricule=child.matricule,
        last_name=child.last_name,
        first_names=child.first_names,
    )


def _staff_brief(staff: User) -> PersonBrief:
    return PersonBrief(
        id=staff.id,
        matricule=staff.matricule,
        last_name=staff.last_name,
        first_name=staff.first_name,
        nickname=staff.nickname,
    )


def _day_start(d: date_) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def _local_day_bounds(tz: ZoneInfo, target: date_) -> tuple[datetime, datetime]:
    """Fenêtre UTC correspondant à la journée [00:00, 24:00) dans le fuseau
    de l'établissement — avec DST gérée par ZoneInfo. Tout le bucket « jour »
    (dashboards, export, journal, verify) passe par ici, jamais par minuit UTC."""
    start_local = datetime(target.year, target.month, target.day, tzinfo=tz)
    start_utc = start_local.astimezone(timezone.utc)
    return start_utc, start_utc + timedelta(days=1)


def _local_date(dt: datetime, tz: ZoneInfo) -> date_:
    aware = dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
    return aware.astimezone(tz).date()


def _to_local(value: datetime | None, tz: ZoneInfo) -> datetime | None:
    """Heure affichée dans le fuseau de l'établissement (export, journal) —
    jamais l'UTC brut, qui décale l'affichage d'une heure (ex. Porto-Novo)."""
    if value is None:
        return None
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(tz)


def _is_weekday(d: date_) -> bool:
    return d.weekday() < 5  # 0=lundi ... 4=vendredi


async def _events_for_day(
    establishment_id: uuid.UUID,
    person_type: PersonType,
    target_date: date_,
    db: AsyncSession,
    tz: ZoneInfo,
) -> dict[uuid.UUID, list[AttendanceEvent]]:
    start, end = _local_day_bounds(tz, target_date)
    result = await db.execute(
        select(AttendanceEvent).where(
            AttendanceEvent.establishment_id == establishment_id,
            AttendanceEvent.person_type == str(person_type),
            AttendanceEvent.scanned_at >= start,
            AttendanceEvent.scanned_at < end,
        )
    )
    events = result.scalars().all()
    by_person: dict[uuid.UUID, list[AttendanceEvent]] = {}
    for e in events:
        key = e.child_id if person_type == PersonType.CHILD else e.staff_id
        by_person.setdefault(key, []).append(e)
    return by_person


def _earliest(events: list[AttendanceEvent], event_type: EventType) -> datetime | None:
    matching = [e.scanned_at for e in events if e.event_type == str(event_type)]
    return min(matching) if matching else None


def _latest(events: list[AttendanceEvent], event_type: EventType) -> datetime | None:
    matching = [e.scanned_at for e in events if e.event_type == str(event_type)]
    return max(matching) if matching else None


async def _department_settings_map(
    establishment_id: uuid.UUID, db: AsyncSession
) -> dict[uuid.UUID, DepartmentAttendanceSettings]:
    result = await db.execute(
        select(DepartmentAttendanceSettings).where(
            DepartmentAttendanceSettings.establishment_id == establishment_id
        )
    )
    return {s.department_id: s for s in result.scalars().all()}


async def _staff_schedule_map(
    establishment_id: uuid.UUID, db: AsyncSession
) -> dict[uuid.UUID, StaffAttendanceSchedule]:
    result = await db.execute(
        select(StaffAttendanceSchedule).where(
            StaffAttendanceSchedule.establishment_id == establishment_id
        )
    )
    return {s.staff_id: s for s in result.scalars().all()}


async def _get_general_settings(
    establishment_id: uuid.UUID, db: AsyncSession
) -> AttendanceSettings | None:
    return await db.scalar(
        select(AttendanceSettings).where(
            AttendanceSettings.establishment_id == establishment_id
        )
    )


def _tz_of(settings: AttendanceSettings | None) -> ZoneInfo:
    """Fuseau configuré, ou UTC par défaut si l'établissement n'a rien réglé.
    Une valeur corrompue (édition manuelle en base) lève une 500 explicite
    plutôt que de faire tomber les calculs en erreur obscure."""
    if not settings:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(settings.timezone)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=t("errors.attendance.bad_timezone", timezone=settings.timezone),
        )


async def _get_timezone(establishment_id: uuid.UUID, db: AsyncSession) -> ZoneInfo:
    return _tz_of(await _get_general_settings(establishment_id, db))


def _compute_status(
    arrival: datetime | None,
    weekday: bool,
    expected_arrival_time: time | None,
    tz: ZoneInfo,
    grace_minutes: int = 0,
) -> tuple[str, int | None]:
    """
    Retourne (status, late_minutes). La comparaison se fait dans le fuseau
    horaire CONFIGURÉ de l'établissement (par défaut UTC si non réglé) : un
    scan à 08:05 UTC+1 n'est pas en retard sur un horaire attendu de 08:00
    heure locale, même si le timestamp stocké est en UTC.

    - Pas d'arrivée + jour ouvré      → absent
    - Pas d'arrivée + week-end        → not_expected (rien n'est attendu)
    - Arrivée, pas d'horaire configuré→ present, late_minutes=None (indéterminable)
    - Arrivée après horaire + tolérance → late, late_minutes=écart en minutes
    - Arrivée dans les temps (+ tolérance) → present, late_minutes=0
    """
    if arrival is None:
        return ("absent" if weekday else "not_expected"), None

    if expected_arrival_time is None:
        return "present", None

    arrival_local = arrival.astimezone(tz)
    expected_local = datetime.combine(arrival_local.date(), expected_arrival_time, tzinfo=tz)
    delta_minutes = int((arrival_local - expected_local).total_seconds() // 60)
    if delta_minutes > grace_minutes:
        return "late", delta_minutes
    return "present", 0


# ── Échéance des exemptions : la notification à l'admin ─────────
async def notify_expired_exemptions(
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> int:
    """Prévient les admins des exemptions dont la période vient de s'achever.

    ⚠️ **Cette fonction ne DÉSACTIVE rien** — elle constate. L'exemption a
    cessé de s'appliquer d'elle-même, à la seconde où le jour a changé sur
    place (cf. la docstring de `AttendanceExemption`) : il n'y a aucun drapeau
    à basculer, et en basculer un réécrirait l'historique de l'export.

    `expired_notified_at` est l'anti-doublon : un admin ne doit pas relire
    chaque matin que l'exemption de mardi dernier est terminée. Il est remis à
    NULL quand la période est prolongée (cf. `update_exemption`), sinon une
    exemption rouverte finirait en silence.

    Renvoie le nombre d'exemptions annoncées. Best-effort de bout en bout :
    l'échec d'un canal n'empêche ni l'autre canal ni les lignes suivantes —
    c'est une information, pas un mot de passe temporaire.
    """
    today = await _local_today(establishment_id, db)
    rows = (
        await db.execute(
            select(AttendanceExemption).where(
                AttendanceExemption.establishment_id == establishment_id,
                AttendanceExemption.is_active.is_(True),
                AttendanceExemption.ends_on.is_not(None),
                AttendanceExemption.ends_on < today,
                AttendanceExemption.expired_notified_at.is_(None),
            )
        )
    ).scalars().all()
    if not rows:
        return 0

    establishment = await db.scalar(
        select(Establishment).where(Establishment.id == establishment_id)
    )
    establishment_name = establishment.name if establishment else "Établissement"

    admins = (
        await db.execute(
            select(User).where(
                User.establishment_id == establishment_id,
                User.role == UserRole.ADMIN,
                User.is_active.is_(True),
            )
        )
    ).scalars().all()

    # Les libellés de portée et les noms sont résolus UNE fois, pas une fois
    # par admin : seul le rendu dépend de la langue du destinataire.
    resolved = [(r, await _exemption_response(r, today)) for r in rows]

    for admin in admins:
        if not admin.email:
            continue
        locale = coerce_locale(admin.locale)
        lignes = [
            t(
                "emails.exemption_expired.line",
                locale,
                scope=t(f"attendance.exemption.scope.{item.scope}", locale),
                name=item.target_name,
                end=format_long_date(item.ends_on, locale) if item.ends_on else "",
            )
            for _, item in resolved
        ]
        try:
            await attendance_email.send_exemption_expired_email(
                to=admin.email,
                admin_first_name=admin.first_name,
                lines=lignes,
                count=len(lignes),
                establishment_name=establishment_name,
                locale=locale,
            )
        except Exception:
            logger.exception(
                "Échec d'envoi du mail d'échéance d'exemption vers %s", admin.email
            )

    # Push : second canal, pour l'admin qui ne relève pas ses mails. Rendu par
    # destinataire (chacun dans SA langue) par le module notifications.
    try:
        from app.modules.notifications import service as notifications_service

        await notifications_service.send_push_to_establishment_admins(
            establishment_id,
            "push.exemption_expired.title",
            None,
            db,
            data={"url": links.url_path(links.ADMIN_ATTENDANCE, tab=links.TAB_SETTINGS)},
            # Deux clés plutôt qu'un pluriel ICU : c'est la convention du
            # backend (cf. conversations.library_reminder.overdue_one|many).
            # La règle de pluriel appartient à la langue, jamais à l'appelant
            # — pas de « + s » en Python.
            body_key=(
                "push.exemption_expired.body_one"
                if len(resolved) == 1
                else "push.exemption_expired.body_many"
            ),
            body_params={"count": len(resolved)},
        )
    except Exception:
        logger.exception("Échec du push d'échéance d'exemption")

    marked = datetime.now(timezone.utc)
    for row, _ in resolved:
        row.expired_notified_at = marked
    await db.flush()
    return len(resolved)
