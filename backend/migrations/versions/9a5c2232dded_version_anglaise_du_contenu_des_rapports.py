"""Version anglaise du contenu des rapports

Un rapport est le texte le plus personnel de la plateforme, et il est lu par
les parents — dont les anglophones. Le laisser en français revenait à leur
refuser ce que l'établissement écrit sur leur propre enfant.

`content_en` ne porte que les champs de TEXTE LIBRE, dans la même arborescence
que `content` : les énumérations gardent leurs codes stables, déjà rendus dans
la langue du lecteur par les catalogues. Un champ absent se lit en français —
le repli est par CHAMP, jamais par rapport.

Les rapports antérieurs partent de NULL et sont rattrapés par la tâche de
reprise.

Revision ID: 9a5c2232dded
Revises: 16f338c27517
Create Date: 2026-10-02 01:20:58.249598

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9a5c2232dded'
down_revision: Union[str, None] = '16f338c27517'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('reports', sa.Column('content_en', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('reports', sa.Column('summary_en', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('reports', 'summary_en')
    op.drop_column('reports', 'content_en')
