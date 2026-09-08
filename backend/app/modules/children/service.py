import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.config import settings
from app.modules.auth.models import User
from app.modules.children.matricule import generate_unique_matricule
from app.modules.children.models import (
    AuthorizedPerson,
    Child,
    ChildAttachment,
    Guardian,
)
from app.modules.children.schemas import (
    AuthorizedPersonRequest,
    ChildAttachmentResponse,
    ChildCreateRequest,
    ChildListItem,
    ChildListResponse,
    ChildResponse,
    ChildUpdateRequest,
    GuardianRequest,
)
from app.modules.establishments.models import Establishment
from app.modules.organization import service as org_service
from app.modules.organization.models import Department, Group, Section


# ── Création ────────────────────────────────────────────────────
async def create_child(
    payload: ChildCreateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> ChildResponse:
    establishment = await db.get(Establishment, establishment_id)
    if not establishment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Établissement introuvable",
        )

    await _validate_units(payload.department_id, payload.section_id,
                          establishment_id, db)

    child = Child(
        matricule=await generate_unique_matricule(establishment.code, db),
        establishment_id=establishment_id,
        **payload.model_dump(
            exclude={"guardians", "authorized_persons"}
        ),
    )
    child.guardians = [_build_guardian(g) for g in payload.guardians]
    child.authorized_persons = [
        _build_authorized(a) for a in payload.authorized_persons
    ]

    db.add(child)
    await db.flush()
    # On a posé department_id/section_id (les FK), pas les objets : sans refresh,
    # lire child.department déclencherait un lazy-load interdit en async.
    await db.refresh(child)
    return _child_response(child)


# ── Lecture ─────────────────────────────────────────────────────
async def list_children(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    search: str | None = None,
    department_id: uuid.UUID | None = None,
    section_id: uuid.UUID | None = None,
    unassigned_only: bool = False,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> ChildListResponse:
    filters = [Child.establishment_id == establishment_id]
    if not include_inactive:
        filters.append(Child.is_active.is_(True))
    if department_id:
        filters.append(Child.department_id == department_id)
    if section_id:
        filters.append(Child.section_id == section_id)
    if unassigned_only:
        filters.append(Child.group_id.is_(None))
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Child.last_name.ilike(pattern),
                Child.first_names.ilike(pattern),
                Child.matricule.ilike(pattern),
            )
        )

    total = await db.scalar(
        select(func.count()).select_from(Child).where(*filters)
    )
    result = await db.execute(
        select(Child)
        .where(*filters)
        .order_by(Child.last_name, Child.first_names)
        .offset(skip)
        .limit(limit)
    )
    return ChildListResponse(
        total=total or 0,
        items=[ChildListItem.model_validate(c) for c in result.scalars().all()],
    )


async def list_my_group_children(
    current_user_id: uuid.UUID,
    db: AsyncSession,
) -> ChildListResponse:
    """
    « Mon Groupe » — enfants des groupes dont l'utilisateur est l'educatrice
    responsable. Hors RBAC : disponible à tout compte staff par construction
    (pas de permission à accorder), à l'image de reports:group scoping.
    """
    led_group_ids = (
        await db.execute(
            select(Group.id).where(
                Group.educatrice_id == current_user_id, Group.is_active.is_(True)
            )
        )
    ).scalars().all()
    if not led_group_ids:
        return ChildListResponse(total=0, items=[])

    filters = [Child.group_id.in_(led_group_ids), Child.is_active.is_(True)]
    result = await db.execute(
        select(Child).where(*filters).order_by(Child.last_name, Child.first_names)
    )
    items = list(result.scalars().all())
    return ChildListResponse(total=len(items), items=[ChildListItem.model_validate(c) for c in items])


