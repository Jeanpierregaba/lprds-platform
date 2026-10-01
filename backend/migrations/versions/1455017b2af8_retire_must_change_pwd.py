"""Retire la colonne must_change_pwd

Le changement de mot de passe imposé à la première connexion est abandonné
(décision produit). La fonctionnalité n'était de toute façon qu'à moitié en
place : l'API REST ne l'imposait plus, le frontend ne la lisait nulle part,
mais le handshake WebSocket de la messagerie refusait encore les comptes
concernés — un compte neuf n'avait donc pas de temps réel, sans explication.

La colonne part plutôt que de rester à mentir. `downgrade()` la recrée avec
`server_default='false'` : on ne peut pas restaurer les valeurs, mais false
est le seul état cohérent avec la nouvelle règle — personne n'est tenu de
redéfinir son mot de passe.

Revision ID: 1455017b2af8
Revises: 5119a5bb292d
Create Date: 2026-10-01 02:31:47.537249

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1455017b2af8'
down_revision: Union[str, None] = '5119a5bb292d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('users', 'must_change_pwd')


def downgrade() -> None:
    op.add_column(
        'users',
        sa.Column('must_change_pwd', sa.Boolean(), server_default='false', nullable=False),
    )
