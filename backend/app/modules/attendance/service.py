import asyncio
import uuid
from datetime import date as date_, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.attendance.models import (
    AttendanceEvent,
    AttendanceSettings,
    DepartmentAttendanceSettings,
    EventType,
    PersonType,
    StaffAttendanceSchedule,
)
from app.modules.attendance.qrcode_utils import (
    decrypt_qr_payload,
    encrypt_qr_payload,
    render_qr_image,
)
from app.modules.attendance.schemas import (
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
    PersonBrief,
    QRCodeResponse,
    ScanRequest,
    ScannerBrief,
    StaffDailyStatus,
    StaffDailyStatusListResponse,
    StaffExemptionResponse,
    StaffScheduleRequest,
    StaffScheduleResponse,
    VerifyQrRequest,
    VerifyQrResponse,
)
from app.modules.auth.models import User, UserRole
from app.modules.children.models import Child
from app.modules.establishments.models import Establishment
from app.modules.organization import service as org_service
from app.modules.organization.models import Department, Group
from app.modules.attendance.export import render_attendance_pdf, render_attendance_xlsx

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

    if person_type == PersonType.CHILD:
        if payload.event_type == EventType.MEAL:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Pas de cantine pour les enfants",
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
                detail="Un accompagnateur n'est pas applicable pour un membre du personnel",
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

    today = date_.today()
    events_formatted: dict[uuid.UUID, list[AttendanceEvent]] = {}

    if person_type == PersonType.CHILD:
        child = await _get_active_child_or_404(person_id, establishment_id, db)
        display_name = child.first_names
        matricule = child.matricule
        events_formatted = await _events_for_day(
            establishment_id, PersonType.CHILD, today, db
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
    display_name = staff.nickname or f"{staff.first_name} {staff.last_name}".strip()
    events_formatted = await _events_for_day(
        establishment_id, PersonType.STAFF, today, db
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
        filters.append(AttendanceEvent.child_id == child_id)
    if staff_id:
        filters.append(AttendanceEvent.staff_id == staff_id)
    if date_from:
        filters.append(AttendanceEvent.scanned_at >= _day_start(date_from))
    if date_to:
        filters.append(AttendanceEvent.scanned_at < _day_start(date_to) + timedelta(days=1))

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
        items=[await _to_event_response(e, db) for e in events],
    )


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
        filters.append(Child.department_id == department_id)
    if section_id:
        filters.append(Child.section_id == section_id)
    if group_ids is not None:
        if not group_ids:
            return ChildDailyStatusListResponse(date=target_date, total=0, items=[])
        filters.append(Child.group_id.in_(group_ids))
    children = (await db.execute(select(Child).where(*filters))).scalars().all()

    events_by_child = await _events_for_day(
        establishment_id, PersonType.CHILD, target_date, db
    )
    settings_by_dept = await _department_settings_map(establishment_id, db)
    tz = await _get_timezone(establishment_id, db)
    weekday = _is_weekday(target_date)

    items = []
    for child in children:
        events = events_by_child.get(child.id, [])
        arrival = _earliest(events, EventType.ARRIVAL)
        departure = _latest(events, EventType.DEPARTURE)
        dept_settings = settings_by_dept.get(child.department_id) if child.department_id else None
        expected = dept_settings.expected_arrival_time if dept_settings else None
        status_, late_minutes = _compute_status(arrival, weekday, expected, tz)
        items.append(
            ChildDailyStatus(
                child=_child_brief(child),
                status=status_,
                arrival_time=arrival,
                departure_time=departure,
                late_minutes=late_minutes,
            )
        )
    return ChildDailyStatusListResponse(date=target_date, total=len(items), items=items)


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

    events_by_staff = await _events_for_day(
        establishment_id, PersonType.STAFF, target_date, db
    )
    general_settings = await _get_general_settings(establishment_id, db)
    tz = _tz_of(general_settings)
    schedule_map = await _staff_schedule_map(establishment_id, db)
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

        if member.attendance_exempt and arrival is None:
            status_, late_minutes = "exempt", None
        else:
            status_, late_minutes = _compute_status(arrival, weekday, expected, tz)

        items.append(
            StaffDailyStatus(
                staff=_staff_brief(member),
                status=status_,
                arrival_time=arrival,
                departure_time=departure,
                late_minutes=late_minutes,
                meal_taken=meal_taken,
                exempt=member.attendance_exempt,
            )
        )
    return StaffDailyStatusListResponse(date=target_date, total=len(items), items=items)


# ── Paramètres : département (enfants) ───────────────────────────
async def upsert_department_settings(
    department_id: uuid.UUID,
    payload: AttendanceSettingsRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> DepartmentAttendanceSettingsResponse:
    await org_service.get_or_404(Department, department_id, establishment_id, db)

    settings = await db.scalar(
        select(DepartmentAttendanceSettings).where(
            DepartmentAttendanceSettings.department_id == department_id
        )
    )
    if settings:
        settings.expected_arrival_time = payload.expected_arrival_time
        settings.expected_departure_time = payload.expected_departure_time
    else:
        settings = DepartmentAttendanceSettings(
            establishment_id=establishment_id,
            department_id=department_id,
            expected_arrival_time=payload.expected_arrival_time,
            expected_departure_time=payload.expected_departure_time,
        )
        db.add(settings)
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
            detail="Aucun horaire configuré pour ce département",
        )
    return DepartmentAttendanceSettingsResponse.model_validate(settings)


# ── Paramètres généraux : fuseau horaire + horaires du personnel ──
async def upsert_general_settings(
    payload: AttendanceGeneralSettingsRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> AttendanceGeneralSettingsResponse:
    settings = await _get_general_settings(establishment_id, db)
    if settings:
        settings.timezone = payload.timezone
        settings.staff_expected_arrival_time = payload.staff_expected_arrival_time
        settings.staff_expected_departure_time = payload.staff_expected_departure_time
    else:
        settings = AttendanceSettings(
            establishment_id=establishment_id,
            timezone=payload.timezone,
            staff_expected_arrival_time=payload.staff_expected_arrival_time,
            staff_expected_departure_time=payload.staff_expected_departure_time,
        )
        db.add(settings)
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
            detail="Aucun paramètre de présence configuré pour cet établissement",
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
    schedule = await db.scalar(
        select(StaffAttendanceSchedule).where(StaffAttendanceSchedule.staff_id == staff_id)
    )
    if schedule:
        schedule.expected_arrival_time = payload.expected_arrival_time
        schedule.expected_departure_time = payload.expected_departure_time
    else:
        schedule = StaffAttendanceSchedule(
            establishment_id=establishment_id,
            staff_id=staff.id,
            expected_arrival_time=payload.expected_arrival_time,
            expected_departure_time=payload.expected_departure_time,
        )
        db.add(schedule)
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
            detail="Aucun horaire personnalisé configuré pour ce membre du personnel",
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
_STATUS_LABELS = {
    "present": "Présent",
    "late": "Retard",
    "absent": "Absent",
    "not_expected": "Non attendu",
    "exempt": "Exempté",
}

_FILENAME_SCOPE = {
    ExportPersonType.CHILDREN: "enfants",
    ExportPersonType.STAFF: "personnel",
    ExportPersonType.BOTH: "presences",
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
) -> tuple[bytes, str]:
    """Construit l'export agrégé (statut par personne × jour) et le rend dans
    le format demandé. Retourne (octets du fichier, nom de fichier).
    `child_id` / `staff_id` restreignent l'export à UNE personne précise
    (exclusifs l'un de l'autre, 422 sinon ; 404 si hors établissement) et
    priment sur `export_scope` / département / section."""
    if date_to < date_from:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La date de fin doit être postérieure ou égale à la date de début",
        )
    if (date_to - date_from).days + 1 > 366:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La période d'export ne peut pas dépasser 366 jours",
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

    filename = (
        f"{_FILENAME_SCOPE[export_scope]}_{date_from.isoformat()}_{date_to.isoformat()}.{file_format.value}"
    )
    if file_format == ExportFileFormat.PDF:
        content = await asyncio.to_thread(
            render_attendance_pdf, establishment_name, date_from, date_to, rows
        )
    else:
        content = await asyncio.to_thread(
            render_attendance_xlsx, establishment_name, date_from, date_to, rows
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
            detail="child_id et staff_id sont exclusifs l'un de l'autre",
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
                status_code=status.HTTP_404_NOT_FOUND, detail="Enfant introuvable"
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
                status_code=status.HTTP_404_NOT_FOUND, detail="Membre du personnel introuvable"
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
    dept_settings = await _department_settings_map(establishment_id, db)
    schedule_map = await _staff_schedule_map(establishment_id, db)

    events = await _events_for_range(establishment_id, export_scope, date_from, date_to, db)
    by_person_day: dict[tuple[uuid.UUID, date_], list[AttendanceEvent]] = {}
    for e in events:
        person_id = e.child_id if e.person_type == str(PersonType.CHILD) else e.staff_id
        by_person_day.setdefault((person_id, e.scanned_at.date()), []).append(e)

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
                status_, late = _compute_status(arrival, weekday, expected, tz)
                rows.append(AttendanceExportRow(
                    person_type="Enfant",
                    name=f"{child.first_names} {child.last_name}".strip(),
                    matricule=child.matricule,
                    date=current,
                    status=_STATUS_LABELS.get(status_, status_),
                    arrival_time=arrival,
                    departure_time=departure,
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
                if member.attendance_exempt and arrival is None:
                    status_, late = "exempt", None
                else:
                    status_, late = _compute_status(arrival, weekday, expected, tz)
                name = member.nickname or f"{member.first_name} {member.last_name}".strip()
                rows.append(AttendanceExportRow(
                    person_type="Personnel",
                    name=name,
                    matricule=member.matricule,
                    date=current,
                    status=_STATUS_LABELS.get(status_, status_),
                    arrival_time=arrival,
                    departure_time=departure,
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
) -> list[AttendanceEvent]:
    filters = [
        AttendanceEvent.establishment_id == establishment_id,
        AttendanceEvent.scanned_at >= _day_start(date_from),
        AttendanceEvent.scanned_at < _day_start(date_to) + timedelta(days=1),
    ]
    if export_scope == ExportPersonType.CHILDREN:
        filters.append(AttendanceEvent.person_type == str(PersonType.CHILD))
    elif export_scope == ExportPersonType.STAFF:
        filters.append(AttendanceEvent.person_type == str(PersonType.STAFF))
    result = await db.execute(select(AttendanceEvent).where(*filters))
    return list(result.scalars().all())


# ── Exemptions ──────────────────────────────────────────────────
async def list_staff_exemptions(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    exempt_only: bool = False,
) -> list[StaffExemptionResponse]:
    filters = [
        User.establishment_id == establishment_id,
        User.role == UserRole.STAFF,
        User.is_active.is_(True),
    ]
    if exempt_only:
        filters.append(User.attendance_exempt.is_(True))
    members = (await db.execute(select(User).where(*filters))).scalars().all()
    return [
        StaffExemptionResponse(staff_id=m.id, exempt=m.attendance_exempt)
        for m in members
    ]


async def set_staff_exemption(
    staff_id: uuid.UUID,
    exempt: bool,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> StaffExemptionResponse:
    staff = await _get_staff_or_404(staff_id, establishment_id, db)
    staff.attendance_exempt = exempt
    await db.flush()
    return StaffExemptionResponse(staff_id=staff.id, exempt=staff.attendance_exempt)


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
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    return child


async def _get_active_child_or_404(
    child_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Child:
    """Utilisé au scan : une fiche désactivée ne doit pas pouvoir pointer."""
    child = await _get_child_or_404(child_id, establishment_id, db)
    if not child.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette fiche enfant est désactivée",
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
        raise HTTPException(status_code=404, detail="Membre du personnel introuvable")
    return staff


async def _get_active_staff_or_404(
    staff_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> User:
    """Utilisé au scan : un compte désactivé ne doit pas pouvoir pointer."""
    staff = await _get_staff_or_404(staff_id, establishment_id, db)
    if not staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce compte est désactivé",
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


def _is_weekday(d: date_) -> bool:
    return d.weekday() < 5  # 0=lundi ... 4=vendredi


async def _events_for_day(
    establishment_id: uuid.UUID,
    person_type: PersonType,
    target_date: date_,
    db: AsyncSession,
) -> dict[uuid.UUID, list[AttendanceEvent]]:
    start = _day_start(target_date)
    end = start + timedelta(days=1)
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
    """Fuseau configuré, ou UTC par défaut si l'établissement n'a rien réglé."""
    return ZoneInfo(settings.timezone) if settings else ZoneInfo("UTC")


async def _get_timezone(establishment_id: uuid.UUID, db: AsyncSession) -> ZoneInfo:
    return _tz_of(await _get_general_settings(establishment_id, db))


def _compute_status(
    arrival: datetime | None,
    weekday: bool,
    expected_arrival_time: time | None,
    tz: ZoneInfo,
) -> tuple[str, int | None]:
    """
    Retourne (status, late_minutes). La comparaison se fait dans le fuseau
    horaire CONFIGURÉ de l'établissement (par défaut UTC si non réglé) : un
    scan à 08:05 UTC+1 n'est pas en retard sur un horaire attendu de 08:00
    heure locale, même si le timestamp stocké est en UTC.

    - Pas d'arrivée + jour ouvré      → absent
    - Pas d'arrivée + week-end        → not_expected (rien n'est attendu)
    - Arrivée, pas d'horaire configuré→ present, late_minutes=None (indéterminable)
    - Arrivée après l'horaire attendu → late, late_minutes=écart en minutes
    - Arrivée dans les temps          → present, late_minutes=0
    """
    if arrival is None:
        return ("absent" if weekday else "not_expected"), None

    if expected_arrival_time is None:
        return "present", None

    arrival_local = arrival.astimezone(tz)
    expected_local = datetime.combine(arrival_local.date(), expected_arrival_time, tzinfo=tz)
    delta_minutes = int((arrival_local - expected_local).total_seconds() // 60)
    if delta_minutes > 0:
        return "late", delta_minutes
    return "present", 0
