"""E2E téléversement de médias — rapports, messagerie, blog et galerie.

Deux signalements de l'établissement tiennent ce fichier :

  1. « Certains formats passent, d'autres non. » Ce n'était pas le format : la
     validation croyait le MIME DÉCLARÉ par le navigateur. La même photo
     passait depuis un appareil et était refusée depuis un autre, selon que le
     navigateur savait ou non nommer son type. Un `.heic` d'iPhone, un fichier
     repris d'un gestionnaire de fichiers ou re-partagé depuis une messagerie
     arrive souvent en `application/octet-stream`, voire sans type du tout.

  2. « Un fichier trop lourd ne doit plus être un souci. » Les images sont
     désormais recompressées au lieu d'être rejetées.

Le contrôle porte sur le CONTENU, donc les trois modules partagent une seule
porte (`app/core/media.py`) — et ce fichier vérifie que les trois l'utilisent
vraiment, car c'est exactement là qu'ils avaient divergé.
"""
import io

import pytest
from PIL import Image

from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

CONTENT = {
    "health_status": "bien",
    "breakfast": "bien_mange", "lunch": "bien_mange", "snack": "bien_mange",
    "nap": False, "bath": True, "poop": True,
    "moods": ["joyeux"], "activities": ["Peinture"], "behaviors": ["pleasant_day"],
}


def _image(fmt: str, size=(640, 480)) -> bytes:
    """Une image avec du bruit : une image unie se compresse à quelques octets
    et ne prouverait rien du comportement réel."""
    import random

    random.seed(7)
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(0, size[1], 2):
        for x in range(0, size[0], 2):
            px[x, y] = (random.randint(0, 255),) * 3
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


JPEG = _image("JPEG")
# En-tête MP4 réel : la signature `ftyp` suffit à l'identification du conteneur.
MP4 = b"\x00\x00\x00\x20ftypisom" + b"\x00" * 256


def _report_setup(c, adm):
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    c.post(f"/reports/settings/departments/{dep['id']}/types/quotidien", headers=adm)
    child = c.post("/children", json={"last_name": "Dossou", "first_names": "Jeremy",
                   "birth_date": "2022-05-05", "admission_date": "2026-09-01",
                   "residence_address": "Lomé", "department_id": dep["id"],
                   "section_id": sec["id"], "guardians": []}, headers=adm).json()
    return c.post("/reports", json={"child_id": child["id"], "report_type": "quotidien",
                  "reference_date": "2026-07-20", "content": CONTENT},
                  headers=adm).json()["id"]


