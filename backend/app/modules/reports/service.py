import asyncio
import copy
import calendar
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from enum import StrEnum
from zoneinfo import ZoneInfo

from fastapi import HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import links, media, storage
from app.core.config import settings
from app.core.i18n import DEFAULT_LOCALE, Locale, coerce_locale, current_locale, t
from app.core.translation import TranslationUnavailable, translate_texts
from app.modules.attendance.models import AttendanceEvent, AttendanceSettings, EventType, PersonType
from app.modules.auth.email import EmailDeliveryError
from app.modules.auth.models import User, UserRole
from app.modules.rbac.dependencies import user_permission_codes
from app.modules.rbac.models import PermissionCode
from app.modules.children.models import Child
from app.modules.organization import service as org_service
from app.modules.organization.models import Department, Group, Section
from app.modules.notifications.service import notify_parents_report_validated
from app.modules.reports.email import send_report_available_email
from app.modules.reports.models import (
    AcquisitionLevel,
    BehaviorTag,
    ClassBehavior,
    DepartmentReportType,
    EmotionManagement,
    HealthStatus,
    MealAmount,
    Mood,
    PeerRelation,
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
    MissingReportItem,
    MissingReportResponse,
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

def period_label(
    report_type: ReportType | str,
    period_start: date,
    period_end: date,
    locale: Locale | str | None = None,
) -> str:
    """Libellé de période, recalculé À LA LECTURE depuis les dates stockées.

    La colonne `reports.period_label` conserve la version française posée à la
    création ; elle n'est jamais ce qui s'affiche. Un libellé figé en base ne
    pourrait pas suivre la langue du lecteur — or le même rapport est lu par
    une éducatrice francophone et un parent anglophone.
    """
    month = t(f"date.month.{period_start.month}", locale)
    if report_type == ReportType.ANNUEL:
        return t("reports.period.annuel", locale, year=period_start.year)
    if report_type == ReportType.BI_MENSUEL:
        return t("reports.period.bi_mensuel", locale,
                 first=period_start.day, last=period_end.day,
                 month=month, year=period_start.year)
    return t("reports.period.quotidien", locale,
             day=period_start.day, month=month, year=period_start.year)


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.child_not_found"))
    if not child.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=t("errors.common.child_inactive")
        )
    if child.department_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.reports.child_no_department"),
        )

    group_id = child.group_id
    if author.role == UserRole.STAFF:
        if child.group_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=t("errors.reports.child_no_group"),
            )
        group = await db.get(Group, child.group_id)
        if not group or group.educatrice_id != author.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=t("errors.reports.own_group_only"),
            )

    await _ensure_department_allows(child.department_id, payload.report_type, db)

    reference = payload.reference_date or date.today()
    if reference > date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.reports.reference_date_future"),
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
            detail=t("errors.reports.period_exists", report_type=payload.report_type),
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
    await _translate_report(report, db)
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
    search: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> ReportListResponse:
    filters = [Report.establishment_id == establishment_id]

    if current_user.role == UserRole.STAFF:
        led_group_ids = await _led_group_ids(current_user.id, db)
        # Un validateur (reports:validate, ex. directrice sans groupe mené)
        # doit pouvoir TROUVER les rapports soumis pour les valider : la
        # validation elle-même est sans restriction de groupe, la lecture ne
        # peut pas être plus étroite. Il voit le soumis/validé de tout
        # l'établissement + l'intégralité de ses propres groupes.
        can_validate_all = (
            PermissionCode.REPORTS_VALIDATE.value
            in user_permission_codes(current_user)
        )
        if led_group_ids and can_validate_all:
            filters.append(
                or_(
                    Report.group_id.in_(led_group_ids),
                    Report.status.in_(
                        [str(ReportStatus.SUBMITTED), str(ReportStatus.VALIDATED)]
                    ),
                )
            )
        elif led_group_ids:
            filters.append(Report.group_id.in_(led_group_ids))
        elif can_validate_all:
            filters.append(
                Report.status.in_(
                    [str(ReportStatus.SUBMITTED), str(ReportStatus.VALIDATED)]
                )
            )
        else:
            return ReportListResponse(total=0, items=[])

    if report_status:
        filters.append(Report.status == str(report_status))
    if report_type:
        filters.append(Report.report_type == str(report_type))
    if child_id:
        filters.append(Report.child_id == child_id)
    if group_id:
        filters.append(Report.group_id == group_id)
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Child.last_name.ilike(pattern),
                Child.first_names.ilike(pattern),
                Child.matricule.ilike(pattern),
            )
        )

    count_stmt = select(func.count()).select_from(Report)
    select_stmt = select(Report)
    if search:
        # Jointure nécessaire pour filtrer sur les colonnes de l'enfant.
        count_stmt = count_stmt.join(Child, Child.id == Report.child_id)
        select_stmt = select_stmt.join(Child, Child.id == Report.child_id)
    total = await db.scalar(count_stmt.where(*filters))
    result = await db.execute(
        select_stmt.where(*filters)
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
    # L'admin peut modifier un rapport à tout moment (même soumis, validé et
    # déjà lu par le parent) ; le staff reste limité au brouillon / rejeté.
    _ensure_mutable(report, current_user)

    changes = payload.model_dump(exclude_unset=True)
    # Revalider le contenu si l'un ou l'autre change — un summary modifié seul
    # doit rester cohérent avec le content déjà en base, et inversement.
    new_summary = changes.get("summary", report.summary)
    new_content = changes.get("content", report.content)
    if "summary" in changes or "content" in changes:
        new_summary, new_content = _validate_content(
            ReportType(report.report_type), new_summary, new_content
        )

    previous_content, previous_summary = report.content, report.summary
    for field, value in changes.items():
        setattr(report, field, value)
    report.summary = new_summary
    report.content = new_content
    if previous_content != report.content or previous_summary != report.summary:
        await _translate_report(
            report, db,
            previous_content=previous_content, previous_summary=previous_summary,
        )
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
            detail=t("errors.reports.only_draft_deletable"),
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
            detail=t("errors.reports.only_draft_submittable"),
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
        # Push notification : envoie aux parents que le rapport est validé
        await _send_report_push_notifications(report, db)
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
            detail=t("errors.reports.only_submitted_validatable"),
        )


    report.status = str(ReportStatus.VALIDATED)
    report.validated_by_id = validator.id
    report.validated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(report)
    await _notify_parents(report)
    # Push notification : envoie aux parents que le rapport est validé
    await _send_report_push_notifications(report, db)
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
            detail=t("errors.reports.only_submitted_rejectable"),
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.child_not_found"))
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
            detail=t("errors.reports.pdf_annual_only"),
        )
    child = report.child
    locale = coerce_locale(parent.locale)
    pdf_bytes = await asyncio.to_thread(
        render_annual_report_pdf,
        establishment_name=report.establishment.name,
        child_full_name=f"{child.first_names} {child.last_name}",
        period_label=_label_of(report, locale),
        # Le bulletin part dans la langue du PARENT : son contenu aussi.
        content=_localized_content(report, locale)[0],
        locale=locale,
    )
    filename = t(
        "reports.pdf.filename", locale,
        year=report.period_start.year, name=child.last_name,
    )
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
            detail=t("errors.reports.type_not_enabled", report_type=report_type),
        )


