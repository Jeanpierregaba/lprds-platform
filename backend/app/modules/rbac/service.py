import uuid
from app.core.i18n import t

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User, UserRole
from app.modules.rbac.dependencies import user_permission_codes
from app.modules.rbac.models import (
    BaselineRoleKind,
    Permission,
    PermissionCode,
    Role,
)
from app.modules.staff.models import StaffType
from app.modules.rbac.schemas import (
    RoleCreateRequest,
    RoleResponse,
    RoleUpdateRequest,
    UserRolesResponse,
)


# ── Catalogue ───────────────────────────────────────────────────
async def list_permissions(db: AsyncSession) -> list[Permission]:
    result = await db.execute(select(Permission).order_by(Permission.code))
    return list(result.scalars().all())


# ── Rôles SOCLES ────────────────────────────────────────────────
# Attribués automatiquement d'après `staff_type` (pas au choix de l'admin), et
# retrouvés par `roles.baseline_kind` — une clé qu'aucune interface n'expose.
#
# ⚠️ Ils l'étaient par leur NOM, que l'admin peut éditer depuis l'écran Rôles.
# Renommé, le socle était recréé en double à l'embauche suivante, et une
# rétrogradation supprimait le lien du mauvais rôle : le membre conservait
# `reports:write`. Mesuré, pas supposé. Un libellé se lit et se change ; une
# clé reste.
#
# « Mon Groupe », Présence et Galerie (médias envoyés) ne sont volontairement
# PAS ici : ce sont des accès hors-RBAC (`/children/my-group`,
# `/attendance/daily/my-group`, `/gallery/my-uploads`), scopés aux propres
# données du membre par construction, jamais par permission.
BASELINE_PERMISSIONS: dict[BaselineRoleKind, list[PermissionCode]] = {
    BaselineRoleKind.EDUCATRICE: [
        PermissionCode.REPORTS_READ,
        PermissionCode.REPORTS_WRITE,
        PermissionCode.MENUS_READ,
    ],
    # Le bibliothécaire est le seul poste à qui l'établissement délègue par
    # défaut tout le volet lecture/écriture/prêts du module Bibliothèque.
    BaselineRoleKind.BIBLIOTHECAIRE: [
        PermissionCode.LIBRARY_READ,
        PermissionCode.LIBRARY_WRITE,
        PermissionCode.LIBRARY_LEND,
    ],
}

# Sortes de socle par type de personnel. Un `staff_type` absent d'ici n'a pas
# de socle — c'est le cas de la majorité.
BASELINE_BY_STAFF_TYPE: dict[str, BaselineRoleKind] = {
    str(StaffType.EDUCATEUR): BaselineRoleKind.EDUCATRICE,
    str(StaffType.BIBLIOTHECAIRE): BaselineRoleKind.BIBLIOTHECAIRE,
}


def baseline_kind_for(staff_type: str | None) -> BaselineRoleKind | None:
    return BASELINE_BY_STAFF_TYPE.get(staff_type or "")


