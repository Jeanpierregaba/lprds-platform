import uuid
from app.core.i18n import t

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User, UserRole
from app.modules.auth.security import hash_password
from app.modules.establishments.models import (
    MAX_ADMINS_PER_ESTABLISHMENT,
    Establishment,
)
from app.modules.establishments.schemas import (
    EstablishmentAdminCreate,
    EstablishmentCreateRequest,
    EstablishmentDetailResponse,
    EstablishmentListResponse,
    EstablishmentResponse,
    EstablishmentUpdateRequest,
)


# ── Création ────────────────────────────────────────────────────
async def create_establishment(
    payload: EstablishmentCreateRequest,
    db: AsyncSession,
) -> EstablishmentDetailResponse:
    await _ensure_code_available(payload.code, db)
    await _ensure_email_available(payload.admin.email, db)

    establishment = Establishment(
        code=payload.code,
        name=payload.name,
        address=payload.address,
        email=payload.email,
        phone=payload.phone,
    )
    db.add(establishment)
    await db.flush()  # génère l'ID sans commit

    admin = _build_admin(payload.admin, establishment.id)
    db.add(admin)
    await db.flush()

    return EstablishmentDetailResponse(
        **EstablishmentResponse.model_validate(establishment).model_dump(),
        admins=[admin],
    )


# ── Lecture ─────────────────────────────────────────────────────
async def list_establishments(
    db: AsyncSession,
    *,
    search: str | None = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> EstablishmentListResponse:
    filters = []
    if not include_inactive:
        filters.append(Establishment.is_active.is_(True))
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Establishment.name.ilike(pattern),
                Establishment.code.ilike(pattern),
            )
        )

    total = await db.scalar(
        select(func.count()).select_from(Establishment).where(*filters)
    )
    result = await db.execute(
        select(Establishment)
        .where(*filters)
        .order_by(Establishment.name)
        .offset(skip)
        .limit(limit)
    )
    return EstablishmentListResponse(
        total=total or 0,
        items=[
            EstablishmentResponse.model_validate(e)
            for e in result.scalars().all()
        ],
    )


async def get_establishment(
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> EstablishmentDetailResponse:
    establishment = await _get_or_404(establishment_id, db)
    admins = await _list_active_admins(establishment_id, db)
    return EstablishmentDetailResponse(
        **EstablishmentResponse.model_validate(establishment).model_dump(),
        admins=admins,
    )


# ── Modification ────────────────────────────────────────────────
async def update_establishment(
    establishment_id: uuid.UUID,
    payload: EstablishmentUpdateRequest,
    db: AsyncSession,
) -> EstablishmentResponse:
    establishment = await _get_or_404(establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)

    new_code = changes.get("code")
    if new_code and new_code != establishment.code:
        await _ensure_code_available(new_code, db)
        await _ensure_no_matricule_issued(establishment_id, db)

    for field, value in changes.items():
        setattr(establishment, field, value)

    await db.flush()
    return EstablishmentResponse.model_validate(establishment)


async def deactivate_establishment(
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Désactivation (soft delete) — aucune donnée n'est supprimée."""
    establishment = await _get_or_404(establishment_id, db)
    establishment.is_active = False
    await db.flush()


# ── Administrateurs ─────────────────────────────────────────────
async def list_admins(
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> list[User]:
    await _get_or_404(establishment_id, db)
    return await _list_active_admins(establishment_id, db)


async def add_admin(
    establishment_id: uuid.UUID,
    payload: EstablishmentAdminCreate,
    db: AsyncSession,
) -> User:
    await _get_or_404(establishment_id, db)
    await ensure_admin_quota(establishment_id, db)
    await _ensure_email_available(payload.email, db)

    admin = _build_admin(payload, establishment_id)
    db.add(admin)
    await db.flush()
    return admin


async def remove_admin(
    establishment_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Retire un admin en désactivant son compte."""
    await _get_or_404(establishment_id, db)

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.establishment_id == establishment_id,
            User.role == UserRole.ADMIN,
        )
    )
    admin = result.scalar_one_or_none()
    if not admin or not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.establishments.admin_not_found"),
        )

    # Un établissement sans admin ne serait plus gérable
    remaining = await _count_active_admins(establishment_id, db)
    if remaining <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.establishments.last_admin"),
        )

    admin.is_active = False
    await db.flush()


async def ensure_admin_quota(
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """
    Vérifie qu'un admin supplémentaire peut être ajouté à l'établissement.
    Appelé aussi depuis le module auth (POST /auth/users) pour que la règle
    ne puisse pas être contournée.
    """
    count = await _count_active_admins(establishment_id, db)
    if count >= MAX_ADMINS_PER_ESTABLISHMENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.establishments.max_admins", max_admins=MAX_ADMINS_PER_ESTABLISHMENT),
        )


# ── Helpers privés ──────────────────────────────────────────────
def _build_admin(payload: EstablishmentAdminCreate, establishment_id: uuid.UUID) -> User:
    return User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.ADMIN,
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        establishment_id=establishment_id,
        # Le superadmin transmet le mot de passe hors plateforme :
        # on force son changement à la première connexion.
        must_change_pwd=True,
    )


async def _get_or_404(
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> Establishment:
    establishment = await db.get(Establishment, establishment_id)
    if not establishment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.common.establishment_not_found"),
        )
    return establishment


async def _list_active_admins(
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> list[User]:
    result = await db.execute(
        select(User)
        .where(
            User.establishment_id == establishment_id,
            User.role == UserRole.ADMIN,
            User.is_active.is_(True),
        )
        .order_by(User.created_at)
    )
    return list(result.scalars().all())


async def _count_active_admins(
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> int:
    count = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(
            User.establishment_id == establishment_id,
            User.role == UserRole.ADMIN,
            User.is_active.is_(True),
        )
    )
    return count or 0


async def _ensure_code_available(code: str, db: AsyncSession) -> None:
    existing = await db.scalar(
        select(Establishment.id).where(Establishment.code == code)
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.establishments.code_taken", code=code),
        )


async def _ensure_no_matricule_issued(
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """
    Le code est figé dès qu'un matricule a été émis : les matricules déjà
    attribués embarquent l'ancien préfixe (LPRDS-M87D1) et changer le code les
    désynchroniserait silencieusement de leur établissement.
    Import local — le module children dépend déjà de establishments.
    """
    from app.modules.children.models import Child

    exists = await db.scalar(
        select(Child.id).where(Child.establishment_id == establishment_id).limit(1)
    )
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.establishments.code_locked"),
        )


async def _ensure_email_available(email: str, db: AsyncSession) -> None:
    existing = await db.scalar(select(User.id).where(User.email == email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.common.email_exists"),
        )
