import asyncio
import calendar
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.config import settings
from app.modules.attendance.models import AttendanceEvent, AttendanceSettings, EventType, PersonType
from app.modules.auth.email import EmailDeliveryError
from app.modules.auth.models import User, UserRole
from app.modules.children.models import Child
from app.modules.organization import service as org_service
from app.modules.organization.models import Department, Group
from app.modules.reports.email import send_report_available_email
from app.modules.reports.models import (
    ACQUISITION_LEVEL_LABELS,
    BEHAVIOR_TAG_LABELS,
    CLASS_BEHAVIOR_LABELS,
    EMOTION_MANAGEMENT_LABELS,
    HEALTH_STATUS_LABELS,
    MEAL_AMOUNT_LABELS,
    MOOD_LABELS,
    PEER_RELATION_LABELS,
    DepartmentReportType,
    Report,
    ReportAttachment,
    ReportRead,
    ReportStatus,
    ReportType,
)
from app.modules.reports.pdf import render_annual_report_pdf
from app.modules.reports.schemas import (
    AnnualReportContent,
    BiMensuelReportContent,
    ChildBrief,
    DailyReportContent,
    DepartmentReportTypeResponse,
    ParentReportDetailResponse,
    ParentReportListItem,
    ParentReportListResponse,
    ReportAttachmentResponse,
    ReportCreateRequest,
    ReportListItem,
    ReportListResponse,
    ReportResponse,
    ReportUpdateRequest,
    ReportVocabularyResponse,
    UserBrief,
)

logger = logging.getLogger(__name__)