async def ensure_baseline_role(
    kind: BaselineRoleKind,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> Role:
    """
    Rôle socle de cette sorte pour cet établissement, créé au besoin.

    ⚠️ **Ne réactive JAMAIS un socle désactivé.** Il le faisait, et la
    conséquence était mesurable : un admin qui retirait le socle à toutes ses
    éducatrices le voyait revenir — pour TOUTES — à la simple embauche de la
    suivante. Une décision prise dans l'écran Rôles ne doit pas être défaite
    par une action sans rapport. Le nouveau membre reçoit bien le rôle ; tant
    qu'il est désactivé, celui-ci ne confère rien, et le jour où l'admin le
    réactive tout le monde en bénéficie d'un coup, ce qui est précisément ce
    qu'il aura demandé.
    """
    result = await db.execute(
        select(Role).where(
            Role.establishment_id == establishment_id,
            Role.baseline_kind == str(kind),
        )
    )
    role = result.scalar_one_or_none()
    if role is not None:
        return role

    role = Role(
        establishment_id=establishment_id,
        name=await _available_baseline_name(kind, establishment_id, db),
        description=t(f"rbac.baseline.{kind}.description"),
        baseline_kind=str(kind),
    )
    role.permissions = await _resolve_permissions(BASELINE_PERMISSIONS[kind], db)
    db.add(role)
    await db.flush()
    return role


async def _available_baseline_name(
    kind: BaselineRoleKind,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> str:
    """
    Libellé du socle, dans la langue de la requête — un établissement qui
    s'installe en anglais n'a aucune raison de lire « Éducatrice (socle) »
    dans son écran Rôles. Ce n'est plus qu'un libellé : l'admin peut le
    renommer sans rien casser depuis que la clé vit dans `baseline_kind`.

    `uq_role_name_per_estab` reste une contrainte PLEINE : si l'admin a déjà
    créé un rôle portant ce nom à la main, on retombe sur la clé plutôt que de
    laisser l'embauche échouer en 500 sur une collision de libellé.
    """
    wanted = t(f"rbac.baseline.{kind}.name")
    taken = await db.scalar(
        select(Role.id).where(
            Role.establishment_id == establishment_id,
            Role.name == wanted,
        )
    )
    return str(kind) if taken else wanted


# ── Rôles (scopés à l'établissement de l'admin) ─────────────────
async def create_role(
    payload: RoleCreateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> RoleResponse:
    await _ensure_name_available(payload.name, establishment_id, db)

    role = Role(
        establishment_id=establishment_id,
        name=payload.name,
        description=payload.description,
    )
    role.permissions = await _resolve_permissions(payload.permissions, db)
    db.add(role)
    await db.flush()
    return RoleResponse.model_validate(role)


async def list_roles(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    include_inactive: bool = False,
) -> list[RoleResponse]:
    filters = [Role.establishment_id == establishment_id]
    if not include_inactive:
        filters.append(Role.is_active.is_(True))
    result = await db.execute(
        select(Role).where(*filters).order_by(Role.name)
    )
    return [RoleResponse.model_validate(r) for r in result.scalars().all()]


async def get_role(
    role_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> RoleResponse:
    return RoleResponse.model_validate(
        await _get_or_404(role_id, establishment_id, db)
    )


async def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> RoleResponse:
    role = await _get_or_404(role_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)

    if "name" in changes and changes["name"] != role.name:
        await _ensure_name_available(changes["name"], establishment_id, db)

    if "permissions" in changes:
        role.permissions = await _resolve_permissions(
            payload.permissions or [], db
        )
        changes.pop("permissions")

    for field, value in changes.items():
        setattr(role, field, value)

    await db.flush()
    return RoleResponse.model_validate(role)


async def deactivate_role(
    role_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Désactivation — le rôle ne confère plus aucune permission."""
    role = await _get_or_404(role_id, establishment_id, db)
    role.is_active = False
    await db.flush()


# ── Attribution aux membres du staff ────────────────────────────
async def assign_role(
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> UserRolesResponse:
    user = await _get_staff_or_404(user_id, establishment_id, db)
    role = await _get_or_404(role_id, establishment_id, db)

    if role not in user.roles:
        user.roles.append(role)
        await db.flush()
    return _to_user_roles(user)


async def revoke_role(
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> UserRolesResponse:
    user = await _get_staff_or_404(user_id, establishment_id, db)
    role = await _get_or_404(role_id, establishment_id, db)

    if role in user.roles:
        user.roles.remove(role)
        await db.flush()
    return _to_user_roles(user)


async def get_user_roles(
    user_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> UserRolesResponse:
    return _to_user_roles(
        await _get_staff_or_404(user_id, establishment_id, db)
    )


def get_my_permissions(user: User) -> UserRolesResponse:
    """
    Self-service — seule exception du module RBAC accessible hors admin :
    un membre du staff n'a autrement aucun moyen de connaître ses propres
    droits (le reste de `/rbac/*` est réservé à l'admin). Sert uniquement au
    frontend pour composer dynamiquement le menu du portail staff.

    L'admin n'a pas de lignes `Role` (il a « tous les droits chez lui »
    d'office, cf. require_permission) : on lui renvoie donc tout le
    catalogue plutôt que `user.roles`, qui serait vide et donnerait une
    fausse impression de « aucun droit ».
    """
    if user.role == UserRole.ADMIN:
        return UserRolesResponse(
            user_id=user.id, email=user.email, roles=[],
            permissions=sorted(str(c) for c in PermissionCode),
        )
    return _to_user_roles(user)


# ── Helpers privés ──────────────────────────────────────────────
def _to_user_roles(user: User) -> UserRolesResponse:
    return UserRolesResponse(
        user_id=user.id,
        email=user.email,
        roles=[RoleResponse.model_validate(r) for r in user.roles],
        permissions=sorted(user_permission_codes(user)),
    )


async def _resolve_permissions(
    codes: list[PermissionCode],
    db: AsyncSession,
) -> list[Permission]:
    if not codes:
        return []
    wanted = {str(c) for c in codes}
    result = await db.execute(
        select(Permission).where(Permission.code.in_(wanted))
    )
    found = list(result.scalars().all())

    # Garde-fou : le catalogue en base doit refléter l'enum PermissionCode.
    # Un écart signifie qu'une migration de seed n'a pas été appliquée.
    missing = wanted - {p.code for p in found}
    if missing:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=t("errors.rbac.permissions_missing", missing=', '.join(sorted(missing))),
        )
    return found


async def _get_or_404(
    role_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> Role:
    result = await db.execute(
        select(Role).where(
            Role.id == role_id,
            Role.establishment_id == establishment_id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.rbac.role_not_found"),
        )
    return role


async def _get_staff_or_404(
    user_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> User:
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.establishment_id == establishment_id,
            User.role == UserRole.STAFF,
            User.is_active.is_(True),
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.rbac.staff_not_found"),
        )
    return user


async def _ensure_name_available(
    name: str,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    existing = await db.scalar(
        select(Role.id).where(
            Role.establishment_id == establishment_id,
            Role.name == name,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.rbac.role_exists", name=name),
        )
