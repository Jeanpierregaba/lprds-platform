"""
Identification et normalisation des médias téléversés.

⚠️ **Le type d'un fichier se lit dans son CONTENU, jamais dans ce que le client
en dit.** Les trois modules qui acceptent des médias (rapports, messagerie,
blog) validaient sur `UploadFile.content_type` — une simple déclaration du
navigateur. Conséquence vécue : une photo parfaitement valide arrivant avec un
MIME vide ou `application/octet-stream` était refusée, alors que la même photo
passait depuis un autre appareil. C'est le « certains formats passent, d'autres
non » remonté par l'établissement, et ça ne dépendait pas du format mais de
l'appareil et du chemin de partage.

Deux conséquences, et la seconde compte autant que la première :
  - on cesse de refuser ce qui est valide (on lit les octets) ;
  - on cesse d'accepter ce qui ment (un SVG déguisé en `image/png` passait,
    et le SVG est refusé partout pour cause de XSS).

Le module rend aussi les médias AFFICHABLES et transportables :
  - le HEIC des iPhone était accepté puis illisible partout sauf sur Safari —
    une photo « envoyée avec succès » qui s'affiche vide est pire qu'un refus.
    Il est converti en JPEG ;
  - une image trop lourde est recompressée au lieu d'être rejetée.
"""

import asyncio
import io
import logging
from dataclasses import dataclass

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps

from app.core.i18n import t

logger = logging.getLogger(__name__)

# Les plugins Pillow se chargent paresseusement : sans cet appel, `Image.OPEN`
# est vide au premier passage et le format n'est pas reconnu.
Image.init()

try:  # pragma: no cover — dépend de l'environnement d'installation
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIF_SUPPORTED = True
except Exception:  # noqa: BLE001 — l'absence du paquet ne doit rien casser
    HEIF_SUPPORTED = False
    logger.warning(
        "pillow-heif absent : les photos iPhone (HEIC) seront refusées plutôt "
        "que converties. Installer pillow-heif pour les accepter."
    )

# Une image minuscule peut se décompresser en plusieurs gigaoctets ; Pillow
# pose déjà une limite, on la rend explicite plutôt que de dépendre du défaut.
Image.MAX_IMAGE_PIXELS = 80_000_000  # ~80 Mpx, très au-delà d'un appareil photo

SVG_TYPE = "image/svg+xml"

# Signatures de conteneurs vidéo. On ne cherche pas à valider le flux — juste à
# distinguer « c'est une vidéo » de « c'est autre chose », ce que le MIME
# déclaré ne dit pas de façon fiable.
_VIDEO_SIGNATURES: tuple[tuple[int, bytes, str], ...] = (
    (4, b"ftyp", "video/mp4"),          # MP4, MOV, 3GP… (la marque suit)
    (0, b"\x1a\x45\xdf\xa3", "video/webm"),  # EBML : WebM et Matroska
    (0, b"RIFF", "video/x-msvideo"),    # AVI (vérifié plus bas sur « AVI »)
    (0, b"\x00\x00\x01\xba", "video/mpeg"),
    (0, b"\x30\x26\xb2\x75", "video/x-ms-wmv"),
    (0, b"FLV", "video/x-flv"),
)

# Marques `ftyp` qui désignent une image, pas une vidéo : HEIC et AVIF
# partagent le conteneur ISO-BMFF des MP4.
_IMAGE_BRANDS = {
    b"heic": "image/heic", b"heix": "image/heic", b"hevc": "image/heic",
    b"heim": "image/heic", b"heis": "image/heic", b"hevm": "image/heic",
    b"mif1": "image/heif", b"msf1": "image/heif",
    b"avif": "image/avif", b"avis": "image/avif",
}


def _video_type(content: bytes) -> str | None:
    for offset, magic, mime in _VIDEO_SIGNATURES:
        if content[offset : offset + len(magic)] != magic:
            continue
        if magic == b"ftyp":
            # Même conteneur pour le HEIC et l'AVIF : la marque tranche.
            brand = content[8:12]
            if brand in _IMAGE_BRANDS:
                return None
            if brand[:3] == b"qt ":
                return "video/quicktime"
            return mime
        if magic == b"RIFF":
            # RIFF porte aussi le WAV et le WebP : seul « AVI » est une vidéo.
            return mime if content[8:11] == b"AVI" else None
        return mime
    return None


