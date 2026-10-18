import logging
from app.core.i18n import coerce_locale, t
import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.email import (
    EmailDeliveryError,
    send_credentials_reset_email,
    send_welcome_email,
)
from app.modules.auth.models import User, UserRole
from app.modules.auth import service as auth_service
from app.modules.auth.security import hash_password
from app.modules.establishments.models import Establishment
from app.modules.rbac.models import user_roles
from app.modules.rbac.service import (
    baseline_kind_for,
    ensure_baseline_role,
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
    )
    db.add(member)
    await db.flush()

    kind = baseline_kind_for(member.staff_type)
    if kind is not None:
        # Insertion directe dans la table d'association plutôt que
        # `member.roles.append(...)` : `member` vient d'être créé (jamais
        # chargé par un SELECT), donc sa collection `roles` n'est pas
        # hydratée — y toucher déclencherait un lazy-load synchrone,
        # incompatible avec le contexte async ici.
        role = await ensure_baseline_role(kind, establishment_id, db)
        await _link_baseline(member.id, role.id, db)
        await db.flush()

    # Email de bienvenue avec les identifiants. S'il échoue, le compte serait
    # inutilisable (mot de passe non communiqué) : on annule (503).
    try:
        await send_welcome_email(
            email=member.email,
            first_name=member.first_name,
            nickname=member.nickname,
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


async def _link_baseline(
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """
    Rattache un membre à son rôle socle, sans tomber si le lien existe déjà.

    ⚠️ `ON CONFLICT DO NOTHING` n'est pas une précaution théorique : le socle
    est un rôle ORDINAIRE dans l'écran Rôles, donc l'admin peut l'attribuer à
    la main. Attribué à une secrétaire puis promue éducatrice, l'insertion
    violait `user_roles_pkey` et la promotion répondait **500** — reproduit.
    """
    await db.execute(
        pg_insert(user_roles)
        .values(user_id=user_id, role_id=role_id)
        .on_conflict_do_nothing()
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
    kind_before = baseline_kind_for(member.staff_type)

    if "email" in changes and changes["email"] != member.email:
        await _ensure_email_available(changes["email"], db)
    if "staff_type" in changes and changes["staff_type"] is not None:
        changes["staff_type"] = str(changes["staff_type"])

    for field, value in changes.items():
        setattr(member, field, value)

    # Changement de poste : on retire le socle de l'ANCIENNE sorte et on pose
    # celui de la nouvelle. Une seule boucle pour les deux sortes — les écrire
    # l'une après l'autre, c'était deux occasions de n'en traiter qu'une, et le
    # jour où un troisième poste reçoit un socle, trois.
    kind_now = baseline_kind_for(member.staff_type)
    if kind_before != kind_now:
        if kind_before is not None:
            old = await ensure_baseline_role(kind_before, establishment_id, db)
            await db.execute(
                delete(user_roles).where(
                    user_roles.c.user_id == member.id,
                    user_roles.c.role_id == old.id,
                )
            )
        if kind_now is not None:
            role = await ensure_baseline_role(kind_now, establishment_id, db)
            await _link_baseline(member.id, role.id, db)

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
    habilité et communiqué au personnel par email. Le membre s'en sert tel
    quel — la plateforme n'impose aucune redéfinition à la connexion suivante.
    """
    member = await _get_or_404(staff_id, establishment_id, db)
    member.hashed_password = hash_password(new_password)
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


async def resend_staff_invitation(
    staff_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    password: str | None = None,
) -> None:
    """Renvoie l'email de bienvenue avec un mot de passe neuf.

    Pour un membre du personnel qui ne retrouve pas l'email reçu à la création. Le mot de
    passe d'ORIGINE est irrécupérable (bcrypt) : cf. `auth_service.resend_invitation`,
    qui porte le geste et la politique d'échec pour les deux modules.

    ⚠️ Un compte qui s'est DÉJÀ connecté a probablement choisi son propre mot de
    passe : une relance le lui retire. Le refuser ici serait pourtant faux —
    perdre son mot de passe après s'être connecté une fois est le cas le plus
    banal qui soit. C'est donc l'écran qui AVERTIT, en lisant `last_login_at`,
    déjà exposé par la réponse.
    """
    user = await _get_or_404(staff_id, establishment_id, db)
    await auth_service.resend_invitation(user, db, password=password)


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