@pytest.mark.parametrize("declared", [
    "image/jpeg",                # le navigateur sait nommer le type
    "application/octet-stream",  # gestionnaire de fichiers, re-partage
    "",                          # aucun type — fréquent sur .heic hors Apple
])
def test_same_photo_accepted_whatever_the_browser_declares(client, declared):
    """Le cœur du signalement : c'est la photo qui compte, pas l'annonce.

    Les trois cas sont rigoureusement le même JPEG. Avant, seul le premier
    passait — d'où « ça marche sur mon téléphone mais pas sur le sien ».
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    rid = _report_setup(c, adm)

    r = c.post(f"/reports/{rid}/attachments",
               files={"file": ("photo.jpg", JPEG, declared)}, headers=adm)
    ck(f"accepté avec « {declared or 'aucun type'} »", r.status_code, 201)
    # Le type STOCKÉ est le type réel : sans ça le navigateur du lecteur
    # proposerait de télécharger la photo au lieu de l'afficher.
    ck("  stocké comme une vraie image", r.json()["content_type"], "image/jpeg")


def test_oversized_photo_is_compressed_not_refused(client, monkeypatch):
    """Une photo trop lourde est allégée — c'est la demande explicite.

    Le plafond est abaissé le temps du test plutôt que de fabriquer un fichier
    de 50 Mo : ce qu'on vérifie est la DÉCISION (compresser au lieu de
    refuser), pas le seuil lui-même.
    """
    from app.core.config import settings

    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    rid = _report_setup(c, adm)

    big = _image("PNG", (2400, 1800))
    monkeypatch.setattr(settings, "reports_max_attachment_mb", 1)
    ck("l'image dépasse bien le plafond posé", len(big) > 1024 * 1024, True)

    r = c.post(f"/reports/{rid}/attachments",
               files={"file": ("grande.png", big, "image/png")}, headers=adm)
    ck("acceptée malgré le dépassement", r.status_code, 201)
    ck("  convertie en JPEG", r.json()["content_type"], "image/jpeg")
    ck("  nom cohérent avec le contenu", r.json()["filename"], "grande.jpg")
    ck("  ramenée sous le plafond", r.json()["size_bytes"] <= 1024 * 1024, True)


def test_video_refused_above_the_cap_with_a_usable_reason(client, monkeypatch):
    """⚠️ La vidéo n'est PAS transcodée : le refus reste, mais il explique.

    Transcoder exigerait ffmpeg sur le serveur. Tant que ce n'est pas le cas,
    le message doit dire pourquoi les photos passent et pas les vidéos —
    sinon l'utilisateur conclut, comme la première fois, que « ça marche pour
    certains fichiers seulement ».
    """
    from app.core.config import settings

    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    rid = _report_setup(c, adm)

    monkeypatch.setattr(settings, "reports_max_attachment_mb", 0)
    r = c.post(f"/reports/{rid}/attachments",
               files={"file": ("film.mp4", MP4, "video/mp4")}, headers=adm)
    ck("refusée", r.status_code, 413)
    ck("  et le message distingue photo et vidéo",
       "vidéo" in r.json()["detail"].lower(), True)


def test_disguised_files_are_caught_by_their_content(client):
    """Lire les octets a un second effet : ce qui MENT ne passe plus.

    Un SVG annoncé `image/png` passait la validation précédente — et le SVG
    est refusé partout précisément parce qu'il peut porter du script.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    rid = _report_setup(c, adm)

    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    r = c.post(f"/reports/{rid}/attachments",
               files={"file": ("photo.png", svg, "image/png")}, headers=adm)
    ck("SVG déguisé en PNG → refusé", r.status_code, 422)

    exe = b"MZ\x90\x00" + b"\x00" * 256
    r = c.post(f"/reports/{rid}/attachments",
               files={"file": ("photo.jpg", exe, "image/jpeg")}, headers=adm)
    ck("exécutable déguisé en JPEG → refusé", r.status_code, 422)


def test_blog_and_gallery_share_the_same_gate(client):
    """Le blog et la galerie avaient leur propre copie de la règle.

    Une seule porte, donc : si l'un des trois modules s'en écartait, c'est ici
    que ça se verrait.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    tag = c.post("/blog/tags", json={"name": "Événement"}, headers=adm).json()
    art = c.post("/blog/articles", json={"title": "Kermesse",
                 "content": "Les enfants ont chanté.", "tag_id": tag["id"]},
                 headers=adm).json()

    r = c.post(f"/blog/articles/{art['id']}/cover",
               files={"file": ("cover.jpg", JPEG, "application/octet-stream")}, headers=adm)
    ck("image à la une sans MIME déclaré → acceptée", r.status_code, 200)

    r = c.post(f"/blog/articles/{art['id']}/attachments",
               files={"file": ("photo.jpg", JPEG, "")}, headers=adm)
    ck("média d'article sans MIME → accepté", r.status_code, 201)
    ck("  typé correctement", r.json()["content_type"], "image/jpeg")

    cat = c.post("/blog/gallery/categories", json={"name": "Sorties"}, headers=adm).json()
    r = c.post("/blog/gallery", data={"category_id": cat["id"]},
               files={"file": ("photo.jpg", JPEG, "application/octet-stream")}, headers=adm)
    ck("photo de galerie sans MIME → acceptée", r.status_code, 201)

    # La galerie du site vitrine n'accepte toujours pas la vidéo.
    r = c.post("/blog/gallery", data={"category_id": cat["id"]},
               files={"file": ("film.mp4", MP4, "video/mp4")}, headers=adm)
    ck("vidéo en galerie → refusée", r.status_code, 422)


def test_messaging_stores_the_real_type(client):
    """La messagerie enregistrait `application/octet-stream` tel quel.

    La pièce jointe partait alors au destinataire avec ce type : son navigateur
    proposait de la télécharger au lieu de l'afficher dans le fil.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    ann = c.post("/messaging/announcements",
                 json={"title": "Sortie", "body": "Lundi 8 h."}, headers=adm).json()
    r = c.post(f"/messaging/announcements/{ann['id']}/attachments",
               files={"file": ("photo.jpg", JPEG, "application/octet-stream")}, headers=adm)
    ck("acceptée", r.status_code, 201)
    ck("  et typée image, pas flux d'octets", r.json()["content_type"], "image/jpeg")
