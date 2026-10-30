"""E2E photo de profil d'un enfant.

Demandée par un établissement : reconnaître un enfant d'un coup d'œil dans les
listes, les présences et le trombinoscope d'une section, au lieu de lire un nom.

⚠️ Le cœur du fichier est la règle d'ACCÈS, qui ne ressemble à aucune autre du
projet : l'admin, un parent de l'enfant depuis son compte, l'éducatrice qui
mène son groupe, et tout staff porteur de `children:write`. C'est plus large
que la seule permission — un parent n'a aucune permission RBAC — sans être
plus étroit qu'elle.

⚠️ Ce dernier acteur MANQUAIT, et le test ne pouvait pas le voir : il
n'exerçait que l'éducatrice hors de son groupe, qui ne porte aucune
permission sur les enfants. Il concluait « le lien à l'enfant fait foi, pas la
permission » — vrai pour les cas qu'il montait, faux pour celui qu'un
établissement a signalé : une assistante de direction à qui les fiches avaient
été confiées voyait le bouton et récoltait un 403.
"""
import io

from PIL import Image

from tests.e2e.test_media_uploads import _image
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

PHOTO = _image("JPEG", size=(1200, 1600))


def _monde(c):
    """Un établissement, deux enfants, une éducatrice qui n'en mène qu'un, et
    un parent qui n'en a qu'un."""
    adm = onboard(c, login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD), "PHOT", "admin.phot@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"}, headers=adm).json()

    def enfant(prenom):
        return c.post("/children", json={
            "last_name": "Kodjo", "first_names": prenom, "birth_date": "2022-04-04",
            "admission_date": "2026-09-01", "residence_address": "Lomé",
            "department_id": dep["id"], "section_id": sec["id"], "guardians": []},
            headers=adm).json()

    a, b = enfant("Awa"), enfant("Bruno")

    educ = c.post("/staff", json={
        "first_name": "Vic", "last_name": "T", "nickname": "Tata Vic",
        "email": "educ.phot@a.fr", "password": "Staff#2026",
        "staff_type": "educateur", "phone": "90000001"}, headers=adm)
    ck("éducatrice créée", educ.status_code, 201)
    groupe = c.post("/groups", json={"section_id": sec["id"],
                    "educatrice_id": educ.json()["id"], "child_ids": [a["id"]]}, headers=adm)
    ck("groupe créé avec Awa seule", groupe.status_code, 201)

    # Une ASSISTANTE DE DIRECTION : les fiches enfants lui sont confiées, elle
    # ne mène aucun groupe. C'est le cas signalé.
    assist = c.post("/staff", json={
        "first_name": "Ada", "last_name": "D", "nickname": "Tata Ada",
        "email": "assist.phot@a.fr", "password": "Staff#2026",
        "staff_type": "administrateur", "phone": "90000003"}, headers=adm)
    ck("assistante créée", assist.status_code, 201)
    role = c.post("/rbac/roles", json={
        "name": "Assistante de direction",
        "permissions": ["children:read", "children:write"]}, headers=adm).json()
    ck("rôle attribué", c.post(
        f"/rbac/staff/{assist.json()['id']}/roles/{role['id']}",
        headers=adm).status_code, 200)

    parent = c.post("/parents", json={
        "first_name": "Ama", "last_name": "Kodjo", "nickname": "Maman Ama",
        "phone": "90000002", "email": "parent.phot@a.fr", "password": "Parent#2026",
        "child_ids": [a["id"]]}, headers=adm)
    ck("parent créé pour Awa seule", parent.status_code, 201)

    return {
        "adm": adm,
        "educ": login(c, "educ.phot@a.fr", "Staff#2026"),
        "assist": login(c, "assist.phot@a.fr", "Staff#2026"),
        "parent": login(c, "parent.phot@a.fr", "Parent#2026"),
        "awa": a["id"], "bruno": b["id"],
    }


def _pose(c, child_id, headers):
    return c.put(f"/children/{child_id}/photo",
                 files={"file": ("photo.jpg", PHOTO, "image/jpeg")}, headers=headers)


def test_the_three_actors_can_set_the_photo(client):
    c = client
    m = _monde(c)
    for qui in ("adm", "parent", "educ"):
        r = _pose(c, m["awa"], m[qui])
        ck(f"{qui} dépose la photo", r.status_code, 200)
        ck(f"{qui} — la fiche l'annonce", r.json()["has_photo"], True)


