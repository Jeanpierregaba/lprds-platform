import uuid

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import FileResponse, Response

from app.core.media_serving import media_response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import User
from app.modules.children import service
from app.modules.auth.dependencies import get_current_user
from app.modules.children.dependencies import get_staff
from app.modules.children.schemas import (
    ChildAttachmentResponse,
    ChildCreateRequest,
    ChildImportReportResponse,
    ChildListResponse,
    ChildResponse,
    ChildStatusRequest,
    ChildUpdateRequest,
)
from app.modules.rbac.dependencies import require_permission
from app.modules.rbac.models import PermissionCode

router = APIRouter(prefix="/children", tags=["children"])


@router.post("", response_model=ChildResponse, status_code=status.HTTP_201_CREATED)
async def create_child(
    payload: ChildCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_WRITE)),
) -> ChildResponse:
    """Le matricule est généré côté serveur à partir du code établissement."""
    return await service.create_child(payload, current_user.establishment_id, db)


@router.get("", response_model=ChildListResponse)
async def list_children(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_READ)),
    search: str | None = Query(default=None, description="Nom, prénoms ou matricule"),
    department_id: uuid.UUID | None = Query(default=None),
    section_id: uuid.UUID | None = Query(default=None),
    unassigned_only: bool = Query(default=False, description="Enfants sans groupe uniquement"),
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ChildListResponse:
    return await service.list_children(
        current_user.establishment_id,
        db,
        search=search,
        department_id=department_id,
        section_id=section_id,
        unassigned_only=unassigned_only,
        include_inactive=include_inactive,
        skip=skip,
        limit=limit,
    )


@router.get("/my-group", response_model=ChildListResponse)
async def list_my_group_children(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_staff),
) -> ChildListResponse:
    """
    « Mon Groupe » — enfants du/des groupe(s) dont l'utilisateur est
    l'educatrice responsable. Hors RBAC (aucune permission children:read
    requise) : placé AVANT /{child_id}, segments différents, aucune
    ambiguïté de routage."""
    return await service.list_my_group_children(current_user.id, db)


# ── Import / export (format plat XLSX / CSV) ────────────────────
@router.get("/export")
async def export_children(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_READ)),
    file_format: str = Query(default="xlsx", pattern="^(xlsx|csv)$"),
    include_inactive: bool = Query(default=False),
) -> Response:
    """Téléchargement du format canonique réimportable (round-trip via le
    matricule). Données RGPD — réservé aux porteurs de children:read."""
    content, filename, media_type = await service.export_children(
        current_user.establishment_id, db,
        file_format=file_format, include_inactive=include_inactive,
    )
    return _attachment_response(content, filename, media_type)


@router.get("/import/template")
async def import_template(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_WRITE)),
    file_format: str = Query(default="xlsx", pattern="^(xlsx|csv)$"),
) -> Response:
    """Modèle vierge + ligne d'exemple (feuille 'Aide' en XLSX)."""
    _ = db  # rendu sans DB
    content, filename, media_type = await service.import_template(file_format)
    return _attachment_response(content, filename, media_type)


@router.post("/import", response_model=ChildImportReportResponse)
async def import_children(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(
        PermissionCode.CHILDREN_WRITE, PermissionCode.CHILDREN_ARCHIVE
    )),
) -> ChildImportReportResponse:
    """Import XLSX/CSV au format canonique. Toujours 200 même partiel : le
    rapport détaille chaque ligne (créée / mise à jour / rejetée)."""
    content = await file.read()
    return await service.import_children(
        content, file.filename or "", current_user.establishment_id, db
    )


def _attachment_response(content: bytes, filename: str, media_type: str) -> Response:
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{child_id}", response_model=ChildResponse)
async def get_child(
    child_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_READ)),
) -> ChildResponse:
    return await service.get_child(child_id, current_user.establishment_id, db)


@router.patch("/{child_id}", response_model=ChildResponse)
async def update_child(
    child_id: uuid.UUID,
    payload: ChildUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_WRITE)),
) -> ChildResponse:
    return await service.update_child(
        child_id, payload, current_user.establishment_id, db
    )


@router.patch("/{child_id}/status", response_model=ChildResponse)
async def set_child_status(
    child_id: uuid.UUID,
    payload: ChildStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_ARCHIVE)),
) -> ChildResponse:
    """
    Active / désactive la fiche. Il n'y a pas d'endpoint DELETE : une fiche
    enfant ne se supprime jamais.
    """
    return await service.set_child_status(
        child_id, payload.is_active, current_user.establishment_id, db
    )


# ── Documents du dossier d'inscription ─────────────────────────
@router.post(
    "/{child_id}/documents",
    response_model=ChildAttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_child_document(
    child_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_WRITE)),
) -> ChildAttachmentResponse:
    """Upload en deux temps : la fiche existe déjà, on y attache un document
    (pièce d'identité, certificat médical, autorisation...)."""
    return await service.add_child_document(
        child_id, current_user.establishment_id, current_user, file, db
    )


@router.get("/{child_id}/documents/{document_id}")
async def download_child_document(
    child_id: uuid.UUID,
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_READ)),
) -> FileResponse:
    """Téléchargement authentifié uniquement — jamais servi en statique."""
    attachment, path = await service.get_child_document(
        child_id, document_id, current_user.establishment_id, db
    )
    return FileResponse(
        path, filename=attachment.filename, media_type=attachment.content_type
    )


@router.delete(
    "/{child_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_child_document(
    child_id: uuid.UUID,
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.CHILDREN_WRITE)),
) -> None:
    """Suppression définitive du document (fichier + ligne) — un document
    erroné ou doublon doit pouvoir être retiré, contrairement à la fiche."""
    await service.delete_child_document(
        child_id, document_id, current_user.establishment_id, db
    )


# ── Photo de profil ────────────────────────────────────────────
#
# ⚠️ Ces trois routes n'utilisent PAS `require_permission` : le droit dépend du
# LIEN à l'enfant, pas d'une permission RBAC. L'admin, un parent de l'enfant et
# l'éducatrice de son groupe peuvent la gérer — un parent n'a aucune permission
# RBAC, et un staff qui a `children:write` mais n'encadre pas l'enfant n'a rien
# à faire sur sa photo. La règle vit dans le service (`_child_for_photo`), au
# même endroit pour les trois routes.


@router.put("/{child_id}/photo", response_model=ChildResponse)
async def set_child_photo(
    child_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChildResponse:
    """Dépose ou remplace la photo de profil.

    `PUT` et non `POST` : il n'y en a qu'une, et la reposer remplace la
    précédente — c'est idempotent au sens où deux envois successifs laissent
    l'enfant avec une seule photo, la dernière.
    """
    child = await service.set_child_photo(child_id, current_user, file, db)
    return await service.get_child(child.id, current_user.establishment_id, db)


@router.get("/{child_id}/photo")
async def download_child_photo(
    child_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    thumb: bool = Query(
        False,
        description="Vignette JPEG (~480 px) — pour les listes et le trombinoscope.",
    ),
) -> FileResponse:
    """Téléchargement authentifié uniquement — jamais servi en statique."""
    child, path = await service.get_child_photo(child_id, current_user, db)
    return await media_response(
        storage_key=child.photo_storage_key or "",
        path=path,
        filename=child.photo_filename or "photo.jpg",
        content_type=child.photo_content_type or "image/jpeg",
        thumb=thumb,
    )


@router.delete("/{child_id}/photo", status_code=status.HTTP_204_NO_CONTENT)
async def delete_child_photo(
    child_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Idempotent : retirer une photo absente n'est pas une erreur."""
    await service.delete_child_photo(child_id, current_user, db)
