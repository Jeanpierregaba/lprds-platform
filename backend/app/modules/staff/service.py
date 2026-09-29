import logging
from app.core.i18n import coerce_locale, t
import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.email import (
    EmailDeliveryError,
    send_credentials_reset_email,
    send_welcome_email,
)
from app.modules.auth.models import User, UserRole
from app.modules.auth.security import hash_password
from app.modules.establishments.models import Establishment
from app.modules.rbac.models import user_roles
from app.modules.rbac.service import (
    ensure_bibliothecaire_baseline_role,
    ensure_educatrice_baseline_role,
)
from app.modules.staff.matricule import generate_unique_staff_matricule
from app.modules.staff.models import StaffType
from app.modules.staff.schemas import (
    StaffCreateRequest,
    StaffListItem,
    StaffListResponse,
    StaffResponse,
    StaffUpdateRequest,
)

logger = logging.getLogger(__name__)


# ── Création ────────────────────────────────────────────────────
async def create_staff(
    payload: StaffCreateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> StaffResponse:
    establishment = await db.get(Establishment, establishment_id)
    if not establishment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.common.establishment_not_found"),
        )
    await _ensure_email_available(payload.email, db)

    member = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.STAFF,
        first_name=payload.first_name,
        last_name=payload.last_name,
        nickname=payload.nickname,
        phone=payload.phone,
        staff_type=str(payload.staff_type),
        matricule=await generate_unique_staff_matricule(establishment.code, db),
        establishment_id=establishment_id,
        # Mot de passe temporaire → changement imposé à la 1re connexion
        must_change_pwd=True,
    )
    db.add(member)
    await db.flush()

    if member.staff_type == str(StaffType.EDUCATEUR):
        # Insertion directe dans la table d'association plutôt que
        # `member.roles.append(...)` : `member` vient d'être créé (jamais
        # chargé par un SELECT), donc sa collection `roles` (lazy="selectin")
        # n'est pas hydratée — y toucher déclencherait un lazy-load
        # synchrone, incompatible avec le contexte async ici.
        role = await ensure_educatrice_baseline_role(establishment_id, db)
        await db.execute(insert(user_roles).values(user_id=member.id, role_id=role.id))
        await db.flush()
    elif member.staff_type == str(StaffType.BIBLIOTHECAIRE):
        role = await ensure_bibliothecaire_baseline_role(establishment_id, db)
        await db.execute(insert(user_roles).values(user_id=member.id, role_id=role.id))
        await db.flush()

    # Email de bienvenue avec les identifiants. S'il échoue, le compte serait
    # inutilisable (mot de passe non communiqué) : on annule (503).
    try:
        await send_welcome_email(
            email=member.email,
            first_name=member.first_name,
            role=UserRole.STAFF,
            locale=coerce_locale(member.locale),
            temp_password=payload.password,
            establishment_name=establishment.name,
        )
    except EmailDeliveryError as exc:
        logger.exception("Échec d'envoi du mail de bienvenue à %s", member.email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=t("errors.common.email_unavailable_account"),
        ) from exc

    return StaffResponse.model_validate(member)


# ── Lecture ─────────────────────────────────────────────────────
async def list_staff(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    search: str | None = None,
    staff_type: StaffType | None = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> StaffListResponse:
    filters = [
        User.role == UserRole.STAFF,
        User.establishment_id == establishment_id,
    ]
    if not include_inactive:
        filters.append(User.is_active.is_(True))
    if staff_type:
        filters.append(User.staff_type == str(staff_type))
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                User.last_name.ilike(pattern),
                User.first_name.ilike(pattern),
                User.nickname.ilike(pattern),
                User.email.ilike(pattern),
                User.matricule.ilike(pattern),
            )
        )

    total = await db.scalar(
        select(func.count()).select_from(User).where(*filters)
    )
    result = await db.execute(
        select(User)
        .where(*filters)
        .order_by(User.last_name, User.first_name)
        .offset(skip)
        .limit(limit)
    )
    return StaffListResponse(
        total=total or 0,
        items=[StaffListItem.model_validate(m) for m in result.scalars().all()],
    )