def _image_type(content: bytes) -> str | None:
    """Type d'image réel, lu par Pillow — donc sans liste de signatures à tenir.

    Le HEIC et l'AVIF arrivent avant, par leur marque de conteneur : Pillow ne
    les lit que si `pillow-heif` est installé, et on veut les reconnaître même
    quand il manque, pour pouvoir le DIRE au lieu d'un refus muet.
    """
    if content[4:8] == b"ftyp" and content[8:12] in _IMAGE_BRANDS:
        return _IMAGE_BRANDS[content[8:12]]
    try:
        with Image.open(io.BytesIO(content)) as img:
            fmt = (img.format or "").upper()
    except Exception:  # noqa: BLE001 — un fichier illisible n'est pas une image
        return None
    return Image.MIME.get(fmt)


@dataclass(frozen=True)
class SniffResult:
    """Ce que le fichier EST, par opposition à ce qu'il prétend être."""

    content_type: str | None   # None = ni image ni vidéo reconnue
    is_image: bool
    is_video: bool


def sniff(content: bytes) -> SniffResult:
    """Type réel d'un téléversement, déduit de ses octets."""
    mime = _image_type(content)
    if mime:
        return SniffResult(mime, is_image=True, is_video=False)
    mime = _video_type(content)
    if mime:
        return SniffResult(mime, is_image=False, is_video=True)
    return SniffResult(None, is_image=False, is_video=False)


