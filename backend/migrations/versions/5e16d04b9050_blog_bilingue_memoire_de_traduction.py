"""blog bilingue + memoire de traduction + menus {fr,en}

Revision ID: 5e16d04b9050
Revises: bd0612a8400d
Create Date: 2026-09-29 23:18:13.946490

Trois changements, tous liés au contenu bilingue (phase 6 de l'i18n) :

1. `translation_memory` — cache linguistique global, adossé aux menus dont les
   plats se répètent de semaine en semaine.
2. `articles.title_en` / `content_en` / `source_locale` / `translation_status`
   — la version anglaise d'un article et son état.
3. `weekly_menus.content` — l'arbre JSONB passe de {jour: {créneau: plat}} à
   {langue: {jour: {créneau: plat}}}, l'existant remonté sous "fr".

⚠️ Écrit à la main à partir de l'autogenerate : celui-ci posait les colonnes
NOT NULL sans `server_default` (échec garanti sur une table qui a des lignes)
et ne voit évidemment pas la réorganisation d'un JSONB, que la base ne
contraint pas. Il proposait aussi de toucher `blog_gallery_categories.created_at`
— dérive sans rapport avec cette migration, écartée.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5e16d04b9050'
down_revision: Union[str, None] = 'bd0612a8400d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'translation_memory',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('source_hash', sa.String(length=64), nullable=False),
        sa.Column('source_locale', sa.String(length=2), nullable=False),
        sa.Column('target_locale', sa.String(length=2), nullable=False),
        sa.Column('source_text', sa.Text(), nullable=False),
        sa.Column('target_text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source_hash', 'source_locale', 'target_locale',
                            name='uq_translation_memory_entry'),
    )
    op.create_index(op.f('ix_translation_memory_source_hash'),
                    'translation_memory', ['source_hash'], unique=False)

    op.add_column('articles', sa.Column('title_en', sa.String(length=200), nullable=True))
    op.add_column('articles', sa.Column('content_en', sa.Text(), nullable=True))
    # `server_default` obligatoire : les articles existants n'ont aucune de ces
    # valeurs, et une colonne NOT NULL sans défaut échouerait sur la première
    # ligne rencontrée.
    op.add_column('articles', sa.Column(
        'source_locale', sa.String(length=2), nullable=False, server_default='fr'))
    op.add_column('articles', sa.Column(
        'translation_status', sa.String(length=20), nullable=False,
        server_default='pending'))

    # Les articles déjà publiés partent en `pending` : ils seront traduits à
    # leur prochaine modification, ou à la demande via /retranslate. Les
    # traduire ici, dans une migration, imposerait un appel réseau payant au
    # déploiement — hors de question.

    # Menus : l'existant devient la branche française. Le `WHERE` évite de
    # ré-emballer une ligne déjà migrée si la migration est rejouée sur une
    # base partiellement à jour.
    op.execute("""
        UPDATE weekly_menus
           SET content = jsonb_build_object('fr', content)
         WHERE content IS NOT NULL
           AND NOT (content ? 'fr')
    """)


def downgrade() -> None:
    # Remise à plat : on garde le français, la branche anglaise est perdue
    # (c'est un contenu dérivé, régénérable par /retranslate ou au prochain
    # enregistrement du menu).
    op.execute("""
        UPDATE weekly_menus
           SET content = content -> 'fr'
         WHERE content ? 'fr'
    """)
    op.drop_column('articles', 'translation_status')
    op.drop_column('articles', 'source_locale')
    op.drop_column('articles', 'content_en')
    op.drop_column('articles', 'title_en')
    op.drop_index(op.f('ix_translation_memory_source_hash'),
                  table_name='translation_memory')
    op.drop_table('translation_memory')
