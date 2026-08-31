"""add menus read permission

Revision ID: a1c9e4f6b21a
Revises: e65737c171e1
Create Date: 2026-08-07 14:00:00.000000

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c9e4f6b21a'
down_revision: Union[str, None] = 'e65737c171e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_PERMISSIONS = [
    ("menus:read", "Consulter le menu de la semaine et son historique"),
]


def upgrade() -> None:
    # Permet de déléguer la consultation seule de l'historique des menus,
    # jusqu'ici impossible sans accorder menus:write (droit d'édition).
    op.bulk_insert(
        sa.table(
            "permissions",
            sa.column("id", sa.UUID()),
            sa.column("code", sa.String()),
            sa.column("label", sa.String()),
        ),
        [
            {"id": uuid.uuid4(), "code": code, "label": label}
            for code, label in _NEW_PERMISSIONS
        ],
    )


def downgrade() -> None:
    codes = tuple(code for code, _ in _NEW_PERMISSIONS)
    op.execute(
        sa.text("DELETE FROM permissions WHERE code IN :codes").bindparams(
            sa.bindparam("codes", value=codes, expanding=True)
        )
    )