_FRENCH_MONTHS = [
    "", "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


# ── Paramètres département ───────────────────────────────────────
async def list_department_report_types(
    department_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> list[DepartmentReportTypeResponse]:
    await org_service.get_or_404(Department, department_id, establishment_id, db)
    result = await db.execute(
        select(DepartmentReportType)
        .where(DepartmentReportType.department_id == department_id)
        .order_by(DepartmentReportType.report_type)
    )
    return [
        DepartmentReportTypeResponse.model_validate(t) for t in result.scalars().all()
    ]


async def assign_department_report_type(
    department_id: uuid.UUID,
    report_type: ReportType,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    await org_service.get_or_404(Department, department_id, establishment_id, db)
    existing = await db.scalar(
        select(DepartmentReportType.id).where(
            DepartmentReportType.department_id == department_id,
            DepartmentReportType.report_type == str(report_type),
        )
    )
    if existing:
        return  # déjà affecté — idempotent
    db.add(
        DepartmentReportType(
            establishment_id=establishment_id,
            department_id=department_id,
            report_type=str(report_type),
        )
    )
    await db.flush()


async def unassign_department_report_type(
    department_id: uuid.UUID,
    report_type: ReportType,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    await org_service.get_or_404(Department, department_id, establishment_id, db)
    row = await db.scalar(
        select(DepartmentReportType).where(
            DepartmentReportType.department_id == department_id,
            DepartmentReportType.report_type == str(report_type),
        )
    )
    if row:
        await db.delete(row)
        await db.flush()


# ── Création ────────────────────────────────────────────────────
async def create_report(
    payload: ReportCreateRequest,
    establishment_id: uuid.UUID,
    author: User,
    db: AsyncSession,
) -> ReportResponse:
    child = await db.scalar(
        select(Child).where(
            Child.id == payload.child_id, Child.establishment_id == establishment_id
        )
    )
    if not child:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enfant introuvable")
    if not child.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Cette fiche enfant est désactivée"
        )
    if child.department_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="L'enfant doit être rattaché à un département pour recevoir des rapports",
        )

    group_id = child.group_id
    if author.role == UserRole.STAFF:
        if child.group_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cet enfant n'est affecté à aucun groupe",
            )
        group = await db.get(Group, child.group_id)
        if not group or group.educatrice_id != author.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous ne pouvez remplir des rapports que pour les enfants de votre groupe",
            )

    await _ensure_department_allows(child.department_id, payload.report_type, db)

    reference = payload.reference_date or date.today()
    if reference > date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La date de référence ne peut pas être dans le futur",
        )
    period_start, period_end, period_label = _period_for(payload.report_type, reference)

    existing = await db.scalar(
        select(Report.id).where(
            Report.child_id == child.id,
            Report.report_type == str(payload.report_type),
            Report.period_start == period_start,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Un rapport {payload.report_type} existe déjà pour cette période",
        )

    content = dict(payload.content)
    if payload.report_type == ReportType.QUOTIDIEN:
        await _prefill_attendance_times(content, child.id, reference, establishment_id, db)
    summary, content = _validate_content(payload.report_type, payload.summary, content)

    report = Report(
        establishment_id=establishment_id,
        child_id=child.id,
        department_id=child.department_id,
        group_id=group_id,
        report_type=str(payload.report_type),
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
        status=str(ReportStatus.DRAFT),
        summary=summary,
        content=content,
        created_by_id=author.id,
    )
    db.add(report)
    await db.flush()
    await db.refresh(report)
    return await _to_response(report, db)


# ── Lecture / liste (staff, admin) ───────────────────────────────
async def list_reports(
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
    *,
    report_status: ReportStatus | None = None,
    report_type: ReportType | None = None,
    child_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
) -> ReportListResponse:
    filters = [Report.establishment_id == establishment_id]

    if current_user.role == UserRole.STAFF:
        led_group_ids = await _led_group_ids(current_user.id, db)
        if not led_group_ids:
            return ReportListResponse(total=0, items=[])
        filters.append(Report.group_id.in_(led_group_ids))

    if report_status:
        filters.append(Report.status == str(report_status))
    if report_type:
        filters.append(Report.report_type == str(report_type))
    if child_id:
        filters.append(Report.child_id == child_id)
    if group_id:
        filters.append(Report.group_id == group_id)

    total = await db.scalar(select(func.count()).select_from(Report).where(*filters))
    result = await db.execute(
        select(Report)
        .where(*filters)
        .order_by(Report.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = [_to_list_item(r) for r in result.scalars().all()]
    return ReportListResponse(total=total or 0, items=items)


async def get_report(
    report_id: uuid.UUID, establishment_id: uuid.UUID, current_user: User, db: AsyncSession
) -> ReportResponse:
    report = await _get_report_or_404(report_id, establishment_id, db)
    await _authorize_read(report, current_user, db)
    return await _to_response(report, db)


# ── Modification / cycle de vie ──────────────────────────────────
async def update_report(
    report_id: uuid.UUID,
    payload: ReportUpdateRequest,
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> ReportResponse:
    report = await _get_report_or_404(report_id, establishment_id, db)
    await _authorize_write(report, current_user, db)
    if report.status not in (str(ReportStatus.DRAFT), str(ReportStatus.REJECTED)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Seul un rapport en brouillon ou rejeté peut être modifié",
        )

    changes = payload.model_dump(exclude_unset=True)
    # Revalider le contenu si l'un ou l'autre change — un summary modifié seul
    # doit rester cohérent avec le content déjà en base, et inversement.
    new_summary = changes.get("summary", report.summary)
    new_content = changes.get("content", report.content)
    if "summary" in changes or "content" in changes:
        new_summary, new_content = _validate_content(
            ReportType(report.report_type), new_summary, new_content
        )

    for field, value in changes.items():
        setattr(report, field, value)
    report.summary = new_summary
    report.content = new_content
    await db.flush()
    await db.refresh(report)
    return await _to_response(report, db)


async def delete_report(
    report_id: uuid.UUID, establishment_id: uuid.UUID, current_user: User, db: AsyncSession
) -> None:
    report = await _get_report_or_404(report_id, establishment_id, db)
    await _authorize_write(report, current_user, db)
    if report.status != str(ReportStatus.DRAFT):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Seul un rapport encore en brouillon (jamais soumis) peut être supprimé",
        )
    await db.delete(report)
    await db.flush()


async def submit_report(
    report_id: uuid.UUID, establishment_id: uuid.UUID, current_user: User, db: AsyncSession
) -> ReportResponse:
    report = await _get_report_or_404(report_id, establishment_id, db)
    await _authorize_write(report, current_user, db)
    if report.status not in (str(ReportStatus.DRAFT), str(ReportStatus.REJECTED)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Seul un rapport en brouillon ou rejeté peut être soumis",
        )


    now = datetime.now(timezone.utc)
    report.submitted_at = now
    report.rejected_reason = None

    if current_user.role == UserRole.ADMIN:
        # Personne au-dessus de l'admin pour approuver : publication immédiate.
        report.status = str(ReportStatus.VALIDATED)
        report.validated_by_id = current_user.id
        report.validated_at = now
        await db.flush()
        await db.refresh(report)
        await _notify_parents(report)
    else:
        report.status = str(ReportStatus.SUBMITTED)
        await db.flush()
        await db.refresh(report)

    return await _to_response(report, db)


async def validate_report(
    report_id: uuid.UUID, establishment_id: uuid.UUID, validator: User, db: AsyncSession
) -> ReportResponse:
    report = await _get_report_or_404(report_id, establishment_id, db)
    if report.status != str(ReportStatus.SUBMITTED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Seul un rapport soumis peut être validé",
        )


    report.status = str(ReportStatus.VALIDATED)
    report.validated_by_id = validator.id
    report.validated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(report)
    await _notify_parents(report)
    return await _to_response(report, db)


async def reject_report(
    report_id: uuid.UUID,
    reason: str,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> ReportResponse:
    report = await _get_report_or_404(report_id, establishment_id, db)
    if report.status != str(ReportStatus.SUBMITTED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Seul un rapport soumis peut être rejeté",
        )
    report.status = str(ReportStatus.REJECTED)
    report.rejected_reason = reason
    await db.flush()
    await db.refresh(report)
    return await _to_response(report, db)


# ── Portail parent ──────────────────────────────────────────────
async def list_my_reports(
    parent: User,
    db: AsyncSession,
    *,
    child_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
) -> ParentReportListResponse:
    child_ids = {c.id for c in parent.assigned_children}
    if child_id:
        if child_id not in child_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enfant introuvable")
        child_ids = {child_id}
    if not child_ids:
        return ParentReportListResponse(total=0, items=[])

    filters = [
        Report.status == str(ReportStatus.VALIDATED),
        Report.child_id.in_(child_ids),
    ]
    total = await db.scalar(select(func.count()).select_from(Report).where(*filters))
    result = await db.execute(
        select(Report)
        .where(*filters)
        .order_by(Report.validated_at.desc())
        .offset(skip)
        .limit(limit)
    )
    reports = result.scalars().all()
    read_ids = await _read_report_ids(parent.id, db)
    items = [_to_parent_list_item(r, is_read=r.id in read_ids) for r in reports]
    return ParentReportListResponse(total=total or 0, items=items)


async def get_my_report(
    report_id: uuid.UUID, parent: User, db: AsyncSession
) -> ParentReportDetailResponse:
    report = await _get_visible_report_or_404(report_id, parent, db)
    read_ids = await _read_report_ids(parent.id, db)
    return await _to_parent_detail(report, db, is_read=report.id in read_ids)


async def get_my_report_pdf(
    report_id: uuid.UUID, parent: User, db: AsyncSession
) -> tuple[bytes, str]:
    """Bulletin PDF — réservé au rapport annuel (seul type dont la mise en
    page « bulletin par domaine » a un sens), consultable par le parent au
    même titre que le rapport lui-même (mêmes règles de visibilité)."""
    report = await _get_visible_report_or_404(report_id, parent, db)
    if report.report_type != str(ReportType.ANNUEL):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le téléchargement PDF n'est disponible que pour le rapport annuel",
        )
    child = report.child
    pdf_bytes = await asyncio.to_thread(
        render_annual_report_pdf,
        establishment_name=report.establishment.name,
        child_full_name=f"{child.first_names} {child.last_name}",
        period_label=report.period_label,
        content=report.content,
    )
    filename = f"bulletin-annuel-{report.period_start.year}-{child.last_name}.pdf"
    return pdf_bytes, filename


async def mark_report_read(report_id: uuid.UUID, parent: User, db: AsyncSession) -> None:
    report = await _get_visible_report_or_404(report_id, parent, db)
    existing = await db.scalar(
        select(ReportRead.id).where(
            ReportRead.report_id == report.id, ReportRead.parent_id == parent.id
        )
    )
    if existing:
        return
    db.add(ReportRead(report_id=report.id, parent_id=parent.id))
    await db.flush()


# ── Helpers privés ──────────────────────────────────────────────
async def _ensure_department_allows(
    department_id: uuid.UUID, report_type: ReportType, db: AsyncSession
) -> None:
    allowed = await db.scalar(
        select(DepartmentReportType.id).where(
            DepartmentReportType.department_id == department_id,
            DepartmentReportType.report_type == str(report_type),
        )
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Le type de rapport « {report_type} » n'est pas activé pour ce département",
        )


def _period_for(report_type: ReportType, reference: date) -> tuple[date, date, str]:
    if report_type == ReportType.QUOTIDIEN:
        label = f"{reference.day} {_FRENCH_MONTHS[reference.month]} {reference.year}"
        return reference, reference, label

    if report_type == ReportType.BI_MENSUEL:
        last_day = calendar.monthrange(reference.year, reference.month)[1]
        if reference.day <= 15:
            start, end = date(reference.year, reference.month, 1), date(reference.year, reference.month, 15)
        else:
            start, end = date(reference.year, reference.month, 16), date(reference.year, reference.month, last_day)
        label = f"{start.day}–{end.day} {_FRENCH_MONTHS[reference.month]} {reference.year}"
        return start, end, label

    # ANNUEL
    start, end = date(reference.year, 1, 1), date(reference.year, 12, 31)
    return start, end, f"Année {reference.year}"


async def _led_group_ids(staff_id: uuid.UUID, db: AsyncSession) -> set[uuid.UUID]:
    result = await db.execute(
        select(Group.id).where(Group.educatrice_id == staff_id, Group.is_active.is_(True))
    )
    return set(result.scalars().all())


async def _authorize_write(report: Report, current_user: User, db: AsyncSession) -> None:
    if current_user.role == UserRole.ADMIN:
        return
    if current_user.role == UserRole.STAFF and report.group_id:
        group = await db.get(Group, report.group_id)
        if group and group.educatrice_id == current_user.id:
            return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Vous n'êtes pas autorisé à modifier ce rapport",
    )


async def _authorize_read(report: Report, current_user: User, db: AsyncSession) -> None:
    if current_user.role == UserRole.ADMIN:
        return
    if current_user.role == UserRole.STAFF and report.group_id:
        led = await _led_group_ids(current_user.id, db)
        if report.group_id in led:
            return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rapport introuvable")


async def _get_report_or_404(
    report_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Report:
    report = await db.scalar(
        select(Report).where(
            Report.id == report_id, Report.establishment_id == establishment_id
        )
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rapport introuvable")
    return report


async def _get_visible_report_or_404(report_id: uuid.UUID, parent: User, db: AsyncSession) -> Report:
    report = await db.scalar(
        select(Report).where(
            Report.id == report_id, Report.status == str(ReportStatus.VALIDATED)
        )
    )
    child_ids = {c.id for c in parent.assigned_children}
    if not report or report.child_id not in child_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rapport introuvable")
    return report


async def _read_report_ids(parent_id: uuid.UUID, db: AsyncSession) -> set[uuid.UUID]:
    result = await db.execute(
        select(ReportRead.report_id).where(ReportRead.parent_id == parent_id)
    )
    return set(result.scalars().all())


async def _notify_parents(report: Report) -> None:
    """
    Best-effort : contrairement au mot de passe temporaire (canal de délivrance
    critique sans filet), le rapport reste consultable sur le portail même si
    l'email échoue — l'échec est journalisé, jamais bloquant ni remonté en erreur.
    """
    child = report.child
    for parent in child.parents:
        if not parent.is_active:
            continue
        try:
            await send_report_available_email(
                to=parent.email,
                parent_first_name=parent.first_name,
                child_first_names=child.first_names,
                child_last_name=child.last_name,
                report_type=report.report_type,
                period_label=report.period_label,
            )
        except EmailDeliveryError:
            logger.exception(
                "Échec d'envoi de la notification de rapport à %s", parent.email
            )


def _child_brief(child: Child) -> ChildBrief:
    return ChildBrief(
        id=child.id, matricule=child.matricule,
        last_name=child.last_name, first_names=child.first_names,
    )


def _user_brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id, first_name=user.first_name, last_name=user.last_name,
        nickname=user.nickname,
    )


def _to_list_item(report: Report) -> ReportListItem:
    return ReportListItem(
        id=report.id,
        child=_child_brief(report.child),
        report_type=ReportType(report.report_type),
        period_start=report.period_start,
        period_end=report.period_end,
        period_label=report.period_label,
        status=report.status,
        created_by=_user_brief(report.created_by),
        submitted_at=report.submitted_at,
        validated_at=report.validated_at,
        created_at=report.created_at,
        updated_at=report.updated_at,
    )


async def _to_response(report: Report, db: AsyncSession) -> ReportResponse:
    item = _to_list_item(report)
    attachments = await _attachments_for_report(report.id, db)
    return ReportResponse(
        **item.model_dump(),
        establishment_id=report.establishment_id,
        department_id=report.department_id,
        group_id=report.group_id,
        summary=report.summary,
        content=report.content,
        validated_by=_user_brief(report.validated_by) if report.validated_by else None,
        rejected_reason=report.rejected_reason,
        attachments=attachments,
    )


def _to_parent_list_item(report: Report, *, is_read: bool) -> ParentReportListItem:
    return ParentReportListItem(
        id=report.id,
        child=_child_brief(report.child),
        report_type=ReportType(report.report_type),
        period_label=report.period_label,
        validated_at=report.validated_at,
        is_read=is_read,
    )


async def _to_parent_detail(
    report: Report, db: AsyncSession, *, is_read: bool
) -> ParentReportDetailResponse:
    attachments = await _attachments_for_report(report.id, db)
    return ParentReportDetailResponse(
        id=report.id,
        child=_child_brief(report.child),
        report_type=ReportType(report.report_type),
        period_start=report.period_start,
        period_end=report.period_end,
        period_label=report.period_label,
        summary=report.summary,
        content=report.content,
        validated_at=report.validated_at,
        is_read=is_read,
        attachments=attachments,
    )


# ── Validation du contenu par type ───────────────────────────────
_CONTENT_SCHEMA_BY_TYPE: dict[ReportType, type] = {
    ReportType.QUOTIDIEN: DailyReportContent,
    ReportType.BI_MENSUEL: BiMensuelReportContent,
    ReportType.ANNUEL: AnnualReportContent,
}


def _validate_content(
    report_type: ReportType, summary: str | None, content: dict
) -> tuple[str | None, dict]:
    """
    `content` DOIT correspondre au schéma structuré du type (422 sinon) ;
    `summary` reste facultatif pour les 3 types, tout est porté par le
    contenu structuré. `schema_by_type` centralise le seul point à toucher
    pour ajouter un futur type de rapport.
    """
    schema = _CONTENT_SCHEMA_BY_TYPE[report_type]
    try:
        validated = schema.model_validate(content)
    except ValidationError as exc:
        # `detail` reste une chaîne, comme partout ailleurs dans l'API — un
        # frontend qui affiche génériquement `error.detail` ne doit jamais
        # avoir à distinguer "ce endpoint-ci renvoie une liste". Le détail
        # champ-par-champ reste lisible, juste aplati en texte.
        messages = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}"
            for e in exc.errors(include_url=False, include_context=False)
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Contenu invalide pour un rapport {report_type} : {messages}",
        ) from exc
    return summary, validated.model_dump(mode="json")


async def _prefill_attendance_times(
    content: dict,
    child_id: uuid.UUID,
    reference: date,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """
    Pré-remplit arrival_time/departure_time depuis les scans de présence du
    jour, SEULEMENT si le client ne les a pas déjà fournis (l'utilisateur
    reste toujours prioritaire — champ éditable, pas figé par le scan).
    """
    if content.get("arrival_time") and content.get("departure_time"):
        return

    settings_row = await db.scalar(
        select(AttendanceSettings).where(
            AttendanceSettings.establishment_id == establishment_id
        )
    )
    tz = ZoneInfo(settings_row.timezone) if settings_row else ZoneInfo("UTC")

    start = datetime(reference.year, reference.month, reference.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    result = await db.execute(
        select(AttendanceEvent).where(
            AttendanceEvent.establishment_id == establishment_id,
            AttendanceEvent.person_type == str(PersonType.CHILD),
            AttendanceEvent.child_id == child_id,
            AttendanceEvent.scanned_at >= start,
            AttendanceEvent.scanned_at < end,
        )
    )
    events = result.scalars().all()
    arrivals = [e.scanned_at for e in events if e.event_type == str(EventType.ARRIVAL)]
    departures = [e.scanned_at for e in events if e.event_type == str(EventType.DEPARTURE)]

    if not content.get("arrival_time") and arrivals:
        content["arrival_time"] = min(arrivals).astimezone(tz).time().isoformat()
    if not content.get("departure_time") and departures:
        content["departure_time"] = max(departures).astimezone(tz).time().isoformat()


# ── Pièces jointes (photos / vidéos) ─────────────────────────────
async def add_report_attachment(
    report_id: uuid.UUID,
    establishment_id: uuid.UUID,
    current_user: User,
    file: UploadFile,
    db: AsyncSession,
) -> ReportAttachmentResponse:
    report = await _get_report_or_404(report_id, establishment_id, db)
    await _authorize_write(report, current_user, db)

    content_bytes = await file.read()
    max_bytes = settings.reports_max_attachment_mb * 1024 * 1024
    if len(content_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Fichier trop volumineux (max {settings.reports_max_attachment_mb} Mo)",
        )
    if not content_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Fichier vide"
        )
    content_type = file.content_type or ""
    if content_type not in settings.reports_allowed_attachment_types_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Type de fichier non autorisé : {content_type or 'inconnu'}. "
                f"Autorisés : {', '.join(sorted(settings.reports_allowed_attachment_types_set))}"
            ),
        )

    storage_key = await storage.save_file("reports", file.filename or "fichier", content_bytes)
    attachment = ReportAttachment(
        report_id=report.id,
        uploaded_by_id=current_user.id,
        filename=file.filename or "fichier",
        content_type=content_type,
        size_bytes=len(content_bytes),
        storage_key=storage_key,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)
    return _attachment_response(attachment)


