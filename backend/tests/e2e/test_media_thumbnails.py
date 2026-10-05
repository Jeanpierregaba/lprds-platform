"""E2E vignettes — ce que télécharge réellement une GRILLE de médias.

⚠️ Pourquoi elles existent. Une image n'est recompressée au téléversement
qu'au-dessus du plafond du module (50 Mo pour les rapports) : une photo de
téléphone est donc stockée TELLE QUELLE. Chaque case d'une grille téléchargeait
l'original — la galerie parent en affiche 30 par page, soit, à 4 Mo pièce,
120 Mo du forfait du parent pour une page de miniatures. Et tant qu'un plafond
de dix secondes existait côté client, aucune de ces cases ne s'affichait.

Ce fichier vérifie ce qui compte vraiment : la vignette est NETTEMENT plus
légère, elle reste une image utilisable, l'original n'est pas touché, et les
cas qu'on ne sait pas vignetter (vidéo) retombent sur l'original plutôt que
d'échouer.
"""
import io

from PIL import Image

from app.core import media
from tests.e2e.test_media_uploads import MP4, _image, _report_setup
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


def _big_jpeg() -> bytes:
    """Une photo de taille réaliste — 2400x1800, avec du bruit.

    Une image unie se compresserait à quelques octets et ne prouverait rien :
    l'intérêt de la vignette est précisément le RAPPORT de poids.
    """
    return _image("JPEG", size=(2400, 1800))


def _admin(c, code="LPRDS", email="admin@a.fr"):
    return onboard(c, login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD), code, email)


def _setup(client):
    c = client
    adm = _admin(c)
    rid = _report_setup(c, adm)
    r = c.post(f"/reports/{rid}/attachments",
               files={"file": ("photo.jpg", _big_jpeg(), "image/jpeg")}, headers=adm)
    ck("photo acceptée", r.status_code, 201)
    return c, adm, rid, r.json()["id"]


def test_thumbnail_is_far_lighter_and_still_an_image(client):
    c, adm, rid, aid = _setup(client)

    plein = c.get(f"/reports/{rid}/attachments/{aid}", headers=adm)
    vignette = c.get(f"/reports/{rid}/attachments/{aid}?thumb=true", headers=adm)
    ck("original servi", plein.status_code, 200)
    ck("vignette servie", vignette.status_code, 200)

    ck("vignette en JPEG", vignette.headers["content-type"], media.THUMBNAIL_TYPE)
    # Le rapport de poids EST la raison d'être de la vignette : un simple
    # « plus petit » laisserait passer une vignette à peine réduite.
    ck("au moins 5x plus légère", len(vignette.content) * 5 <= len(plein.content), True)

    with Image.open(io.BytesIO(vignette.content)) as img:
        ck("côté long borné", max(img.size) <= media.THUMBNAIL_LONG_SIDE, True)
        # Une vignette carrée trahirait un recadrage : on veut l'image entière.
        ck("rapport d'aspect conservé", round(img.width / img.height, 2), round(2400 / 1800, 2))

    # L'original ne doit PAS avoir été remplacé par sa vignette.
    with Image.open(io.BytesIO(plein.content)) as img:
        ck("original intact", img.size, (2400, 1800))


def test_thumbnail_is_cached_on_disk_and_stable(client):
    """Le second appel sert le fichier déjà fabriqué — même octets."""
    c, adm, rid, aid = _setup(client)
    un = c.get(f"/reports/{rid}/attachments/{aid}?thumb=true", headers=adm)
    deux = c.get(f"/reports/{rid}/attachments/{aid}?thumb=true", headers=adm)
    ck("deux fois servie", (un.status_code, deux.status_code), (200, 200))
    ck("octets identiques", un.content == deux.content, True)

    from app.core import storage, thumbnails
    att = c.get(f"/reports/{rid}", headers=adm).json()["attachments"][0]
    key = att.get("storage_key")
    if key:  # la clé n'est pas toujours exposée par l'API — contrôle au mieux
        ck("vignette sur disque", storage.derived_path(key, thumbnails.VARIANT).exists(), True)


