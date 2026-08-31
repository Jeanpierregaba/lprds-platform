"""rename staff_attendance_settings to attendance_settings, add timezone

Revision ID: 399295c457dc
Revises: 0a332e279168
Create Date: 2026-07-21 05:28:21.331752

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '399295c457dc'
down_revision: Union[str, None] = '0a332e279168'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Vrais renommages (pas de drop+recreate) : aucune perte de données si des
    # horaires staff avaient déjà été configurés.
    op.rename_table('staff_attendance_settings', 'attendance_settings')
    op.execute(
        "ALTER TABLE attendance_settings "
        "RENAME CONSTRAINT uq_staff_attendance_settings TO uq_attendance_settings"
    )
    op.alter_column(
        'attendance_settings', 'expected_arrival_time',
        new_column_name='staff_expected_arrival_time',
    )
    op.alter_column(
        'attendance_settings', 'expected_departure_time',
        new_column_name='staff_expected_departure_time',
    )
    # server_default nécessaire : la table peut déjà contenir des lignes.
    op.add_column('attendance_settings', sa.Column(
        'timezone', sa.String(length=50), nullable=False, server_default='UTC'
    ))


def downgrade() -> None:
    op.drop_column('attendance_settings', 'timezone')
    op.alter_column(
        'attendance_settings', 'staff_expected_departure_time',
        new_column_name='expected_departure_time',
    )
    op.alter_column(
        'attendance_settings', 'staff_expected_arrival_time',
        new_column_name='expected_arrival_time',
    )
    op.execute(
        "ALTER TABLE attendance_settings "
        "RENAME CONSTRAINT uq_attendance_settings TO uq_staff_attendance_settings"
    )
    op.rename_table('attendance_settings', 'staff_attendance_settings')
