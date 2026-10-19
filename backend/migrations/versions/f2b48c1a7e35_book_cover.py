"""Couverture du livre (module bibliothèque)

Quatre colonnes DIRECTES plutôt qu'une table : la relation est strictement
1–1, même patron que l'image à la une d'un article (`cover_*` sur `articles`)
et que la photo de profil d'un enfant (`photo_*` sur `children`).

Toutes nullables, et c'est le point : un catalogue entier existe déjà sans
couverture. Exiger l'image aurait rendu inutilisable chaque fiche déjà saisie.

Revision ID: f2b48c1a7e35
Revises: a7e3c91f4d22
Create Date: 2026-10-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2b48c1a7e35'
down_revision: Union[str, None] = 'a7e3c91f4d22'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('books', sa.Column('cover_filename', sa.String(length=255), nullable=True))
    op.add_column('books', sa.Column('cover_content_type', sa.String(length=100), nullable=True))
    op.add_column('books', sa.Column('cover_size_bytes', sa.BigInteger(), nullable=True))
    op.add_column('books', sa.Column('cover_storage_key', sa.String(length=500), nullable=True))


def downgrade() -> None:
    # ⚠️ Les FICHIERS de `media/library/covers/` ne sont pas supprimés ici :
    # une migration ne doit pas détruire des données qu'un `upgrade` suivant ne
    # saurait pas refabriquer. Ils deviennent orphelins, ce qui se nettoie à la
    # main — l'inverse ne se répare pas.
    op.drop_column('books', 'cover_storage_key')
    op.drop_column('books', 'cover_size_bytes')
    op.drop_column('books', 'cover_content_type')
    op.drop_column('books', 'cover_filename')
