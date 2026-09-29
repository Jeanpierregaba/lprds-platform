"""Ajout de users.locale (langue d interface)

Langue choisie par l'utilisateur, source de vérité pour tout ce qui part hors
navigateur (emails, PDF, notifications push) — le cookie du frontend n'y a pas
accès et ces envois ont lieu hors session interactive.

`server_default='fr'` : les comptes existants gardent le français, langue de
toutes les données antérieures à cette colonne.

⚠️ L'autogenerate a aussi proposé de passer `blog_gallery_categories.created_at`
en NOT NULL — dérive préexistante entre le modèle et la base, sans rapport avec
ce chantier. Retirée volontairement pour que cette migration ne porte qu'une
seule intention ; à traiter dans sa propre révision.

Revision ID: bd0612a8400d
Revises: 7ee86cf2ad2a
Create Date: 2026-09-29 14:31:39.288283

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'bd0612a8400d'
down_revision: Union[str, None] = '7ee86cf2ad2a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('locale', sa.String(length=2), server_default='fr', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('users', 'locale')
