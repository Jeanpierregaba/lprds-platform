import uuid
from datetime import date as date_

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.attendance import service
from app.modules.attendance.models import PersonType
from app.modules.attendance.schemas import (
    AttendanceEventListResponse,
    AttendanceEventResponse,
    AttendanceGeneralSettingsRequest,
    AttendanceGeneralSettingsResponse,
    AttendanceSettingsRequest,
    ChildDailyStatusListResponse,
    DepartmentAttendanceSettingsResponse,
    ExportFileFormat,
    ExportPersonType,
    QRCodeResponse,
    ScanRequest,
    StaffDailyStatusListResponse,
    StaffExemptionRequest,
    StaffExemptionResponse,
    StaffScheduleRequest,
    StaffScheduleResponse,
    VerifyQrRequest,
    VerifyQrResponse,
)
from app.modules.attendance.dependencies import get_staff
from app.modules.auth.models import User
from app.modules.rbac.dependencies import require_permission
from app.modules.rbac.models import PermissionCode

router = APIRouter(prefix="/attendance", tags=["attendance"])

_scan = require_permission(PermissionCode.ATTENDANCE_SCAN)
_read = require_permission(PermissionCode.ATTENDANCE_READ)
_write = require_permission(PermissionCode.ATTENDANCE_WRITE)


# ── QR codes ────────────────────────────────────────────────────
@router.get("/qrcode/child/{child_id}", response_model=QRCodeResponse)
async def get_child_qrcode(
    child_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> QRCodeResponse:
    """Payload à encoder dans l'image QR côté frontend (pas de génération d'image ici)."""
    return await service.get_child_qrcode(child_id, user.establishment_id, db)


@router.get("/qrcode/staff/{staff_id}", response_model=QRCodeResponse)
async def get_staff_qrcode(
    staff_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> QRCodeResponse:
    return await service.get_staff_qrcode(staff_id, user.establishment_id, db)


# ── Scan ────────────────────────────────────────────────────────
@router.post("/scan/verify", response_model=VerifyQrResponse)
async def verify_scan_qr(
    payload: VerifyQrRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_scan),
) -> VerifyQrResponse:
    """Valide un QR scanné sans créer d'événement. Retourne le type de personne,
    son nom d'affichage et l'état du jour (déjà arrivé/parti/cantine) pour
    suggérer le bon type d'événement avant d'autoriser le pointage."""
    return await service.verify_qr(payload, user.establishment_id, db)


@router.post("/scan", response_model=AttendanceEventResponse, status_code=status.HTTP_201_CREATED)
async def scan(
    payload: ScanRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_scan),
) -> AttendanceEventResponse:
    """Enregistre un scan QR : arrivée, départ, ou cantine (staff uniquement)."""
    return await service.scan(payload, user.establishment_id, user, db)


# ── Journal des événements ────────────────────────────────────────
@router.get("/events", response_model=AttendanceEventListResponse)
async def list_events(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read),
    person_type: PersonType | None = Query(default=None),
    child_id: uuid.UUID | None = Query(default=None),
    staff_id: uuid.UUID | None = Query(default=None),
    date_from: date_ | None = Query(default=None),
    date_to: date_ | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> AttendanceEventListResponse:
    return await service.list_events(
        user.establishment_id, db,
        person_type=person_type, child_id=child_id, staff_id=staff_id,
        date_from=date_from, date_to=date_to, skip=skip, limit=limit,
    )


# ── Tableaux de bord journaliers ─────────────────────────────────
@router.get("/daily/children", response_model=ChildDailyStatusListResponse)
async def get_children_daily_status(
    target_date: date_ = Query(alias="date"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read),
    department_id: uuid.UUID | None = Query(default=None),
    section_id: uuid.UUID | None = Query(default=None),
) -> ChildDailyStatusListResponse:
    return await service.get_children_daily_status(
        user.establishment_id, target_date, db,
        department_id=department_id, section_id=section_id,
    )


@router.get("/daily/my-group", response_model=ChildDailyStatusListResponse)
async def get_my_group_daily_status(
    target_date: date_ = Query(alias="date"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_staff),
) -> ChildDailyStatusListResponse:
    """« Présence » du portail staff — hors RBAC (aucune permission
    attendance:read requise), scopé au(x) groupe(s) menés par l'educatrice."""
    return await service.get_my_group_daily_status(
        user.id, user.establishment_id, target_date, db
    )


@router.get("/daily/staff", response_model=StaffDailyStatusListResponse)
async def get_staff_daily_status(
    target_date: date_ = Query(alias="date"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read),
) -> StaffDailyStatusListResponse:
    return await service.get_staff_daily_status(user.establishment_id, target_date, db)