async def get_child(
    child_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> ChildResponse:
    return _child_response(await _get_or_404(child_id, establishment_id, db))


# ── Modification ────────────────────────────────────────────────
async def update_child(
    child_id: uuid.UUID,
    payload: ChildUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> ChildResponse:
    child = await _get_or_404(child_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)

    await _validate_units(
        changes.get("department_id"), changes.get("section_id"),
        establishment_id, db,
    )

    # Les dates doivent rester cohérentes même modifiées une par une
    birth = changes.get("birth_date", child.birth_date)
    admission = changes.get("admission_date", child.admission_date)
    if admission < birth:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La date d'admission ne peut pas précéder la date de naissance",
        )

    if "guardians" in changes:
        child.guardians = [_build_guardian(g) for g in payload.guardians or []]
        changes.pop("guardians")
    if "authorized_persons" in changes:
        child.authorized_persons = [
            _build_authorized(a) for a in payload.authorized_persons or []
        ]
        changes.pop("authorized_persons")

    for field, value in changes.items():
        setattr(child, field, value)

    await db.flush()
    await db.refresh(child)
    return _child_response(child)


async def set_child_status(
    child_id: uuid.UUID,
    is_active: bool,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> ChildResponse:
    """
    Active / désactive une fiche. Il n'existe volontairement AUCUNE suppression
    physique : les données d'un enfant ne doivent jamais être perdues.
    """
    child = await _get_or_404(child_id, establishment_id, db)
    child.is_active = is_active
    await db.flush()
    await db.refresh(child)
    return _child_response(child)


# ── Documents du dossier d'inscription ──────────────────────────
async def add_child_document(
    child_id: uuid.UUID,
    establishment_id: uuid.UUID,
    current_user: User,
    file: UploadFile,
    db: AsyncSession,
) -> ChildAttachmentResponse:
    """Upload en deux temps (la fiche existe déjà). Limite de taille + type
    MIME en liste blanche via les réglages `children_*` — même pattern que
    les pièces jointes des autres modules."""
    await _get_or_404(child_id, establishment_id, db)
    return await _store_document(child_id, current_user, file, db)


async def get_child_document(
    child_id: uuid.UUID,
    document_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[ChildAttachment, Path]:
    """Téléchargement authentifié uniquement — jamais servi en statique."""
    await _get_or_404(child_id, establishment_id, db)
    attachment = await _get_document_or_404(child_id, document_id, db)
    return attachment, storage.resolve_path(attachment.storage_key)


async def delete_child_document(
    child_id: uuid.UUID,
    document_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """
    Suppression définitive du document (fichier + ligne). Contrairement à la
    fiche enfant elle-même (jamais supprimée), un document erroné/doublon doit
    pouvoir être retiré. Scopé à l'établissement via la fiche (404 sinon).
    """
    await _get_or_404(child_id, establishment_id, db)
    attachment = await _get_document_or_404(child_id, document_id, db)
    await storage.delete_file(attachment.storage_key)
    await db.delete(attachment)
    await db.flush()


# ── Helpers privés ──────────────────────────────────────────────
async def _store_document(
    child_id: uuid.UUID,
    current_user: User,
    file: UploadFile,
    db: AsyncSession,
) -> ChildAttachmentResponse:
    content_bytes = await file.read()
    max_bytes = settings.children_max_attachment_mb * 1024 * 1024
    if len(content_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Fichier trop volumineux (max {settings.children_max_attachment_mb} Mo)",
        )
    if not content_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Fichier vide",
        )

    content_type = file.content_type or ""
    if content_type not in settings.children_allowed_attachment_types_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Type de fichier non autorisé : {content_type or 'inconnu'}. "
                f"Autorisés : {', '.join(sorted(settings.children_allowed_attachment_types_set))}"
            ),
        )

    filename = file.filename or "document"
    storage_key = await storage.save_file("children", filename, content_bytes)
    attachment = ChildAttachment(
        child_id=child_id,
        uploaded_by_id=current_user.id,
        filename=filename,
        content_type=content_type,
        size_bytes=len(content_bytes),
        storage_key=storage_key,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)
    return _attachment_response(attachment)


async def _get_document_or_404(
    child_id: uuid.UUID,
    document_id: uuid.UUID,
    db: AsyncSession,
) -> ChildAttachment:
    attachment = await db.scalar(
        select(ChildAttachment).where(
            ChildAttachment.id == document_id,
            # Toujours rattaché à la fiche courante : un document d'un autre
            # enfant est un 404, jamais 403 — on ne révèle pas son existence.
            ChildAttachment.child_id == child_id,
        )
    )
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document introuvable",
        )
    return attachment


def _child_response(child: Child) -> ChildResponse:
    base = ChildResponse.model_validate(child)
    return base.model_copy(
        update={
            "documents": [_attachment_response(a) for a in child.attachments]
        }
    )


def _attachment_response(attachment: ChildAttachment) -> ChildAttachmentResponse:
    return ChildAttachmentResponse(
        id=attachment.id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        created_at=attachment.created_at,
        url=f"/api/v1/children/{attachment.child_id}/documents/{attachment.id}",
    )
def _build_guardian(payload: GuardianRequest) -> Guardian:
    return Guardian(
        last_name=payload.last_name,
        first_names=payload.first_names,
        phone=payload.phone,
        email=payload.email,
    )


def _build_authorized(payload: AuthorizedPersonRequest) -> AuthorizedPerson:
    return AuthorizedPerson(
        last_name=payload.last_name,
        first_names=payload.first_names,
        phone=payload.phone,
    )


async def _validate_units(
    department_id: uuid.UUID | None,
    section_id: uuid.UUID | None,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Le département/section doit appartenir au MÊME établissement."""
    if department_id:
        await org_service.get_or_404(Department, department_id, establishment_id, db)
    if section_id:
        await org_service.get_or_404(Section, section_id, establishment_id, db)


async def _get_or_404(
    child_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> Child:
    result = await db.execute(
        select(Child).where(
            Child.id == child_id,
            # Isolation multi-établissement : une fiche d'un autre établissement
            # est un 404, jamais un 403 — on ne révèle pas son existence.
            Child.establishment_id == establishment_id,
        )
    )
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enfant introuvable",
        )
    return child
