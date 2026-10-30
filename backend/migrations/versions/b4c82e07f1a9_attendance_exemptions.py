"""Exemptions de présence : une table, une période, enfants et sections

Revision ID: b4c82e07f1a9
Revises: f2b48c1a7e35

Une exemption ne pouvait concerner qu'un membre du personnel, et seulement
« pour toujours » : un booléen `users.attendance_exempt`. Elle porte désormais
une PÉRIODE et peut viser un enfant ou une SECTION entière — ce qu'un booléen
sur `users` ne pouvait exprimer ni l'un ni l'autre.

⚠️ **Les exemptions existantes sont REPRISES**, en périodes sans bornes
(`starts_on` et `ends_on` à NULL), ce qui est exactement ce que le booléen
voulait dire. Sans cette reprise, tout personnel exempté se découvrirait compté
« absent » au lendemain du déploiement, sans qu'aucun écran ne l'annonce — le
même défaut silencieux que le redécoupage de `attendance:write`, qui avait dû
réattribuer ses permissions aux rôles existants.

Le `downgrade` rend le booléen et le repose depuis les exemptions actives et
sans fin — les périodes, elles, sont perdues : c'est une information que la
colonne ne sait pas porter.
"""

import sqlalchemy as sa
from alembic import op

revision = "b4c82e07f1a9"
down_revision = "f2b48c1a7e35"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attendance_exemptions",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "establishment_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("establishments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("scope", sa.String(length=10), nullable=False),
        sa.Column(
            "staff_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "child_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("children.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "section_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("sections.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("starts_on", sa.Date(), nullable=True),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "created_by_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("expired_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(scope = 'staff'   AND staff_id   IS NOT NULL AND child_id IS NULL AND section_id IS NULL) "
            "OR (scope = 'child'   AND child_id   IS NOT NULL AND staff_id IS NULL AND section_id IS NULL) "
            "OR (scope = 'section' AND section_id IS NOT NULL AND staff_id IS NULL AND child_id   IS NULL)",
            name="ck_attendance_exemption_target",
        ),
        sa.CheckConstraint(
            "starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on",
            name="ck_attendance_exemption_period",
        ),
    )
    op.create_index(
        "ix_attendance_exemptions_establishment_id",
        "attendance_exemptions",
        ["establishment_id"],
    )
    op.create_index(
        "ix_attendance_exemptions_estab_scope",
        "attendance_exemptions",
        ["establishment_id", "scope"],
    )

    # Reprise : chaque exemption en vigueur devient une période sans bornes.
    # `establishment_id` est NOT NULL dans la table : un compte sans
    # établissement ne peut pas y entrer — il n'apparaît d'ailleurs dans aucun
    # tableau de bord de présence, donc son exemption ne servait à rien.
    op.execute(
        """
        INSERT INTO attendance_exemptions
            (id, establishment_id, scope, staff_id, is_active, created_at, updated_at)
        SELECT gen_random_uuid(), u.establishment_id, 'staff', u.id, true, now(), now()
        FROM users u
        WHERE u.attendance_exempt IS TRUE
          AND u.establishment_id IS NOT NULL
        """
    )

    op.drop_column("users", "attendance_exempt")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "attendance_exempt",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Seules les exemptions de personnel ACTIVES et SANS FIN se traduisent en
    # booléen. Une période bornée n'a pas d'équivalent : la retenir comme
    # « exempté pour toujours » serait plus faux que de la laisser tomber.
    op.execute(
        """
        UPDATE users SET attendance_exempt = true
        WHERE id IN (
            SELECT staff_id FROM attendance_exemptions
            WHERE scope = 'staff' AND is_active IS TRUE AND ends_on IS NULL
        )
        """
    )
    op.drop_index("ix_attendance_exemptions_estab_scope", table_name="attendance_exemptions")
    op.drop_index(
        "ix_attendance_exemptions_establishment_id", table_name="attendance_exemptions"
    )
    op.drop_table("attendance_exemptions")
