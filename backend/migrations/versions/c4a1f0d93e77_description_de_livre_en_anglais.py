"""La description d'un livre suit la langue du parent

Titre et auteur sont des noms propres — on ne traduit pas « Le Petit Prince ».
La description, elle, est rédigée par l'établissement et s'affiche dans le
portail parent : c'était le dernier contenu saisi qu'un lecteur anglophone
recevait en français.

Revision ID: c4a1f0d93e77
Revises: b9ae67ea8a92
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4a1f0d93e77"
down_revision: str | None = "b9ae67ea8a92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "books",
        sa.Column("description_en", sa.String(length=1000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("books", "description_en")
