"""Signature des diffusions par les parents

Deux ajouts :
  • `announcements.requires_signature` — la signature est EXIGÉE par diffusion,
    cochée à la création. `false` par défaut et en server_default : les
    diffusions existantes restent de simples informations, personne n'a
    soudainement un document à signer.
  • `announcement_signatures` — l'attestation elle-même, dans sa propre table.
    Jamais une colonne de `announcement_reads` : lire est passif (l'affichage
    suffit), signer est un acte déclaré. Les deux doivent pouvoir coexister
    sans que l'un n'implique l'autre côté schéma.

Revision ID: c5e9a74b0812
Revises: a3f70c91d8be
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c5e9a74b0812"
down_revision: Union[str, None] = "a3f70c91d8be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "announcements",
        sa.Column(
            "requires_signature",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    op.create_table(
        "announcement_signatures",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("announcement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=False),
        # Le nom TAPÉ par le parent, et celui du compte à cet instant : un
        # parent peut être renommé après coup, l'attestation ne doit pas
        # changer de signataire pour autant.
        sa.Column("signed_name", sa.String(length=200), nullable=False),
        sa.Column("account_name", sa.String(length=200), nullable=False),
        sa.Column(
            "signed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["announcement_id"], ["announcements.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["parent_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "announcement_id", "parent_id", name="uq_announcement_signature"
        ),
    )
    op.create_index(
        op.f("ix_announcement_signatures_announcement_id"),
        "announcement_signatures",
        ["announcement_id"],
    )
    op.create_index(
        op.f("ix_announcement_signatures_parent_id"),
        "announcement_signatures",
        ["parent_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_announcement_signatures_parent_id"),
        table_name="announcement_signatures",
    )
    op.drop_index(
        op.f("ix_announcement_signatures_announcement_id"),
        table_name="announcement_signatures",
    )
    op.drop_table("announcement_signatures")
    op.drop_column("announcements", "requires_signature")
