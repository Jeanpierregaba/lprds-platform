"""Drapeau de traduction en attente sur les rapports

Dérivé, recalculé à chaque tentative de traduction, jamais saisi. Il existe
pour que le balayage de reprise reste exact ET bon marché sur un volume qui
grandit d'un rapport par enfant et par jour.

Un `content_en IS NULL` n'aurait pas suffi, pour deux raisons :
  - il rate les rapports PARTIELLEMENT traduits, ceux qu'une panne en cours de
    modification laisse derrière elle ;
  - sur une colonne JSONB, `None` côté Python s'écrit `null` JSON et non NULL
    SQL, donc `IS NULL` ne ramène rien (corrigé par `none_as_null` dans la
    même passe).

`server_default='true'` : les rapports existants sont tous à traduire.

Revision ID: b9ae67ea8a92
Revises: 9a5c2232dded
Create Date: 2026-10-02 01:29:21.777001

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9ae67ea8a92'
down_revision: Union[str, None] = '9a5c2232dded'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('reports', sa.Column('translation_pending', sa.Boolean(), server_default='true', nullable=False))
    op.create_index(op.f('ix_reports_translation_pending'), 'reports', ['translation_pending'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_reports_translation_pending'), table_name='reports')
    op.drop_column('reports', 'translation_pending')
