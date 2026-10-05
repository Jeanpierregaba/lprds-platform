"""Marque les entrées de mémoire de traduction corrigées à la main

Distingue une entrée posée par le modèle d'une entrée relue par un humain.
Deux usages :

- la machine n'écrase jamais une entrée existante (`ON CONFLICT DO NOTHING`),
  mais une correction doit écraser ce que la machine avait mis ;
- un futur rejeu de la mémoire (si le prompt de traduction change) doit pouvoir
  régénérer les entrées automatiques SANS effacer le travail de relecture.

`server_default='false'` : les entrées existantes viennent toutes du modèle.

Revision ID: 5119a5bb292d
Revises: 064cd5ec1350
Create Date: 2026-09-30 14:52:02.064713

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5119a5bb292d'
down_revision: Union[str, None] = '064cd5ec1350'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('translation_memory', sa.Column('is_correction', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('translation_memory', 'is_correction')
