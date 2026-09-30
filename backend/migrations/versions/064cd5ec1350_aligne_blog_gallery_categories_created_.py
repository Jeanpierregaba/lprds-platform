"""aligne blog_gallery_categories.created_at sur le modele

Revision ID: 064cd5ec1350
Revises: 5e16d04b9050
Create Date: 2026-09-30 03:12:00.000000

Dérive modèle ↔ base, traînée depuis `b71c4e02a9f3` : la colonne y a été créée
sans `nullable=False`, alors que le modèle la déclare `Mapped[datetime]` (non
optionnel, donc NOT NULL). Toutes les autres tables du projet suivent la même
forme, `blog_gallery_categories` était la seule à s'en écarter.

Conséquence : chaque `alembic revision --autogenerate` proposait de la corriger,
et ce bruit s'ajoutait à toute migration légitime — il fallait penser à le
retirer à la main, au risque un jour de l'embarquer par mégarde (ou pire,
d'ignorer une vraie dérive noyée dedans). Deux révisions l'ont déjà écarté
explicitement (`bd0612a8400d`, `5e16d04b9050`).

C'est la BASE qu'on aligne sur le modèle, pas l'inverse : un horodatage de
création absent n'a pas de sens, et `server_default=now()` le renseigne déjà
sur tous les chemins d'écriture.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '064cd5ec1350'
down_revision: Union[str, None] = '5e16d04b9050'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Filet avant le SET NOT NULL : le `server_default` rend une ligne à NULL
    # très improbable (il faudrait un INSERT passant NULL explicitement), mais
    # une seule suffirait à faire échouer la migration en plein déploiement.
    op.execute(
        "UPDATE blog_gallery_categories SET created_at = now() WHERE created_at IS NULL"
    )
    op.alter_column(
        "blog_gallery_categories", "created_at",
        existing_type=sa.DateTime(timezone=True),
        existing_server_default=sa.text("now()"),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "blog_gallery_categories", "created_at",
        existing_type=sa.DateTime(timezone=True),
        existing_server_default=sa.text("now()"),
        nullable=True,
    )
