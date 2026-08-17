"""backfill educatrice baseline role

Revision ID: b7d2f815c934
Revises: a1c9e4f6b21a
Create Date: 2026-08-07 14:05:00.000000

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d2f815c934'
down_revision: Union[str, None] = 'a1c9e4f6b21a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ROLE_NAME = "Éducatrice (socle)"
_ROLE_DESCRIPTION = (
    "Socle automatique de toute éducatrice : consultation/rédaction des "
    "rapports de son groupe, consultation du menu."
)
_BASELINE_CODES = ["reports:read", "reports:write", "menus:read"]


def upgrade() -> None:
    """
    Attribue rétroactivement le rôle socle (cf. app/modules/rbac/service.py::
    ensure_educatrice_baseline_role) à tout compte staff déjà en base avec
    staff_type=educateur — sans cette migration, seuls les comptes créés
    après ce changement en bénéficieraient.
    """
    bind = op.get_bind()
    meta = sa.MetaData()
    users = sa.Table("users", meta, autoload_with=bind)
    roles = sa.Table("roles", meta, autoload_with=bind)
    permissions = sa.Table("permissions", meta, autoload_with=bind)
    role_permissions = sa.Table("role_permissions", meta, autoload_with=bind)
    user_roles = sa.Table("user_roles", meta, autoload_with=bind)

    perm_ids = [
        row.id
        for row in bind.execute(
            sa.select(permissions.c.id, permissions.c.code).where(
                permissions.c.code.in_(_BASELINE_CODES)
            )
        )
    ]
    if len(perm_ids) != len(_BASELINE_CODES):
        # Catalogue incomplet (migration de seed pas encore appliquée) : rien à faire.
        return

    establishment_ids = bind.execute(
        sa.select(users.c.establishment_id)
        .where(
            users.c.role == "staff",
            users.c.staff_type == "educateur",
            users.c.establishment_id.isnot(None),
        )
        .distinct()
    ).scalars().all()

    for establishment_id in establishment_ids:
        role_row = bind.execute(
            sa.select(roles.c.id).where(
                roles.c.establishment_id == establishment_id,
                roles.c.name == _ROLE_NAME,
            )
        ).first()
        if role_row:
            role_id = role_row.id
        else:
            role_id = uuid.uuid4()
            bind.execute(
                roles.insert().values(
                    id=role_id,
                    establishment_id=establishment_id,
                    name=_ROLE_NAME,
                    description=_ROLE_DESCRIPTION,
                    is_active=True,
                )
            )

        existing_perm_ids = set(
            bind.execute(
                sa.select(role_permissions.c.permission_id).where(
                    role_permissions.c.role_id == role_id
                )
            ).scalars().all()
        )
        to_add_perms = [pid for pid in perm_ids if pid not in existing_perm_ids]
        if to_add_perms:
            bind.execute(
                role_permissions.insert(),
                [{"role_id": role_id, "permission_id": pid} for pid in to_add_perms],
            )

        educateur_ids = bind.execute(
            sa.select(users.c.id).where(
                users.c.establishment_id == establishment_id,
                users.c.role == "staff",
                users.c.staff_type == "educateur",
                users.c.is_active.is_(True),
            )
        ).scalars().all()
        existing_user_ids = set(
            bind.execute(
                sa.select(user_roles.c.user_id).where(
                    user_roles.c.role_id == role_id
                )
            ).scalars().all()
        )
        to_assign = [uid for uid in educateur_ids if uid not in existing_user_ids]
        if to_assign:
            bind.execute(
                user_roles.insert(),
                [{"user_id": uid, "role_id": role_id} for uid in to_assign],
            )


def downgrade() -> None:
    """
    No-op volontaire : retirer le rôle socle rétroactivement retirerait aussi
    des permissions que l'admin a pu accorder indépendamment entre-temps.
    Un rollback de cette migration ne redonne donc pas l'état exact d'avant.
    """
    pass
