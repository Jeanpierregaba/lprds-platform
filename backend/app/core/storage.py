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


async def delete_file(storage_key: str) -> None:
    await asyncio.to_thread(resolve_path(storage_key).unlink, True)
