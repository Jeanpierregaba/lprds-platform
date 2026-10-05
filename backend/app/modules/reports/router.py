import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.media_serving import media_response

from app.core.database import get_db
from app.core.i18n import coerce_locale, t
from app.modules.auth.dependencies import get_current_user, require_roles
from app.modules.auth.models import User, UserRole
from app.modules.reports import service
from app.modules.reports.dependencies import get_parent
from app.modules.reports.models import ReportStatus, ReportType
from app.modules.reports.schemas import (
    DepartmentReportTypeResponse,
    MissingReportResponse,
    ParentReportDetailResponse,
    ParentReportListResponse,
    ReportAttachmentResponse,
    ReportCreateRequest,
    ReportListResponse,
    ReportRejectRequest,
    ReportResponse,
    ReportUpdateRequest,
    ReportVocabularyResponse,
)
from app.modules.rbac.dependencies import require_permission, user_permission_codes
from app.modules.rbac.models import PermissionCode

router = APIRouter(prefix="/reports", tags=["reports"])

_read = require_permission(PermissionCode.REPORTS_READ)
_write = require_permission(PermissionCode.REPORTS_WRITE)
_validate = require_permission(PermissionCode.REPORTS_VALIDATE)


def _sees_reports(user: User) -> bool:
    """Staff porteur d'AU MOINS UNE permission du module (read, write ou
    validate) — même pattern OU que `_read_types`."""
    codes = user_permission_codes(user)
    return (
        PermissionCode.REPORTS_READ.value in codes
        or PermissionCode.REPORTS_WRITE.value in codes
        or PermissionCode.REPORTS_VALIDATE.value in codes
    )


async def _can_see_reports(user: User = Depends(get_current_user)) -> User:
    """Garde des endpoints de LECTURE (liste, détail, manquants) : admin, ou
    staff porteur d'au moins une permission du module. La sidebar affiche le
    module dès une permission détenue ; refuser ici donnerait « page visible,
    données 403 ». Le périmètre FIN (groupe mené vs tout l'établissement)
    reste décidé dans le service, pas ici."""
    if user.role == UserRole.ADMIN:
        return user
    if user.role == UserRole.STAFF and _sees_reports(user):
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("errors.common.insufficient_permissions"))


async def _vocabulary_access(user: User = Depends(get_current_user)) -> User:
    """
    GET /vocabulary n'expose que des libellés statiques (aucune donnée
    d'enfant) — ouvert au staff qui voit les rapports (read/write/validate)
    ET au parent, qui en a besoin pour afficher le contenu de ses rapports
    validés sur son portail (contrairement au reste du module, jamais
    accessible au parent hors /mine/*). Sans lien avec establishment_id :
    le vocabulaire est global, identique pour tous les établissements.
    """
    if user.role == UserRole.ADMIN or user.role == UserRole.PARENT:
        return user
    if user.role == UserRole.STAFF and _sees_reports(user):
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("errors.common.insufficient_permissions"))


# Types de rapport par département : configuration réservée à l'admin —
# une éducatrice porte reports:write (elle rédige) mais ne choisit pas
# quels types sont actifs dans chaque département.
_admin_only = require_roles(UserRole.ADMIN)


# ── Paramètres : types de rapport activés par département ────────
async def _read_types(
    user: User = Depends(get_current_user),
) -> User:
    """Lecture des types actifs : admin, ou staff porteur de reports:read OU
    reports:write — l'éducatrice en a besoin dans le formulaire de création
    pour savoir quels types proposer (elle ne peut pas les CONFIGURER, seuls
    POST/DELETE ci-dessous sont admin-only)."""
    if user.role == UserRole.ADMIN:
        return user
    codes = user_permission_codes(user)
    if PermissionCode.REPORTS_READ.value in codes or PermissionCode.REPORTS_WRITE.value in codes:
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("errors.common.insufficient_permissions"))


