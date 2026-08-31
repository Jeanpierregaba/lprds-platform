"""add gallery read permission

Revision ID: fe6d41084b38
Revises: 4d748c20ed4b
Create Date: 2026-07-29 16:58:03.985237

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fe6d41084b38'
down_revision: Union[str, None] = '4d748c20ed4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_PERMISSIONS = [
    ("gallery:read", "Consulter la galerie de médias (photos/vidéos des rapports)"),
]


def upgrade() -> None:
    # Module Galerie : aucune nouvelle table (agrégation live sur
    # report_attachments / attachments existants, cf. claude.md) — seule une
    # nouvelle permission RBAC est nécessaire.
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
