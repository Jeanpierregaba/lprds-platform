"""attendance late grace minutes

Revision ID: 7ee86cf2ad2a
Revises: b71c4e02a9f3
Create Date: 2026-09-23 03:21:15.188169

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '7ee86cf2ad2a'
down_revision: Union[str, None] = 'b71c4e02a9f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Colonne de tolérance (0 = comportement historique, aucun pardon).
    # server_default pour les lignes existantes.
    op.add_column(
        'attendance_settings',
        sa.Column('late_grace_minutes', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('attendance_settings', 'late_grace_minutes')