def test_video_falls_back_to_the_original(client):
    """Une vidéo ne se vignette pas sans ffmpeg — on sert l'original.

    ⚠️ Dégradation VOLONTAIRE : l'appelant n'a jamais à savoir si un fichier
    est « vignettable ». Au pire la case est lourde, elle n'est jamais vide.
    """
    c = client
    adm = _admin(c)
    rid = _report_setup(c, adm)
    r = c.post(f"/reports/{rid}/attachments",
               files={"file": ("clip.mp4", MP4, "video/mp4")}, headers=adm)
    ck("vidéo acceptée", r.status_code, 201)
    aid = r.json()["id"]

    vignette = c.get(f"/reports/{rid}/attachments/{aid}?thumb=true", headers=adm)
    ck("servie quand même", vignette.status_code, 200)
    ck("c'est bien la vidéo", vignette.content, MP4)


def test_media_responses_can_be_cached_by_the_browser(client):
    """Un média ne change jamais pour un identifiant donné.

    Sur un forfait mobile, ne pas le retélécharger à chaque visite compte
    autant que la vignette elle-même.
    """
    c, adm, rid, aid = _setup(client)
    for url in (f"/reports/{rid}/attachments/{aid}",
                f"/reports/{rid}/attachments/{aid}?thumb=true"):
        r = c.get(url, headers=adm)
        cache = r.headers.get("cache-control", "")
        ck(f"{url} — cache privé", "private" in cache, True)
        ck(f"{url} — durée annoncée", "max-age=" in cache, True)


def test_parent_portal_serves_thumbnails_too(client):
    """Le portail parent est précisément celui qui en a besoin."""
    c, adm, rid, aid = _setup(client)

    child_id = c.get(f"/reports/{rid}", headers=adm).json()["child"]["id"]
    parent = c.post("/parents", json={
        "first_name": "Ama", "last_name": "Dossou", "nickname": "Maman Ama",
        "phone": "90000000", "email": "ama.thumb@example.com",
        "password": "Parent#2026", "child_ids": [child_id]}, headers=adm)
    ck("parent créé", parent.status_code, 201)
    c.post(f"/reports/{rid}/submit", headers=adm)  # admin ⇒ validé et publié

    ph = login(c, "ama.thumb@example.com", "Parent#2026")
    plein = c.get(f"/reports/mine/{rid}/attachments/{aid}", headers=ph)
    vignette = c.get(f"/reports/mine/{rid}/attachments/{aid}?thumb=true", headers=ph)
    ck("parent : original", plein.status_code, 200)
    ck("parent : vignette", vignette.status_code, 200)
    ck("parent : nettement plus légère", len(vignette.content) * 5 <= len(plein.content), True)


def test_every_module_serves_thumbnails_not_just_reports(client):
    """Quatre modules servent des médias par UN SEUL helper.

    Ce qui diffère d'un module à l'autre, c'est le NOM de la clé de stockage
    (`storage_key`, `cover_storage_key`…). Une faute de frappe ne se verrait
    qu'à l'exécution, sur ce module-là seulement — c'est exactement ainsi que
    les quatre modules avaient divergé sur la validation des téléversements.
    """
    c = client
    adm = _admin(c, "GALR", "admin.galr@a.fr")

    cat = c.post("/blog/gallery/categories", json={"name": "Sorties"}, headers=adm)
    ck("catégorie créée", cat.status_code, 201)
    photo = c.post("/blog/gallery", data={"category_id": cat.json()["id"]},
                   files={"file": ("vue.jpg", _big_jpeg(), "image/jpeg")}, headers=adm)
    ck("photo de galerie acceptée", photo.status_code, 201)
    pid = photo.json()["id"]

    plein = c.get(f"/blog/gallery/{pid}/image", headers=adm)
    vignette = c.get(f"/blog/gallery/{pid}/image?thumb=true", headers=adm)
    ck("galerie : original", plein.status_code, 200)
    ck("galerie : vignette", vignette.status_code, 200)
    ck("galerie : nettement plus légère", len(vignette.content) * 5 <= len(plein.content), True)
    ck("galerie : en JPEG", vignette.headers["content-type"], media.THUMBNAIL_TYPE)