async def get_report_attachment_for_staff(
    report_id: uuid.UUID,
    attachment_id: uuid.UUID,
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> tuple[ReportAttachment, Path]:
    report = await _get_report_or_404(report_id, establishment_id, db)
    await _authorize_read(report, current_user, db)
    return await _get_attachment_or_404(report.id, attachment_id, db)


async def get_report_attachment_for_parent(
    report_id: uuid.UUID, attachment_id: uuid.UUID, parent: User, db: AsyncSession
) -> tuple[ReportAttachment, Path]:
    report = await _get_visible_report_or_404(report_id, parent, db)
    return await _get_attachment_or_404(report.id, attachment_id, db)


async def _get_attachment_or_404(
    report_id: uuid.UUID, attachment_id: uuid.UUID, db: AsyncSession
) -> tuple[ReportAttachment, Path]:
    attachment = await db.scalar(
        select(ReportAttachment).where(
            ReportAttachment.id == attachment_id, ReportAttachment.report_id == report_id
        )
    )
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pièce jointe introuvable"
        )
    return attachment, storage.resolve_path(attachment.storage_key)


async def _attachments_for_report(
    report_id: uuid.UUID, db: AsyncSession
) -> list[ReportAttachmentResponse]:
    result = await db.execute(
        select(ReportAttachment)
        .where(ReportAttachment.report_id == report_id)
        .order_by(ReportAttachment.created_at)
    )
    return [_attachment_response(a) for a in result.scalars().all()]


def _attachment_response(attachment: ReportAttachment) -> ReportAttachmentResponse:
    return ReportAttachmentResponse(
        id=attachment.id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        uploaded_by=_user_brief(attachment.uploaded_by),
        created_at=attachment.created_at,
        url=f"/api/v1/reports/{attachment.report_id}/attachments/{attachment.id}",
    )


# ── Vocabulaire (labels FR pour le frontend) ─────────────────────
def get_vocabulary() -> ReportVocabularyResponse:
    return ReportVocabularyResponse(
        health_status={s.value: l for s, l in HEALTH_STATUS_LABELS.items()},
        meal_amount={s.value: l for s, l in MEAL_AMOUNT_LABELS.items()},
        mood={s.value: l for s, l in MOOD_LABELS.items()},
        behavior_tag={s.value: l for s, l in BEHAVIOR_TAG_LABELS.items()},
        class_behavior={s.value: l for s, l in CLASS_BEHAVIOR_LABELS.items()},
        peer_relation={s.value: l for s, l in PEER_RELATION_LABELS.items()},
        emotion_management={s.value: l for s, l in EMOTION_MANAGEMENT_LABELS.items()},
        acquisition_level={s.value: l for s, l in ACQUISITION_LEVEL_LABELS.items()},
    )
