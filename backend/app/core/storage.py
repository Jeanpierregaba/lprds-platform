"""
Stockage de fichiers — backend LOCAL uniquement pour l'instant.

`settings.storage_backend` anticipe d'autres backends (ex: S3) mais un seul est
implémenté ici ; à étendre (interface identique, autre implémentation) le jour
où un backend objet distant est nécessaire.
"""

import asyncio
import uuid
from pathlib import Path

from app.core.config import settings


def _root() -> Path:
    root = Path(settings.storage_local_path)
    root.mkdir(parents=True, exist_ok=True)
    return root


async def save_file(subfolder: str, original_filename: str, content: bytes) -> str:
    """
    Écrit le fichier et retourne sa clé de stockage (chemin relatif).

    Le nom sur disque est un UUID — jamais le nom original (évite collisions et
    path traversal) — celui-ci reste tracé séparément en base pour l'affichage
    et le téléchargement.
    """
    ext = Path(original_filename).suffix[:10]
    key = f"{subfolder}/{uuid.uuid4()}{ext}"
    path = _root() / key
    path.parent.mkdir(parents=True, exist_ok=True)
    # write_bytes est bloquant : hors thread principal pour ne pas geler la
    # boucle asyncio le temps de l'écriture disque.
    await asyncio.to_thread(path.write_bytes, content)
    return key


def resolve_path(storage_key: str) -> Path:
    return _root() / storage_key


#: Les dérivés (vignettes) vivent à part, pour que le dossier des originaux
#: reste exactement ce qui a été téléversé — un nettoyage du cache se fait en
#: supprimant ce seul dossier, et il se reconstruit tout seul.
DERIVED_FOLDER = "_derived"


def derived_path(storage_key: str, variant: str) -> Path:
    """Chemin du dérivé `variant` d'un fichier stocké (vignette, etc.)."""
    return _root() / DERIVED_FOLDER / variant / f"{storage_key}.jpg"


async def read_file(storage_key: str) -> bytes:
    return await asyncio.to_thread(resolve_path(storage_key).read_bytes)


def _write_atomic(path: Path, content: bytes) -> None:
    """Écrit via un fichier temporaire puis renomme.

    ⚠️ Deux requêtes peuvent demander la même vignette en même temps — c'est
    même le cas NORMAL, une grille en demande douze d'un coup. Une écriture
    directe laisserait l'autre requête servir un fichier à moitié écrit : une
    image tronquée, donc cassée à l'écran, et mise en cache pour de bon.
    Le renommage est atomique sur un même système de fichiers.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{uuid.uuid4().hex}.tmp")
    tmp.write_bytes(content)
    tmp.replace(path)


async def save_derived(storage_key: str, variant: str, content: bytes) -> Path:
    path = derived_path(storage_key, variant)
    await asyncio.to_thread(_write_atomic, path, content)
    return path


async def delete_file(storage_key: str) -> None:
    await asyncio.to_thread(resolve_path(storage_key).unlink, True)
    # Les dérivés suivent l'original : les laisser derrière ferait grossir le
    # disque de fichiers que plus rien ne référence.
    for variant_dir in (_root() / DERIVED_FOLDER).glob("*"):
        await asyncio.to_thread(
            (variant_dir / f"{storage_key}.jpg").unlink, True
        )