# ── Paramètres : horaires par département (enfants) ──────────────
@router.get(
    "/settings/departments/{department_id}",
    response_model=DepartmentAttendanceSettingsResponse,
)
async def get_department_settings(
    department_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> DepartmentAttendanceSettingsResponse:
    return await service.get_department_settings(department_id, user.establishment_id, db)


@router.put(
    "/settings/departments/{department_id}",
    response_model=DepartmentAttendanceSettingsResponse,
)
async def set_department_settings(
    department_id: uuid.UUID,
    payload: AttendanceSettingsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> DepartmentAttendanceSettingsResponse:
    """Crée ou remplace les horaires normaux du département (calcul du retard)."""
    return await service.upsert_department_settings(
        department_id, payload, user.establishment_id, db
    )


# ── Paramètres généraux : fuseau horaire + horaires du personnel ──
# Tout le personnel partage les mêmes horaires (contrairement aux enfants,
# découpés par département) ; le fuseau s'applique aux deux calculs de retard.
@router.get("/settings/general", response_model=AttendanceGeneralSettingsResponse)
async def get_general_settings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> AttendanceGeneralSettingsResponse:
    return await service.get_general_settings(user.establishment_id, db)


@router.put("/settings/general", response_model=AttendanceGeneralSettingsResponse)
async def set_general_settings(
    payload: AttendanceGeneralSettingsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> AttendanceGeneralSettingsResponse:
    """Crée ou remplace le fuseau horaire et les horaires normaux du personnel."""
    return await service.upsert_general_settings(payload, user.establishment_id, db)


# ── Horaires personnalisés (staff) ───────────────────────────────
# Un staff sans ligne ici suit l'horaire général de l'établissement
# (/settings/general) ; dès qu'une ligne est posée, elle le surcharge.
@router.get("/settings/staff/{staff_id}", response_model=StaffScheduleResponse)
async def get_staff_schedule(
    staff_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> StaffScheduleResponse:
    return await service.get_staff_schedule(staff_id, user.establishment_id, db)


@router.put("/settings/staff/{staff_id}", response_model=StaffScheduleResponse)
async def set_staff_schedule(
    staff_id: uuid.UUID,
    payload: StaffScheduleRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> StaffScheduleResponse:
    """Pose (ou remplace) l'horaire personnalisé d'un membre du personnel."""
    return await service.upsert_staff_schedule(
        staff_id, payload, user.establishment_id, db
    )


@router.delete(
    "/settings/staff/{staff_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_staff_schedule(
    staff_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    """Supprime l'horaire personnalisé → le staff retombe sur l'horaire général."""
    await service.delete_staff_schedule(staff_id, user.establishment_id, db)


# ── Export des présences ─────────────────────────────────────────
@router.get("/export")
async def export_attendance(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read),
    file_format: ExportFileFormat = Query(alias="format", default=ExportFileFormat.PDF),
    person_type: ExportPersonType = Query(default=ExportPersonType.BOTH),
    date_from: date_ = Query(...),
    date_to: date_ = Query(...),
    department_id: uuid.UUID | None = Query(default=None),
    section_id: uuid.UUID | None = Query(default=None),
) -> Response:
    """Export agrégé des présences (statut par personne × jour), en PDF ou Excel.

    Périmètre enfants et/ou personnel ; filtres département/section pour les
    enfants. Limité à 366 jours par appel."""
    content, filename = await service.get_attendance_export(
        user.establishment_id, file_format, person_type, date_from, date_to, db,
        department_id=department_id, section_id=section_id,
    )
    media_type = (
        "application/pdf"
        if file_format == ExportFileFormat.PDF
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Exemptions ──────────────────────────────────────────────────
@router.get("/settings/exempt-staff", response_model=list[StaffExemptionResponse])
async def list_staff_exemptions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
    exempt_only: bool = Query(default=False),
) -> list[StaffExemptionResponse]:
    return await service.list_staff_exemptions(
        user.establishment_id, db, exempt_only=exempt_only
    )


@router.patch(
    "/settings/exempt-staff/{staff_id}",
    response_model=StaffExemptionResponse,
)
async def set_staff_exemption(
    staff_id: uuid.UUID,
    payload: StaffExemptionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> StaffExemptionResponse:
    """Exempte (ou réintègre) un membre du personnel du contrôle de présence."""
    return await service.set_staff_exemption(
        staff_id, payload.exempt, user.establishment_id, db
    )
