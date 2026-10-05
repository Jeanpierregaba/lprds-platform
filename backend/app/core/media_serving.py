"""
Service des fichiers médias — un seul endroit pour les neuf endpoints.

Quatre modules servent des médias (rapports, messagerie, blog interne, blog
public) et chacun le faisait avec son propre `FileResponse`. Ajouter les
vignettes et les en-têtes de cache à neuf endroits, c'était neuf occasions de
n'en faire que huit.
"""

from pathlib import Path

from fastapi.responses import FileResponse

from app.core import media, thumbnails

#: Un média ne change JAMAIS pour un identifiant donné : il est remplacé par un
#: autre, avec un autre identifiant. Le navigateur peut donc le garder
#: longtemps — ce qui, sur un forfait mobile, compte autant que la vignette.
#: `private` : jamais mis en cache par un intermédiaire, le contenu est
#: authentifié (dossiers d'enfants, conversations).
PRIVATE_CACHE = "private, max-age=604800, immutable"
#: Le site vitrine, lui, est public : un proxy peut légitimement le servir.
PUBLIC_CACHE = "public, max-age=604800, immutable"


async def media_response(
    *,
    storage_key: str,
    path: Path,
    filename: str,
    content_type: str,
    thumb: bool = False,
    public: bool = False,
) -> FileResponse:
    """Sert un média, en vignette si elle est demandée ET possible.

    ⚠️ Dégradation volontaire : vignette impossible (vidéo, PDF, image
    illisible) → on sert l'ORIGINAL plutôt qu'une erreur. L'appelant n'a jamais
    à savoir si le fichier est « vignettable » ; au pire la case est un peu
    lourde, elle n'est jamais vide.
    """
    headers = {"Cache-Control": PUBLIC_CACHE if public else PRIVATE_CACHE}

    # `storage_key` est nullable sur l'image à la une d'un article : le service
    # appelant garantit qu'elle existe ici, mais une garde coûte moins cher
    # qu'une 500 le jour où un appelant l'oublie.
    if thumb and storage_key:
        thumb_path = await thumbnails.get_or_create(storage_key, content_type)
        if thumb_path is not None:
            return FileResponse(
                thumb_path, media_type=media.THUMBNAIL_TYPE, headers=headers
            )

    return FileResponse(
        path, filename=filename, media_type=content_type, headers=headers
    )
