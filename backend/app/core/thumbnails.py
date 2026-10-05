"""
Vignettes des médias — fabriquées à la demande, puis gardées sur disque.

⚠️ **Pourquoi elles existent.** Une image n'est recompressée au téléversement
qu'au-dessus du plafond du module (50 Mo pour les rapports) : une photo de
téléphone est donc stockée TELLE QUELLE, et chaque case d'une grille
téléchargeait l'original. La galerie parent affiche 30 médias par page — à
4 Mo pièce, cela faisait 120 Mo du forfait du parent pour une page de
miniatures, et, tant qu'un plafond de dix secondes existait côté client,
aucune de ces cases ne s'affichait.

Fabriquées à la demande plutôt qu'au téléversement, pour deux raisons : les
médias déjà en ligne en bénéficient sans reprise de données, et un changement
de taille ne demande qu'à vider `_derived/`.

Dégradation volontaire : si la vignette est impossible (vidéo, PDF, image
illisible), l'appelant sert l'ORIGINAL. Une case un peu lourde vaut mieux
qu'une case vide.
"""

import logging
from pathlib import Path

from app.core import media, storage

logger = logging.getLogger(__name__)

#: Nom du dérivé sur disque. Le changer invalide le cache d'un coup.
VARIANT = f"thumb{media.THUMBNAIL_LONG_SIDE}"


async def get_or_create(storage_key: str, content_type: str) -> Path | None:
    """Chemin d'une vignette JPEG, ou None s'il faut servir l'original."""
    if not content_type.startswith("image/"):
        # Une vidéo demanderait ffmpeg ; un PDF, un moteur de rendu. Ni l'un ni
        # l'autre n'est installé, et l'écran sait afficher un repère à la place.
        return None

    path = storage.derived_path(storage_key, VARIANT)
    if path.exists():
        return path

    source = storage.resolve_path(storage_key)
    if not source.exists():
        return None

    try:
        data = await media.thumbnail(await storage.read_file(storage_key))
    except OSError as exc:
        logger.info("Lecture impossible pour la vignette de %s : %s", storage_key, exc)
        return None
    if data is None:
        return None
    return await storage.save_derived(storage_key, VARIANT, data)
