"""Nom anglais des étiquettes d'article et des catégories de galerie

Ces deux vocabulaires sont créés librement par l'établissement et s'affichent
SUR LE SITE VITRINE — les pastilles de filtre de /actualites et /galerie. Ils
restaient en français sur les pages anglaises : le trou le plus voyant du
bilinguisme, sur la surface la plus exposée.

Colonne nullable : NULL = pas encore traduit, la lecture publique retombe alors
sur le français. Les lignes existantes partent donc de NULL et se remplissent au
prochain renommage, ou par une correction explicite.

Pas de colonne « corrigé à la main » : une correction est gravée dans
`translation_memory`, qui la restitue à la traduction suivante du même libellé.

Revision ID: 356af593e71c
Revises: 1455017b2af8
Create Date: 2026-10-01 03:14:45.693646

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '356af593e71c'
down_revision: Union[str, None] = '1455017b2af8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('blog_gallery_categories', sa.Column('name_en', sa.String(length=50), nullable=True))
    op.add_column('blog_tags', sa.Column('name_en', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('blog_tags', 'name_en')
    op.drop_column('blog_gallery_categories', 'name_en')
