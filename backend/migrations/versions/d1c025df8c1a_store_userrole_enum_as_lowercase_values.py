"""store userrole enum as lowercase values

Revision ID: d1c025df8c1a
Revises: c6c427495dc5
Create Date: 2026-07-17 04:41:23.783827

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1c025df8c1a'
down_revision: Union[str, None] = 'c6c427495dc5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_VALUES = ("superadmin", "admin", "staff", "parent")
_NAMES = ("SUPERADMIN", "ADMIN", "STAFF", "PARENT")


def _swap_enum(new_labels: tuple[str, ...], cast: str) -> None:
    """
    PostgreSQL ne permet pas de renommer les labels d'un type enum utilisé par
    une colonne : on crée un nouveau type et on convertit la colonne.
    """
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute(
        "CREATE TYPE userrole AS ENUM ("
        + ", ".join(f"'{v}'" for v in new_labels)
        + ")"
    )
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE userrole "
        f"USING {cast}(role::text)::userrole"
    )
    op.execute("DROP TYPE userrole_old")


def upgrade() -> None:
    # SUPERADMIN → superadmin
    _swap_enum(_VALUES, "lower")


def downgrade() -> None:
    # superadmin → SUPERADMIN
    _swap_enum(_NAMES, "upper")