@router.get(
    "/settings/departments/{department_id}/types",
    response_model=list[DepartmentReportTypeResponse],
)
async def list_department_report_types(
    department_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_read_types),
) -> list[DepartmentReportTypeResponse]:
    return await service.list_department_report_types(
        department_id, user.establishment_id, db
    )


@router.post(
    "/settings/departments/{department_id}/types/{report_type}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def assign_department_report_type(
    department_id: uuid.UUID,
    report_type: ReportType,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_admin_only),
) -> None:
    await service.assign_department_report_type(
        department_id, report_type, user.establishment_id, db
    )


@router.delete(
    "/settings/departments/{department_id}/types/{report_type}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unassign_department_report_type(
    department_id: uuid.UUID,
    report_type: ReportType,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_admin_only),
) -> None:
    await service.unassign_department_report_type(
        department_id, report_type, user.establishment_id, db
    )


# ── Rapports (staff : leur groupe uniquement ; admin : tous) ─────
@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> ReportResponse:
    """
    Une éducatrice ne peut créer un rapport que pour un enfant de son propre
    groupe ; un admin peut le faire pour n'importe quel enfant de l'établissement.
    Le type de rapport doit être activé pour le département de l'enfant.
    """
    return await service.create_report(payload, user.establishment_id, user, db)


@router.get("", response_model=ReportListResponse)
async def list_reports(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_can_see_reports),
    report_status: ReportStatus | None = Query(default=None, alias="status"),
    report_type: ReportType | None = Query(default=None),
    child_id: uuid.UUID | None = Query(default=None),
    group_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(default=None, description="Nom, prénoms ou matricule de l'enfant"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ReportListResponse:
    """Une éducatrice ne voit que les rapports des groupes qu'elle dirige."""
    return await service.list_reports(
        user.establishment_id, user, db,
        report_status=report_status, report_type=report_type,
        child_id=child_id, group_id=group_id, search=search, skip=skip, limit=limit,
    )


@router.get("/vocabulary", response_model=ReportVocabularyResponse)
async def get_vocabulary(
    user: User = Depends(_vocabulary_access),
) -> ReportVocabularyResponse:
    """Libellés des listes déroulantes / cases à cocher du rapport, dans la
    langue de l'appelant — pour que le frontend construise le formulaire sans
    dupliquer ce vocabulaire (qui sert aussi au PDF du bulletin, d'où son
    maintien côté backend, contrairement aux libellés RBAC). Ouvert à
    reports:read (admin/staff) et au parent (portail, lecture de ses rapports
    validés). Placé AVANT /{report_id} pour éviter toute ambiguïté de routage
    (même précaution que /mine/list, cf. claude.md).

    ⚠️ Réponse dépendante de la langue : côté frontend, la locale doit faire
    partie de la clé de cache, sinon un changement de langue sert l'ancienne.
    """
    return service.get_vocabulary(coerce_locale(user.locale))


@router.get("/missing", response_model=MissingReportResponse)
async def list_missing_reports(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_can_see_reports),
    report_type: ReportType = Query(default=ReportType.QUOTIDIEN),
    target_date: date | None = Query(default=None, alias="date"),
    department_id: uuid.UUID | None = Query(default=None),
    section_id: uuid.UUID | None = Query(default=None),
    group_id: uuid.UUID | None = Query(default=None),
) -> MissingReportResponse:
    """Rapports non soumis pour la période contenant la date (défaut
    aujourd'hui, jamais future) — l'admin voit d'un coup d'œil qui n'a rien
    soumis, sans croiser la liste des absences. Le staff ne voit que ses
    groupes menés. Placé AVANT /{report_id} (même précaution que /vocabulary)."""
    target = target_date or date.today()
    if target > date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.common.date_future"),
        )
    return await service.list_missing_reports(
        user.establishment_id, user, db,
        report_type=report_type, target=target, department_id=department_id,
        section_id=section_id, group_id=group_id,
    )


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_can_see_reports),
) -> ReportResponse:
    return await service.get_report(report_id, user.establishment_id, user, db)


