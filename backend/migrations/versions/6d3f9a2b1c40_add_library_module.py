"""add library module (books, lendings, settings)

Revision ID: 6d3f9a2b1c40
Revises: a6bbb7ab048c
Create Date: 2026-08-19 09:00:00.000000

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '6d3f9a2b1c40'
down_revision: Union[str, None] = 'a6bbb7ab048c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_PERMISSIONS = [
    ("library:read", "Consulter le catalogue et le suivi des prêts de la bibliothèque"),
    ("library:write", "Créer, modifier et supprimer les livres du catalogue"),
    ("library:lend", "Enregistrer les prêts, retours et rappels de la bibliothèque"),
]


def upgrade() -> None:
    # ── Tables du module Bibliothèque ───────────────────────────
    op.create_table(
        'books',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('establishment_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('author', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('total_quantity', sa.Integer(), nullable=False, server_default=sa.text('1')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('total_quantity >= 1', name='ck_book_total_quantity_positive'),
        sa.ForeignKeyConstraint(['establishment_id'], ['establishments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_books_establishment_id'), 'books', ['establishment_id'], unique=False)

    op.create_table(
        'book_sections',
        sa.Column('book_id', sa.UUID(), nullable=False),
        sa.Column('section_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['section_id'], ['sections.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('book_id', 'section_id'),
    )

    op.create_table(
        'book_lendings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('establishment_id', sa.UUID(), nullable=False),
        sa.Column('book_id', sa.UUID(), nullable=False),
        sa.Column('child_id', sa.UUID(), nullable=False),
        sa.Column('lent_by_id', sa.UUID(), nullable=False),
        sa.Column('borrowed_at', sa.Date(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('returned_at', sa.Date(), nullable=True),
        sa.Column('last_reminded_on', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('due_date >= borrowed_at', name='ck_lending_due_ge_borrowed'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['child_id'], ['children.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['establishment_id'], ['establishments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['lent_by_id'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_book_lendings_establishment_id'), 'book_lendings', ['establishment_id'], unique=False)
    op.create_index(op.f('ix_book_lendings_book_id'), 'book_lendings', ['book_id'], unique=False)
    op.create_index(op.f('ix_book_lendings_child_id'), 'book_lendings', ['child_id'], unique=False)
    op.create_index(op.f('ix_book_lendings_lent_by_id'), 'book_lendings', ['lent_by_id'], unique=False)

    op.create_table(
        'library_settings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('establishment_id', sa.UUID(), nullable=False),
        sa.Column('reminders_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('reminder_days_before', sa.Integer(), nullable=False, server_default=sa.text('2')),
        sa.Column('default_loan_days', sa.Integer(), nullable=False, server_default=sa.text('14')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('reminder_days_before >= 0', name='ck_library_reminder_days_nonneg'),
        sa.CheckConstraint('default_loan_days >= 1', name='ck_library_default_loan_days_positive'),
        sa.ForeignKeyConstraint(['establishment_id'], ['establishments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('establishment_id', name='uq_library_settings_per_estab'),
    )
    op.create_index(op.f('ix_library_settings_establishment_id'), 'library_settings', ['establishment_id'], unique=False)

    # ── Seed des permissions du module ──────────────────────────
    op.bulk_insert(
        sa.table(
            "permissions",
            sa.column("id", sa.UUID()),
            sa.column("code", sa.String()),
            sa.column("label", sa.String()),
        ),
        [
            {"id": uuid.uuid4(), "code": code, "label": label}
            for code, label in _NEW_PERMISSIONS
        ],
    )


def downgrade() -> None:
    codes = tuple(code for code, _ in _NEW_PERMISSIONS)
    op.execute(
        sa.text("DELETE FROM permissions WHERE code IN :codes").bindparams(
            sa.bindparam("codes", value=codes, expanding=True)
        )
    )

    op.drop_index(op.f('ix_library_settings_establishment_id'), table_name='library_settings')
    op.drop_table('library_settings')
    op.drop_index(op.f('ix_book_lendings_lent_by_id'), table_name='book_lendings')
    op.drop_index(op.f('ix_book_lendings_child_id'), table_name='book_lendings')
    op.drop_index(op.f('ix_book_lendings_book_id'), table_name='book_lendings')
    op.drop_index(op.f('ix_book_lendings_establishment_id'), table_name='book_lendings')
    op.drop_table('book_lendings')
    op.drop_table('book_sections')
    op.drop_index(op.f('ix_books_establishment_id'), table_name='books')
    op.drop_table('books')