def _label_of(report: "Report", locale: Locale | str | None = None) -> str:
    """Libellé de période d'un rapport chargé — raccourci sur `period_label()`."""
    return period_label(
        report.report_type, report.period_start, report.period_end, locale
    )


def _period_for(report_type: ReportType, reference: date) -> tuple[date, date, str]:
    """(début, fin, libellé français). Le libellé n'alimente que la colonne
    `reports.period_label` ; l'affichage passe par `period_label()`."""
    if report_type == ReportType.QUOTIDIEN:
        return reference, reference, period_label(
            report_type, reference, reference, Locale.FR
        )

    if report_type == ReportType.BI_MENSUEL:
        last_day = calendar.monthrange(reference.year, reference.month)[1]
        if reference.day <= 15:
            start, end = date(reference.year, reference.month, 1), date(reference.year, reference.month, 15)
        else:
            start, end = date(reference.year, reference.month, 16), date(reference.year, reference.month, last_day)
        return start, end, period_label(report_type, start, end, Locale.FR)

    # ANNUEL
    start, end = date(reference.year, 1, 1), date(reference.year, 12, 31)
    return start, end, period_label(report_type, start, end, Locale.FR)


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
        detail=t("errors.reports.cannot_edit"),
    )


def _ensure_mutable(report: Report, current_user: User) -> None:
    """Garde-fou de statut pour toute modification (contenu ou médias).

    L'admin peut modifier un rapport à tout moment — même validé et déjà lu par
    le parent. Le staff (éducatrice de son groupe) le peut tant que le rapport
    n'est pas VALIDÉ : brouillon, rejeté, et soumis.

    ⚠️ Le soumis a été ouvert sur décision explicite de l'utilisateur. La règle
    d'origine s'arrêtait au rejeté, et une éducatrice qui avait soumis son
    rapport ne pouvait plus y joindre les photos de la journée — remonté depuis
    l'établissement. La limite se place donc à la VALIDATION, qui est le moment
    où le parent découvre le rapport : avant, rien ne lui a échappé ; après,
    modifier reviendrait à changer sous ses yeux ce qu'il a déjà lu, sans qu'il
    en soit prévenu.

    Contrepartie assumée : un validateur peut voir le contenu bouger pendant sa
    relecture. C'est le prix du besoin réel (les photos arrivent après la
    rédaction), et l'alternative — faire rejeter le rapport pour le reprendre —
    coûtait un aller-retour à chaque photo oubliée.
    """
    if current_user.role == UserRole.ADMIN:
        return
    if report.status not in (
        str(ReportStatus.DRAFT),
        str(ReportStatus.REJECTED),
        str(ReportStatus.SUBMITTED),
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.reports.only_draft_editable"),
        )


