"""Version anglaise des diffusions

Une diffusion part à TOUS les parents de l'établissement, anglophones compris :
la laisser en français revenait à ne pas les informer.

Colonnes nullables : NULL = pas (encore) traduite, le parent anglophone lit
alors le français. Les diffusions antérieures partent donc de NULL — elles sont
par nature datées, et la tâche de reprise ne les balaie pas.

Revision ID: 16f338c27517
Revises: 356af593e71c
Create Date: 2026-10-01 10:33:22.749728

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '16f338c27517'
down_revision: Union[str, None] = '356af593e71c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('announcements', sa.Column('title_en', sa.String(length=200), nullable=True))
    op.add_column('announcements', sa.Column('body_en', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('announcements', 'body_en')
    op.drop_column('announcements', 'title_en')