def _encode_jpeg(img: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    # `optimize` gagne quelques pourcents gratuitement ; `progressive` affiche
    # l'image par passes sur une connexion lente, ce qui est le cas d'usage ici.
    img.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def _compress_image_sync(content: bytes, max_bytes: int) -> bytes | None:
    """Ramène une image sous `max_bytes`, ou rend None si c'est hors d'atteinte.

    Deux leviers, dans cet ordre : la QUALITÉ d'abord (invisible à l'œil
    jusqu'à ~75, et c'est ce que l'utilisateur demandait — compresser sans
    perdre en qualité visuelle), la DÉFINITION ensuite. Réduire la définition
    en premier ferait perdre du détail là où un simple ré-encodage aurait
    suffi : une photo de 12 Mpx sortie d'un téléphone pèse souvent 8 Mo en
    HEIC et 2 Mo en JPEG de qualité 85, à définition identique.
    """
    try:
        with Image.open(io.BytesIO(content)) as img:
            # L'orientation EXIF doit être APPLIQUÉE avant de ré-encoder : le
            # JPEG de sortie ne porte plus l'EXIF d'origine, et sans ça une
            # photo prise à la verticale ressortirait couchée.
            img = ImageOps.exif_transpose(img)
            # La transparence n'existe pas en JPEG : on aplatit sur du blanc
            # plutôt que de laisser Pillow échouer sur un PNG à canal alpha.
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
                flat = Image.new("RGB", img.size, (255, 255, 255))
                flat.paste(img, mask=img.split()[-1])
                img = flat
            elif img.mode != "RGB":
                img = img.convert("RGB")

            for quality in (85, 75, 65):
                out = _encode_jpeg(img, quality)
                if len(out) <= max_bytes:
                    return out

            # La qualité ne suffit pas : on réduit la définition par paliers.
            #
            # ⚠️ Des paliers de 20 % et non des moitiés. Diviser par deux faisait
            # passer d'« un peu trop lourd » à huit fois plus léger que
            # nécessaire : on perdait de la définition pour rien, alors que la
            # demande était justement de compresser SANS sacrifier le rendu.
            # Quelques itérations de plus coûtent des millisecondes ; une photo
            # inutilement floue reste floue.
            scale = 1.0
            for _ in range(12):
                scale *= 0.8
                work = img.resize(
                    (max(int(img.width * scale), 1), max(int(img.height * scale), 1)),
                    Image.LANCZOS,
                )
                out = _encode_jpeg(work, 80)
                if len(out) <= max_bytes:
                    return out
                if work.width <= 320 or work.height <= 320:
                    break
    except Exception as exc:  # noqa: BLE001 — une image illisible n'est pas une panne
        logger.info("Compression impossible : %s", exc)
        return None
    return None


async def compress_image(content: bytes, max_bytes: int) -> bytes | None:
    """Version non bloquante — le décodage et le ré-encodage sont lourds.

    Même patron que `reports/pdf.py` : du travail CPU ne doit jamais tenir la
    boucle asyncio, sinon une photo de 10 Mo fige toutes les autres requêtes.
    """
    return await asyncio.to_thread(_compress_image_sync, content, max_bytes)


def jpeg_filename(original: str) -> str:
    """Nom de fichier cohérent avec le contenu après conversion.

    Garder « IMG_4312.HEIC » sur un JPEG tromperait la personne qui télécharge
    le fichier, et certains systèmes refusent d'ouvrir l'extension annoncée.
    """
    stem = original.rsplit(".", 1)[0] if "." in original else original
    return f"{stem or 'photo'}.jpg"


# Les quatre formats qu'un navigateur affiche partout. Tout le reste —  HEIC et
# HEIF des iPhone, AVIF, TIFF, BMP — est converti : le HEIC était jusqu'ici
# accepté puis illisible hors Safari, et une photo « envoyée avec succès » qui
# s'affiche vide est pire qu'un refus franc.
_WEB_SAFE = {"image/jpeg", "image/png", "image/gif", "image/webp"}

PDF_TYPE = "application/pdf"


def _is_pdf(content: bytes) -> bool:
    return content[:5] == b"%PDF-"


def _is_animated(content: bytes) -> bool:
    """Une animation ne doit pas être aplatie en silence en une seule image."""
    try:
        with Image.open(io.BytesIO(content)) as img:
            return getattr(img, "n_frames", 1) > 1
    except Exception:  # noqa: BLE001
        return False


@dataclass(frozen=True)
class AcceptedMedia:
    """Ce qui sera réellement stocké, après identification et normalisation."""

    content: bytes
    content_type: str
    filename: str
    #: Vrai si le fichier a été ré-encodé (converti, allégé, ou les deux).
    transformed: bool


async def accept_upload(
    file: UploadFile,
    content: bytes,
    *,
    max_image_mb: int,
    max_video_mb: int,
    allow_video: bool,
    allow_pdf: bool = False,
    images_only: bool = False,
) -> AcceptedMedia:
    """Porte d'entrée unique de tous les téléversements de médias.

    Les trois modules (rapports, messagerie, blog) appliquaient chacun leur
    variante de la même règle, sur le MIME DÉCLARÉ. Une seule implémentation,
    qui lit les octets, supprime à la fois les refus injustifiés et le risque
    que les trois divergent.

    Un dépassement de taille n'est plus un refus pour une IMAGE : elle est
    recompressée. Pour une vidéo, il reste un refus — la transcoder exigerait
    ffmpeg, cf. la section « Téléversement de médias » de claude.md.
    """
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.common.empty_file"),
        )

    filename = file.filename or "fichier"
    found = sniff(content)

    if allow_pdf and _is_pdf(content):
        if len(content) > max_image_mb * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=t("errors.media.pdf_too_large", max_mb=max_image_mb),
            )
        return AcceptedMedia(content, PDF_TYPE, filename, transformed=False)

    if found.is_video:
        if not allow_video or images_only:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("errors.media.video_not_allowed"),
            )
        if len(content) > max_video_mb * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=t("errors.media.video_too_large", max_mb=max_video_mb),
            )
        return AcceptedMedia(content, found.content_type or "video/mp4", filename,
                             transformed=False)

    if not found.is_image:
        # Le type RÉEL est dit à l'utilisateur, pas celui que son navigateur a
        # annoncé : c'est la seule information qui l'aide à comprendre.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.media.not_media"),
        )

    max_image_bytes = max_image_mb * 1024 * 1024
    needs_convert = found.content_type not in _WEB_SAFE
    too_heavy = len(content) > max_image_bytes

    if needs_convert and found.content_type in ("image/heic", "image/heif") and not HEIF_SUPPORTED:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.media.heic_unsupported"),
        )

    if not needs_convert and not too_heavy:
        return AcceptedMedia(content, found.content_type or "image/jpeg", filename,
                             transformed=False)

    # Une animation aplatie en JPEG perdrait tout mouvement sans que personne
    # ne le demande : on refuse plutôt que de livrer une image fixe à sa place.
    if _is_animated(content):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=t("errors.media.animated_too_large", max_mb=max_image_mb),
        )

    compressed = await compress_image(content, max_image_bytes)
    if compressed is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.media.unreadable_image"),
        )
    return AcceptedMedia(compressed, "image/jpeg", jpeg_filename(filename), transformed=True)
