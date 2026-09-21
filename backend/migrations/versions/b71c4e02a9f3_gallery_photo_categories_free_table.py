"""gallery photo categories as free table (replaces GalleryCategory enum)

Revision ID: b71c4e02a9f3
Revises: 8b14d6e0c2f9
Create Date: 2026-09-19

BlogGalleryCategory (blog_gallery_categories) calquée sur BlogTag : nom libre
unique par établissement, créée à la volée. Les photos existantes sont
reclassées automatiquement (une catégorie créée par ancien code figé
retrouvé, libellé FR historique), puis la colonne `category` est remplacée
par `category_id` (FK ON DELETE SET NULL — supprimer une catégorie conserve
les photos, qui passent « sans catégorie »).
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b71c4e02a9f3'
down_revision: Union[str, None] = '8b14d6e0c2f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Libellés FR historiques des anciens codes figés (frontend data.ts).
_LEGACY_LABELS = {
    "activities": "Activités manuelles",
    "outdoor": "Jeux extérieurs",
    "meals": "Repas",
    "rest": "Temps calme",
    "events": "Fêtes & sorties",
    "environment": "Cadre",
}


def upgrade() -> None:
    op.create_table(
        "blog_gallery_categories",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("establishment_id", sa.UUID(), nullable=False, index=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["establishment_id"], ["establishments.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("establishment_id", "name", name="uq_blog_gallery_category_name"),
    )

    conn = op.get_bind()
    existing = conn.execute(
        sa.text("SELECT DISTINCT establishment_id, category FROM blog_gallery_photos")
    ).all()
    for establishment_id, code in existing:
        conn.execute(
            sa.text(
                "INSERT INTO blog_gallery_categories (id, establishment_id, name) "
                "VALUES (:id, :establishment_id, :name) ON CONFLICT DO NOTHING"
            ),
            {
                "id": uuid.uuid4(),
                "establishment_id": establishment_id,
                "name": _LEGACY_LABELS.get(code, code),
            },
        )

    op.add_column(
        "blog_gallery_photos",
        sa.Column("category_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_blog_gallery_photos_category", "blog_gallery_photos",
        "blog_gallery_categories", ["category_id"], ["id"], ondelete="SET NULL",
    )
    # Backfill : le libellé inséré dérivant du code, la jointure retrouve la
    # catégorie créée pour chaque photo (code inconnu → libellé = code brut).
    case_branches = " ".join(
        f"WHEN '{code}' THEN '{label}'" for code, label in _LEGACY_LABELS.items()
    )
    conn.execute(
        sa.text(
            "UPDATE blog_gallery_photos p SET category_id = c.id "
            "FROM blog_gallery_categories c "
            "WHERE c.establishment_id = p.establishment_id "
            f"AND c.name = (CASE p.category {case_branches} ELSE p.category END)"
        )
    )
    op.drop_column("blog_gallery_photos", "category")


def downgrade() -> None:
    # La correspondance catégorie ← ancien code est perdue au downgrade : la
    # colonne recréée reste vide (nullable), à re-remplir à la main si besoin.
    op.drop_constraint("fk_blog_gallery_photos_category", "blog_gallery_photos", type_="foreignkey")
    op.drop_column("blog_gallery_photos", "category_id")
    op.add_column(
        "blog_gallery_photos",
        sa.Column("category", sa.String(20), nullable=True),
    )
    op.drop_table("blog_gallery_categories")