async def get_staff(
    staff_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> StaffResponse:
    return StaffResponse.model_validate(
        await _get_or_404(staff_id, establishment_id, db)
    )


# ── Modification ────────────────────────────────────────────────
async def update_staff(
    staff_id: uuid.UUID,
    payload: StaffUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> StaffResponse:
    member = await _get_or_404(staff_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)
    was_educateur = member.staff_type == str(StaffType.EDUCATEUR)
    was_bibliothecaire = member.staff_type == str(StaffType.BIBLIOTHECAIRE)

    if "email" in changes and changes["email"] != member.email:
        await _ensure_email_available(changes["email"], db)
    if "staff_type" in changes and changes["staff_type"] is not None:
        changes["staff_type"] = str(changes["staff_type"])

    for field, value in changes.items():
        setattr(member, field, value)

    is_educateur = member.staff_type == str(StaffType.EDUCATEUR)
    if is_educateur and not was_educateur:
        role = await ensure_educatrice_baseline_role(establishment_id, db)
        await db.execute(
            insert(user_roles).values(user_id=member.id, role_id=role.id)
        )
    elif was_educateur and not is_educateur:
        baseline = await ensure_educatrice_baseline_role(establishment_id, db)
        await db.execute(
            delete(user_roles).where(
                user_roles.c.user_id == member.id,
                user_roles.c.role_id == baseline.id,
            )
        )

    is_bibliothecaire = member.staff_type == str(StaffType.BIBLIOTHECAIRE)
    if is_bibliothecaire and not was_bibliothecaire:
        role = await ensure_bibliothecaire_baseline_role(establishment_id, db)
        await db.execute(
            insert(user_roles).values(user_id=member.id, role_id=role.id)
        )
    elif was_bibliothecaire and not is_bibliothecaire:
        baseline = await ensure_bibliothecaire_baseline_role(establishment_id, db)
        await db.execute(
            delete(user_roles).where(
                user_roles.c.user_id == member.id,
                user_roles.c.role_id == baseline.id,
            )
        )

    await db.flush()
    await db.refresh(member)
    return StaffResponse.model_validate(member)


async def reset_staff_password(
    staff_id: uuid.UUID,
    new_password: str,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """
    Reset administré : le nouveau mot de passe est fourni par l'admin/staff
    habilité et communiqué au personnel par email. must_change_pwd reste False —
    on ne force PAS de redéfinition.
    """
    member = await _get_or_404(staff_id, establishment_id, db)
    member.hashed_password = hash_password(new_password)
    member.must_change_pwd = False
    await db.flush()

    try:
        await send_credentials_reset_email(
            email=member.email,
            first_name=member.first_name,
            locale=coerce_locale(member.locale),
            new_password=new_password,
        )
    except EmailDeliveryError as exc:
        logger.exception("Échec d'envoi du mail de reset à %s", member.email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=t("errors.common.email_unavailable_password"),
        ) from exc


async def set_staff_status(
    staff_id: uuid.UUID,
    is_active: bool,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> StaffResponse:
    """Active / désactive un compte staff. Aucune suppression physique."""
    member = await _get_or_404(staff_id, establishment_id, db)
    member.is_active = is_active
    await db.flush()
    await db.refresh(member)
    return StaffResponse.model_validate(member)


# ── Helpers privés ──────────────────────────────────────────────
async def _get_or_404(
    staff_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> User:
    result = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.role == UserRole.STAFF,
            # Isolation : un staff d'un autre établissement est un 404
            User.establishment_id == establishment_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.common.staff_not_found"),
        )
    return member


async def _ensure_email_available(email: str, db: AsyncSession) -> None:
    existing = await db.scalar(select(User.id).where(User.email == email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.common.email_exists"),
        )
