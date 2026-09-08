"""restore weekly_menus dropped accidentally by fe76c1320d23

Revision ID: 01ce9eb2021f
Revises: fe76c1320d23
Create Date: 2026-09-08 00:00:00.000000

Contexte : la migration fe76c1320d23 (push_subscriptions) contenait par erreur
`DROP TABLE weekly_menus` dans son upgrade() (résidu d'un autogenerate pendant
un merge branché) — le table du module Menus a été supprimée dans toute base
déjà migrée à ce rev. Cette migration la recrée à l'identique de
8940b596f007 (migration du module Menus), de façon idempotente (IF NOT EXISTS)
: sans effet sur une base fraîche, restauratrice sur une base cassée.

⚠️ Les lignes weekly_menus existantes avant la casse ne sont pas récupérables
par migration — seule une restauration depuis un backup pg_dump antérieur à
l'application de fe76c1320d23 le permettrait. À documenter en cas d'incident.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '01ce9eb2021f'
down_revision: Union[str, None] = 'fe76c1320d23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'weekly_menus',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('establishment_id', sa.UUID(), nullable=False),
        sa.Column('week_start', sa.Date(), nullable=False),
        sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_by_id', sa.UUID(), nullable=False),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['establishment_id'], ['establishments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('establishment_id', 'week_start', name='uq_weekly_menu_week'),
        if_not_exists=True,
    )
    op.create_index(
        op.f('ix_weekly_menus_establishment_id'),
        'weekly_menus',
        ['establishment_id'],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_weekly_menus_establishment_id'), table_name='weekly_menus')
    op.drop_table('weekly_menus')