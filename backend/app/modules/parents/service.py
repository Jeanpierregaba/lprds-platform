import logging
from app.core.i18n import coerce_locale, t
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.email import (
    EmailDeliveryError,
    send_credentials_reset_email,
    send_welcome_email,
)
from app.modules.auth.models import User, UserRole
from app.modules.auth.security import hash_password
from app.modules.children.models import Child
from app.modules.parents.schemas import (
    ParentCreateRequest,
    ParentListItem,
    ParentListResponse,
    ParentResponse,
    ParentUpdateRequest,
)

logger = logging.getLogger(__name__)


# ── Création ────────────────────────────────────────────────────
async def create_parent(
    payload: ParentCreateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> ParentResponse:
    await _ensure_email_available(payload.email, db)
    children = await _resolve_children(payload.child_ids, establishment_id, db)

    parent = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.PARENT,
        first_name=payload.first_name,
        last_name=payload.last_name,
        nickname=payload.nickname,
        phone=payload.phone,
        establishment_id=establishment_id,
        # Mot de passe temporaire → changement imposé à la 1re connexion
        must_change_pwd=True,
    )
    parent.assigned_children = children
    db.add(parent)
    await db.flush()

    # Email de bienvenue avec les identifiants. S'il échoue, le compte serait
    # inutilisable (le parent ne connaîtrait pas son mot de passe) : on annule.
    estab_name = parent.establishment.name if parent.establishment else ""
    try:
        await send_welcome_email(
            email=parent.email,
            first_name=parent.first_name,
            role=UserRole.PARENT,
            locale=coerce_locale(parent.locale),
            temp_password=payload.password,
            establishment_name=estab_name,
        )
    except EmailDeliveryError as exc:
        logger.exception("Échec d'envoi du mail de bienvenue à %s", parent.email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=t("errors.common.email_unavailable_account"),
        ) from exc

    await db.refresh(parent)
    return ParentResponse.model_validate(parent)


# ── Lecture ─────────────────────────────────────────────────────
async def list_parents(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    search: str | None = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> ParentListResponse:
    filters = [
        User.role == UserRole.PARENT,
        User.establishment_id == establishment_id,
    ]
    if not include_inactive:
        filters.append(User.is_active.is_(True))
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                User.last_name.ilike(pattern),
                User.first_name.ilike(pattern),
                User.nickname.ilike(pattern),
                User.email.ilike(pattern),
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
    parents = result.scalars().all()
    return ParentListResponse(
        total=total or 0,
        items=[
            ParentListItem(
                id=p.id,
                email=p.email,
                first_name=p.first_name,
                last_name=p.last_name,
                nickname=p.nickname,
                phone=p.phone,
                is_active=p.is_active,
                children_count=len(p.assigned_children),
            )
            for p in parents
        ],
    )


async def get_parent(
    parent_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> ParentResponse:
    return ParentResponse.model_validate(
        await _get_or_404(parent_id, establishment_id, db)
    )


# ── Modification ────────────────────────────────────────────────
async def update_parent(
    parent_id: uuid.UUID,
    payload: ParentUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> ParentResponse:
    parent = await _get_or_404(parent_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)

    if "email" in changes and changes["email"] != parent.email:
        await _ensure_email_available(changes["email"], db)

    if "child_ids" in changes:
        parent.assigned_children = await _resolve_children(
            payload.child_ids or [], establishment_id, db
        )
        changes.pop("child_ids")

    for field, value in changes.items():
        setattr(parent, field, value)

    await db.flush()
    await db.refresh(parent)
    return ParentResponse.model_validate(parent)


async def reset_parent_password(
    parent_id: uuid.UUID,
    new_password: str,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """
    Reset administré : le nouveau mot de passe est fourni par l'admin/staff et
    communiqué au parent par email. must_change_pwd reste False — on ne force
    PAS le parent à le redéfinir.
    """
    parent = await _get_or_404(parent_id, establishment_id, db)
    parent.hashed_password = hash_password(new_password)
    parent.must_change_pwd = False
    await db.flush()

    try:
        await send_credentials_reset_email(
            email=parent.email,
            first_name=parent.first_name,
            locale=coerce_locale(parent.locale),
            new_password=new_password,
        )
    except EmailDeliveryError as exc:
        # Rollback (via get_db) : sans email délivré, le parent ignorerait son
        # nouveau mot de passe. On n'applique pas un reset silencieux.
        logger.exception("Échec d'envoi du mail de reset à %s", parent.email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=t("errors.common.email_unavailable_password"),
        ) from exc


# ── Helpers privés ──────────────────────────────────────────────
async def _resolve_children(
    child_ids: list[uuid.UUID],
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> list[Child]:
    """Charge les enfants en vérifiant qu'ils appartiennent à l'établissement."""
    if not child_ids:
        return []
    unique_ids = set(child_ids)
    result = await db.execute(
        select(Child).where(
            Child.id.in_(unique_ids),
            Child.establishment_id == establishment_id,
        )
    )
    children = list(result.scalars().all())

    if len(children) != len(unique_ids):
        found = {c.id for c in children}
        missing = unique_ids - found
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.parents.children_not_found",
                     ids=", ".join(str(m) for m in missing)),
        )
    return children


async def _get_or_404(
    parent_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> User:
    result = await db.execute(
        select(User).where(
            User.id == parent_id,
            User.role == UserRole.PARENT,
            # Isolation : un parent d'un autre établissement est un 404
            User.establishment_id == establishment_id,
        )
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.common.parent_not_found"),
        )
    return parent


async def _ensure_email_available(email: str, db: AsyncSession) -> None:
    existing = await db.scalar(select(User.id).where(User.email == email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.common.email_exists"),
        )