def test_a_children_write_holder_can_without_leading_any_group(client):
    """Le cas signalé : une assistante de direction, sans aucun groupe.

    Elle modifie déjà le nom de l'enfant, sa date de naissance, son adresse et
    ses NOTES MÉDICALES avec `children:write`. Lui refuser la photo ne
    protégeait rien — ça rendait seulement inutilisable une permission dont le
    libellé dit « créer et modifier les fiches enfants ».

    Prouvé par sabotage : la branche `children:write` retirée, le 403 d'origine
    reparaît sur les deux enfants.
    """
    c = client
    m = _monde(c)
    for enfant in ("awa", "bruno"):
        r = _pose(c, m[enfant], m["assist"])
        ck(f"assistante dépose la photo de {enfant}", r.status_code, 200)
        ck(f"  la fiche de {enfant} l'annonce", r.json()["has_photo"], True)
    ck("et elle peut la retirer",
       c.delete(f"/children/{m['awa']}/photo", headers=m["assist"]).status_code, 204)


def test_nobody_else_can(client):
    """Ni permission sur les enfants, ni lien avec lui : rien."""
    c = client
    m = _monde(c)

    # L'éducatrice ne mène PAS le groupe de Bruno.
    r = _pose(c, m["bruno"], m["educ"])
    ck("éducatrice sur un enfant hors de son groupe", r.status_code, 403)

    # Le parent n'est pas rattaché à Bruno.
    r = _pose(c, m["bruno"], m["parent"])
    ck("parent sur un enfant qui n'est pas le sien", r.status_code, 403)

    # Le superadmin gère le SaaS, pas les enfants.
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    r = _pose(c, m["awa"], su)
    ck("superadmin exclu", r.status_code in (403, 404), True)


def test_photo_is_served_and_thumbnailed(client):
    c = client
    m = _monde(c)
    _pose(c, m["awa"], m["adm"])

    plein = c.get(f"/children/{m['awa']}/photo", headers=m["parent"])
    vignette = c.get(f"/children/{m['awa']}/photo?thumb=true", headers=m["parent"])
    ck("parent voit la photo", plein.status_code, 200)
    ck("vignette servie", vignette.status_code, 200)
    ck("nettement plus légère", len(vignette.content) * 5 <= len(plein.content), True)
    with Image.open(io.BytesIO(vignette.content)) as img:
        ck("côté long borné", max(img.size) <= 480, True)


def test_a_child_without_photo_is_a_404_not_an_error(client):
    c = client
    m = _monde(c)
    r = c.get(f"/children/{m['bruno']}/photo", headers=m["adm"])
    ck("pas de photo → 404", r.status_code, 404)


def test_replacing_keeps_a_single_photo(client):
    """Deux dépôts successifs laissent UNE photo, la dernière."""
    c = client
    m = _monde(c)
    _pose(c, m["awa"], m["adm"])
    un = c.get(f"/children/{m['awa']}/photo", headers=m["adm"]).content

    autre = _image("JPEG", size=(900, 900))
    r = c.put(f"/children/{m['awa']}/photo",
              files={"file": ("autre.jpg", autre, "image/jpeg")}, headers=m["adm"])
    ck("remplacement accepté", r.status_code, 200)
    deux = c.get(f"/children/{m['awa']}/photo", headers=m["adm"]).content
    ck("c'est bien la nouvelle", un != deux, True)


def test_removing_is_idempotent(client):
    c = client
    m = _monde(c)
    _pose(c, m["awa"], m["adm"])
    ck("retrait", c.delete(f"/children/{m['awa']}/photo", headers=m["adm"]).status_code, 204)
    ck("retrait d'une photo absente", c.delete(f"/children/{m['awa']}/photo", headers=m["adm"]).status_code, 204)
    ck("la fiche ne l'annonce plus",
       c.get(f"/children/{m['awa']}", headers=m["adm"]).json()["has_photo"], False)


def test_a_document_is_not_a_photo(client):
    """La photo de profil est une IMAGE — un PDF n'en est pas une.

    Le dossier d'inscription accepte le PDF ; ce chemin-ci non, sinon une fiche
    afficherait un avatar que rien ne sait dessiner.
    """
    c = client
    m = _monde(c)
    r = c.put(f"/children/{m['awa']}/photo",
              files={"file": ("doc.pdf", b"%PDF-1.4\n" + b"0" * 400, "application/pdf")},
              headers=m["adm"])
    ck("PDF refusé", r.status_code, 422)
