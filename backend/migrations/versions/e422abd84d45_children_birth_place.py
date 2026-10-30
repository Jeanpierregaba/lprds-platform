"""Lieu de naissance sur la fiche enfant

Colonne NULLABLE : les fiches déjà saisies n'ont pas cette information, et
aucune valeur par défaut n'aurait de sens pour un lieu de naissance — une
mention inventée serait pire qu'un champ vide, puisqu'on ne saurait plus la
distinguer d'une vraie saisie.

Revision ID: e422abd84d45
Revises: b4c82e07f1a9
Create Date: 2026-10-30 07:53:34.067374

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e422abd84d45'
down_revision: Union[str, None] = 'b4c82e07f1a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "children",
        sa.Column("birth_place", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("children", "birth_place")
