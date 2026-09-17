from alembic import op
import sqlalchemy as sa

revision = "8b14d6e0c2f9"
down_revision = "07d6951e18ea"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "messages", sa.Column("is_deleted", sa.Boolean(), server_default=sa.false(), nullable=False)
    )


def downgrade() -> None:
    op.drop_column("messages", "is_deleted")
    op.drop_column("messages", "edited_at")
