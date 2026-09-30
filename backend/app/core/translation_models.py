"""
Mémoire de traduction — modèle séparé de `app/core/translation.py`.

Pourquoi un fichier à part : `app/core/models.py` (le registre central) doit
pouvoir importer ce modèle sans tirer le client de traduction, qui importe le
SDK Anthropic. Le registre est chargé au démarrage de l'app, par le seed et
par Alembic ; aucun de ces trois points d'entrée n'a de raison d'exiger un
paquet qui ne sert qu'à la traduction.

Le contenu est global à l'instance, PAS scopé par établissement : « riz au
gras » se traduit pareil partout, et un scope par établissement multiplierait
les appels sans rien apporter. C'est une table de cache linguistique, pas une
donnée métier — elle ne contient aucune information personnelle (des noms de
plats et du texte d'actualités publiques).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TranslationMemory(Base):
    __tablename__ = "translation_memory"
    __table_args__ = (
        UniqueConstraint(
            "source_hash", "source_locale", "target_locale",
            name="uq_translation_memory_entry",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # SHA-256 du texte source rogné — la colonne indexée, pas `source_text` :
    # un article de blog entier ne peut pas porter d'index B-tree (limite de
    # taille de clé), et l'empreinte est de longueur fixe.
    source_hash:   Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_locale: Mapped[str] = mapped_column(String(2), nullable=False)
    target_locale: Mapped[str] = mapped_column(String(2), nullable=False)

    # Conservé pour l'audit : permet de relire ce qui a été traduit, et de
    # rejouer la mémoire si le prompt de traduction change un jour.
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    target_text: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<TranslationMemory {self.source_locale}->{self.target_locale}>"