@router.patch("/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: uuid.UUID,
    payload: ReportUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> ReportResponse:
    """L'admin peut modifier à tout moment (même soumis/validé/lu par le
    parent) ; le staff seulement en brouillon ou après rejet."""
    return await service.update_report(report_id, payload, user.establishment_id, user, db)


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    """Suppression définitive réservée aux brouillons jamais soumis."""
    await service.delete_report(report_id, user.establishment_id, user, db)


@router.post("/{report_id}/submit", response_model=ReportResponse)
async def submit_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> ReportResponse:
    """
    Soumis par un membre du staff → passe en attente de validation admin.
    Soumis par un admin → publié immédiatement (personne au-dessus pour
    l'approuver), le parent est notifié sans détour par la validation.
    """
    return await service.submit_report(report_id, user.establishment_id, user, db)


@router.post("/{report_id}/validate", response_model=ReportResponse)
async def validate_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_validate),
) -> ReportResponse:
    """Publie le rapport au parent (email + portail)."""
    return await service.validate_report(report_id, user.establishment_id, user, db)


@router.post("/{report_id}/reject", response_model=ReportResponse)
async def reject_report(
    report_id: uuid.UUID,
    payload: ReportRejectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_validate),
) -> ReportResponse:
    """Renvoie le rapport à son auteur (statut « rejected ») avec le motif."""
    return await service.reject_report(report_id, payload.reason, user.establishment_id, db)


# ── Pièces jointes (photos / vidéos) — staff / admin ──────────────
@router.post(
    "/{report_id}/attachments",
    response_model=ReportAttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_report_attachment(
    report_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> ReportAttachmentResponse:
    return await service.add_report_attachment(report_id, user.establishment_id, user, file, db)


@router.delete("/{report_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report_attachment(
    report_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_write),
) -> None:
    """Retire un média d'un rapport — l'admin à tout moment, le staff
    seulement en brouillon ou après rejet (mêmes règles que le contenu)."""
    await service.delete_report_attachment(
        report_id, attachment_id, user.establishment_id, user, db
    )


@router.get("/{report_id}/attachments/{attachment_id}")
async def download_report_attachment(
    report_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_can_see_reports),
    thumb: bool = Query(
        False,
        description="Vignette JPEG (~480 px) au lieu de l'original — pour les grilles.",
    ),
) -> FileResponse:
    attachment, path = await service.get_report_attachment_for_staff(
        report_id, attachment_id, user.establishment_id, user, db
    )
    return await media_response(
        storage_key=attachment.storage_key,
        path=path,
        filename=attachment.filename,
        content_type=attachment.content_type,
        thumb=thumb,
    )


# ── Portail parent ────────────────────────────────────────────────
@router.get("/mine/list", response_model=ParentReportListResponse)
async def list_my_reports(
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
    child_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ParentReportListResponse:
    """Seuls les rapports VALIDÉS de ses propres enfants sont visibles."""
    return await service.list_my_reports(parent, db, child_id=child_id, skip=skip, limit=limit)


@router.get("/mine/{report_id}", response_model=ParentReportDetailResponse)
async def get_my_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
) -> ParentReportDetailResponse:
    return await service.get_my_report(report_id, parent, db)


@router.get("/mine/{report_id}/pdf")
async def download_my_report_pdf(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
) -> Response:
    """Bulletin PDF du rapport annuel — seul type téléchargeable ainsi."""
    pdf_bytes, filename = await service.get_my_report_pdf(report_id, parent, db)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/mine/{report_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_my_report_read(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
) -> None:
    await service.mark_report_read(report_id, parent, db)


@router.get("/mine/{report_id}/attachments/{attachment_id}")
async def download_my_report_attachment(
    report_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
    thumb: bool = Query(
        False,
        description="Vignette JPEG (~480 px) au lieu de l'original — pour les grilles.",
    ),
) -> FileResponse:
    attachment, path = await service.get_report_attachment_for_parent(
        report_id, attachment_id, parent, db
    )
    return await media_response(
        storage_key=attachment.storage_key,
        path=path,
        filename=attachment.filename,
        content_type=attachment.content_type,
        thumb=thumb,
    )