async def _authorize_read(report: Report, current_user: User, db: AsyncSession) -> None:
    if current_user.role == UserRole.ADMIN:
        return
    if current_user.role == UserRole.STAFF and report.group_id:
        led = await _led_group_ids(current_user.id, db)
        if report.group_id in led:
            return
        # Validateur sans groupe mené : peut ouvrir un soumis/validé pour le
        # valider (cohérent avec validate_report, sans restriction de groupe).
        # Les brouillons/rejetés des autres groupes restent invisibles.
        if (
            PermissionCode.REPORTS_VALIDATE.value in user_permission_codes(current_user)
            and report.status
            in (str(ReportStatus.SUBMITTED), str(ReportStatus.VALIDATED))
        ):
            return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.reports.not_found"))


async def _get_report_or_404(
    report_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Report:
    report = await db.scalar(
        select(Report).where(
            Report.id == report_id, Report.establishment_id == establishment_id
        )
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.reports.not_found"))
    return report


async def _get_visible_report_or_404(report_id: uuid.UUID, parent: User, db: AsyncSession) -> Report:
    report = await db.scalar(
        select(Report).where(
            Report.id == report_id, Report.status == str(ReportStatus.VALIDATED)
        )
    )
    child_ids = {c.id for c in parent.assigned_children}
    if not report or report.child_id not in child_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.reports.not_found"))
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
                period_label=_label_of(report, coerce_locale(parent.locale)),
                locale=coerce_locale(parent.locale),
            )
        except EmailDeliveryError:
            logger.exception(
                "Échec d'envoi de la notification de rapport à %s", parent.email
            )


async def _send_report_push_notifications(report: Report, db) -> int:
    """
    Envoie des notifications push aux parents lorsqu'un rapport est validé.
    Best-effort : l'échec ne bloque pas la consultation du rapport sur le portail.
    """
    from app.modules.notifications.models import PushSubscription
    from app.modules.notifications.service import send_push_to_subscription

    child = report.child
    establishment_id = child.establishment_id

    sent = 0
    for parent in child.parents:
        if not parent.is_active:
            continue
        sub_result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == parent.id)
        )
        subscriptions = sub_result.scalars().all()

        for sub in subscriptions:
            # Le rendu se fait ici, par parent : le même rapport notifie
            # plusieurs comptes, qui n'ont pas forcément la même langue.
            locale = coerce_locale(parent.locale)
            success = await send_push_to_subscription(
                sub,
                t("push.report.title", locale),
                t("push.report.body", locale,
                  period=_label_of(report, locale), child=child.first_names),
                {"report_id": str(report.id), "child_id": str(child.id),
                 "url": links.PARENT_REPORTS},
            )
            if success:
                sent += 1

    return sent


