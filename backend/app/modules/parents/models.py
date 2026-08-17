"""
Le compte parent n'est pas un modèle à part : c'est un User (role=parent), déjà
porteur du champ `nickname`. Ce module ne définit donc que la table
d'association parent ↔ enfants.

parent_children relie un compte parent aux enfants qu'il pourra consulter dans le
futur portail. C'est distinct des `guardians` (fiches de contact déclarées sur la
fiche enfant, qui n'ont pas forcément de compte).
"""

from sqlalchemy import Column, ForeignKey, Table
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base

parent_children = Table(
    "parent_children",
    Base.metadata,
    Column(
        "parent_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "child_id",
        UUID(as_uuid=True),
        ForeignKey("children.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
