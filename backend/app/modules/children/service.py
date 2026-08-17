import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.children.matricule import generate_unique_matricule
from app.modules.children.models import AuthorizedPerson, Child, Guardian
from app.modules.children.schemas import (
    AuthorizedPersonRequest,
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
    return ChildResponse.model_validate(child)


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
    return ChildResponse.model_validate(
        await _get_or_404(child_id, establishment_id, db)
    )


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
    return ChildResponse.model_validate(child)


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
    return ChildResponse.model_validate(child)


# ── Helpers privés ──────────────────────────────────────────────
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