def _child_brief(child: Child) -> ChildBrief:
    return ChildBrief(
        id=child.id, matricule=child.matricule,
        last_name=child.last_name, first_names=child.first_names,
    )


async def list_missing_reports(
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
    *,
    report_type: ReportType,
    target: date,
    department_id: uuid.UUID | None = None,
    section_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
) -> MissingReportResponse:
    """Enfants actifs sans rapport soumis/validé pour la période contenant
    `target` (jour lui-même / quinzaine / année selon le type).

    Évite à l'admin d'aller croiser la liste des absences : un seul appel dit
    qui n'a rien soumis. Scope : l'éducatrice ne voit que ses groupes menés
    (filtres département/section/groupe ignorés pour elle — son périmètre est
    déjà son groupe) ; l'admin voit tout l'établissement, filtrable.
    `has_draft` signale un brouillon/rejeté en cours (rien de soumis quand même).
    """
    period_start, _period_end, period_label = _period_for(report_type, target)

    # Seuls les enfants dont le département a CE type activé comptent : un
    # département lié uniquement au quotidien ne fait pas grimper les
    # « non soumis » du bi-mensuel/annuel (et inversement). Cohérent avec la
    # création, qui exige le type actif pour le département de l'enfant.
    type_dept_ids = select(DepartmentReportType.department_id).where(
        DepartmentReportType.establishment_id == establishment_id,
        DepartmentReportType.report_type == str(report_type),
    )
    child_filters = [
        Child.establishment_id == establishment_id,
        Child.is_active.is_(True),
        Child.department_id.in_(type_dept_ids),
    ]
    if current_user.role == UserRole.STAFF:
        led_group_ids = await _led_group_ids(current_user.id, db)
        if not led_group_ids:
            return MissingReportResponse(
                report_type=report_type, date=target,
                period_start=period_start, period_label=period_label,
                total=0, items=[],
            )
        child_filters.append(Child.group_id.in_(led_group_ids))
    else:
        if department_id:
            child_filters.append(Child.department_id == department_id)
        if section_id:
            child_filters.append(Child.section_id == section_id)
        if group_id:
            child_filters.append(Child.group_id == group_id)

    result = await db.execute(
        select(Child).where(*child_filters).order_by(Child.last_name, Child.first_names)
    )
    children = result.scalars().all()
    if not children:
        return MissingReportResponse(
            report_type=report_type, date=target,
            period_start=period_start, period_label=period_label,
            total=0, items=[],
        )

    child_ids = [c.id for c in children]
    reports = (
        await db.execute(
            select(Report.child_id, Report.status).where(
                Report.establishment_id == establishment_id,
                Report.report_type == str(report_type),
                Report.period_start == period_start,
                Report.child_id.in_(child_ids),
            )
        )
    ).all()
    submitted_ids = {
        cid for cid, st in reports
        if st in (str(ReportStatus.SUBMITTED), str(ReportStatus.VALIDATED))
    }
    draft_ids = {
        cid for cid, st in reports
        if st in (str(ReportStatus.DRAFT), str(ReportStatus.REJECTED))
    }

    section_ids = {c.section_id for c in children if c.section_id}
    section_names: dict[uuid.UUID, str] = {}
    if section_ids:
        rows = (
            await db.execute(
                select(Section.id, Section.name).where(Section.id.in_(section_ids))
            )
        ).all()
        section_names = {sid: name for sid, name in rows}

    items = [
        MissingReportItem(
            child=_child_brief(c),
            section_name=section_names.get(c.section_id) if c.section_id else None,
            has_draft=c.id in draft_ids,
        )
        for c in children
        if c.id not in submitted_ids
    ]
    return MissingReportResponse(
        report_type=report_type, date=target,
        period_start=period_start, period_label=period_label,
        total=len(items), items=items,
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
        period_label=_label_of(report),
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


# ── Traduction du contenu rédigé par l'éducatrice ────────────────
# Seuls les champs de TEXTE LIBRE sont traduits. Les énumérations (humeurs,
# comportements, niveaux d'acquisition) portent des codes stables, déjà rendus
# dans la langue du lecteur par les catalogues et par `GET /reports/vocabulary`.
_TRANSLATABLE_PATHS: dict[str, tuple[str, ...]] = {
    str(ReportType.QUOTIDIEN): ("health_notes", "highlight", "activities"),
    str(ReportType.BI_MENSUEL): (
        "oral_written_language", "physical_activities", "artistic_activities",
        "math_foundations", "world_exploration", "english", "teacher_observations",
    ),
    str(ReportType.ANNUEL): (
        "oral_written_language.observation", "physical_activities.observation",
        "artistic_activities.observation", "math_foundations.observation",
        "world_exploration.observation", "english.observation",
    ),
}


def _dig(tree: dict | None, path: str):
    node = tree or {}
    for part in path.split("."):
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    return node


def _plant(tree: dict, path: str, value) -> None:
    parts = path.split(".")
    node = tree
    for part in parts[:-1]:
        node = node.setdefault(part, {})
    node[parts[-1]] = value


def _translatable_slots(report_type: str, content: dict, summary: str | None):
    """Emplacements traduisibles : (chemin, index de liste ou None, texte).

    Les activités du rapport quotidien sont une LISTE de chaînes : chaque
    entrée est un emplacement à part, pour que l'ajout d'une activité ne
    rejette pas la traduction des précédentes.
    """
    slots = []
    for path in _TRANSLATABLE_PATHS.get(report_type, ()):
        value = _dig(content, path)
        if isinstance(value, list):
            for index, item in enumerate(value):
                if isinstance(item, str) and item.strip():
                    slots.append((path, index, item))
        elif isinstance(value, str) and value.strip():
            slots.append((path, None, value))
    if summary and summary.strip():
        slots.append((_SUMMARY_PATH, None, summary))
    return slots


# Le résumé est une colonne à part, pas un champ de `content` ; on le fait
# voyager dans le même lot pour n'émettre qu'un seul appel par rapport.
_SUMMARY_PATH = "__summary__"


async def _translate_report(
    report: Report,
    db: AsyncSession,
    *,
    previous_content: dict | None = None,
    previous_summary: str | None = None,
) -> None:
    """Remplit la version anglaise — best-effort, jamais bloquant.

    Tout le rapport part en UN appel : un bulletin annuel compte six
    observations, un quotidien jusqu'à une dizaine d'entrées. La mémoire de
    traduction ne renvoie au modèle que ce qui est réellement inédit.

    En cas d'échec, on ne jette pas toute la version anglaise : les champs dont
    le texte FRANÇAIS n'a pas changé gardent la leur — elle reste exacte. Ceux
    dont le français a bougé sont écartés : afficher l'observation de la
    période précédente sur un enfant serait pire qu'un repli en français.
    C'est la règle des créneaux de menu, appliquée aux champs d'un rapport.
    """
    slots = _translatable_slots(report.report_type, report.content, report.summary)
    if not slots:
        report.content_en, report.summary_en = None, None
        report.translation_pending = False
        return

    try:
        translated = await translate_texts([text for _p, _i, text in slots], db)
    except TranslationUnavailable as exc:
        logger.info("Traduction du rapport %s non aboutie : %s", report.id, exc)
        kept_content, kept_summary = _salvage_report_english(
            report, previous_content, previous_summary
        )
        report.content_en, report.summary_en = kept_content, kept_summary
        report.translation_pending = needs_translation(report)
        return

    content_en: dict = {}
    summary_en: str | None = None
    for (path, index, _source), value in zip(slots, translated):
        if not value or not value.strip():
            continue
        if path == _SUMMARY_PATH:
            summary_en = value
        elif index is None:
            _plant(content_en, path, value)
        else:
            existing = _dig(content_en, path)
            if not isinstance(existing, list):
                existing = [None] * (index + 1)
            while len(existing) <= index:
                existing.append(None)
            existing[index] = value
            _plant(content_en, path, existing)
    report.content_en = content_en or None
    report.summary_en = summary_en
    report.translation_pending = needs_translation(report)


def _salvage_report_english(
    report: Report, previous_content: dict | None, previous_summary: str | None
) -> tuple[dict | None, str | None]:
    """Traductions encore valables après un échec : celles dont le français est
    inchangé. Sans contenu précédent (création), il n'y a rien à récupérer."""
    if previous_content is None:
        return None, None
    old_en = report.content_en or {}
    kept: dict = {}
    for path in _TRANSLATABLE_PATHS.get(report.report_type, ()):
        old_fr, new_fr = _dig(previous_content, path), _dig(report.content, path)
        old_tr = _dig(old_en, path)
        if old_tr is None:
            continue
        if isinstance(new_fr, list) and isinstance(old_fr, list) and isinstance(old_tr, list):
            survivors = [
                old_tr[i] if i < len(old_tr) and i < len(old_fr) and old_fr[i] == item else None
                for i, item in enumerate(new_fr)
            ]
            if any(survivors):
                _plant(kept, path, survivors)
        elif old_fr == new_fr:
            _plant(kept, path, old_tr)
    summary_kept = (
        report.summary_en if previous_summary == report.summary else None
    )
    return kept or None, summary_kept


def needs_translation(report: Report) -> bool:
    """Un champ de texte libre au moins est rempli en français sans anglais.

    Un rapport ne porte aucun statut de traduction : l'état se lit dans les
    données. C'est plus juste pour un contenu qu'un admin peut retoucher champ
    par champ à tout moment, y compris après validation.
    """
    slots = _translatable_slots(report.report_type, report.content, report.summary)
    if not slots:
        return False
    content_en = report.content_en or {}
    for path, index, _text in slots:
        if path == _SUMMARY_PATH:
            if not report.summary_en:
                return True
            continue
        value = _dig(content_en, path)
        if index is None:
            if not (isinstance(value, str) and value.strip()):
                return True
        elif not (isinstance(value, list) and index < len(value) and value[index]):
            return True
    return False


async def retranslate_report(report: Report, db: AsyncSession) -> None:
    """Relance la traduction d'un rapport déjà stocké — tâche de reprise.

    Le contenu sert aussi de `previous` : le français n'ayant pas changé, les
    traductions déjà obtenues sont toutes conservées en cas de nouvel échec, et
    la mémoire sert les champs inchangés sans appel au modèle.
    """
    await _translate_report(
        report, db,
        previous_content=report.content, previous_summary=report.summary,
    )


def _localized_content(report: Report, locale: Locale) -> tuple[dict, str | None]:
    """Contenu dans la langue du LECTEUR, repli CHAMP PAR CHAMP.

    Par champ et non par rapport : un bulletin dont une seule observation
    manque en anglais doit afficher les cinq autres traduites, pas revenir
    entièrement au français.
    """
    if locale is DEFAULT_LOCALE or not report.content_en:
        return report.content, report.summary

    merged = copy.deepcopy(report.content)
    for path in _TRANSLATABLE_PATHS.get(report.report_type, ()):
        value = _dig(report.content_en, path)
        if isinstance(value, list):
            source = _dig(merged, path)
            if isinstance(source, list):
                _plant(merged, path, [
                    value[i] if i < len(value) and value[i] else item
                    for i, item in enumerate(source)
                ])
        elif isinstance(value, str) and value.strip():
            _plant(merged, path, value)
    return merged, (report.summary_en or report.summary)


def _to_parent_list_item(report: Report, *, is_read: bool) -> ParentReportListItem:
    return ParentReportListItem(
        id=report.id,
        child=_child_brief(report.child),
        report_type=ReportType(report.report_type),
        period_label=_label_of(report),
        validated_at=report.validated_at,
        is_read=is_read,
    )


async def _to_parent_detail(
    report: Report, db: AsyncSession, *, is_read: bool
) -> ParentReportDetailResponse:
    attachments = await _attachments_for_report(report.id, db)
    # Le parent lit dans SA langue, champ par champ (cf. `_localized_content`).
    content, summary = _localized_content(report, current_locale())
    return ParentReportDetailResponse(
        id=report.id,
        child=_child_brief(report.child),
        report_type=ReportType(report.report_type),
        period_start=report.period_start,
        period_end=report.period_end,
        period_label=_label_of(report),
        summary=summary,
        content=content,
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
            detail=t("errors.reports.invalid_content", report_type=report_type, messages=messages),
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
    _ensure_mutable(report, current_user)

    # Le type réel est lu dans les octets, et une image trop lourde est
    # recompressée au lieu d'être refusée — cf. `app/core/media.py`.
    accepted = await media.accept_upload(
        file,
        await file.read(),
        max_image_mb=settings.reports_max_attachment_mb,
        max_video_mb=settings.reports_max_attachment_mb,
        allow_video=True,
    )

    storage_key = await storage.save_file("reports", accepted.filename, accepted.content)
    attachment = ReportAttachment(
        report_id=report.id,
        uploaded_by_id=current_user.id,
        filename=accepted.filename,
        content_type=accepted.content_type,
        size_bytes=len(accepted.content),
        storage_key=storage_key,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)
    return _attachment_response(attachment)


async def delete_report_attachment(
    report_id: uuid.UUID,
    attachment_id: uuid.UUID,
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> None:
    """Retire un média d'un rapport (ligne en base + fichier sur disque).

    Mêmes règles que toute modification : l'admin à tout moment, le staff
    seulement en brouillon / rejeté. Le fichier manquant sur disque n'est
    pas une erreur (suppression best-effort côté stockage).
    """
    report = await _get_report_or_404(report_id, establishment_id, db)
    await _authorize_write(report, current_user, db)
    _ensure_mutable(report, current_user)
    attachment = await db.scalar(
        select(ReportAttachment).where(
            ReportAttachment.id == attachment_id, ReportAttachment.report_id == report.id
        )
    )
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.attachment_not_found")
        )
    await db.delete(attachment)
    await db.flush()
    await storage.delete_file(attachment.storage_key)


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
            status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.attachment_not_found")
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
# Groupes du vocabulaire : nom exposé par l'API → enum des codes. Les libellés
# eux-mêmes vivent dans app/locales/{fr,en}.py — ce module ne connaît que les
# codes, et le PDF du bulletin lit le même catalogue (cf. reports/pdf.py).
VOCABULARY_GROUPS: dict[str, type[StrEnum]] = {
    "health_status": HealthStatus,
    "meal_amount": MealAmount,
    "mood": Mood,
    "behavior_tag": BehaviorTag,
    "class_behavior": ClassBehavior,
    "peer_relation": PeerRelation,
    "emotion_management": EmotionManagement,
    "acquisition_level": AcquisitionLevel,
}


def vocabulary_label(group: str, code: str, locale: Locale | str | None = None) -> str:
    """Libellé d'UNE valeur de vocabulaire — point d'entrée unique, partagé
    par l'API et la génération de documents."""
    return t(f"reports.vocabulary.{group}.{code}", locale)


def get_vocabulary(locale: Locale | str | None = None) -> ReportVocabularyResponse:
    """Libellés des listes/cases du formulaire, dans la langue demandée.

    Contrairement aux permissions RBAC (codes seuls, traduits côté frontend),
    ce vocabulaire reste rendu ici : le PDF du bulletin annuel a besoin des
    mêmes chaînes, et une seconde copie côté frontend finirait par diverger.
    """
    return ReportVocabularyResponse(**{
        group: {code.value: vocabulary_label(group, code.value, locale)
                for code in enum}
        for group, enum in VOCABULARY_GROUPS.items()
    })
