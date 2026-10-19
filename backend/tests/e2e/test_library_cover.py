"""E2E couverture d'un livre — et surtout : QUI la voit.

⚠️ Ce qui mérite d'être verrouillé ici n'est pas le téléversement, qui suit le
patron commun (`app/core/media.py`), mais la PORTÉE de la lecture. Trois écrans
affichent le même catalogue par trois portes différentes — la gestion
(`library:read`), le portail du parent (`/mine/books`) et celui de l'éducatrice
(`/educator/books`), ces deux derniers étant hors RBAC. Une couverture gardée
derrière `library:read` se serait donc affichée côté gestion et aurait laissé
dans les deux portails une grille de cases vides, sans un mot d'explication :
exactement la forme du défaut que l'annuaire a dû refermer ailleurs.

L'autre moitié tient en une ligne : écrire reste `library:write`, comme le
reste du catalogue.
"""
import io

from PIL import Image

from app.core import media, storage
from tests.e2e.test_media_uploads import _image
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

PDF = b"%PDF-1.4\n" + b"\x00" * 256


def _cover() -> bytes:
    """Une couverture de taille réaliste : le rapport de poids EST la raison
    d'être de la vignette, et une image unie ne prouverait rien."""
    return _image("JPEG", size=(1600, 2400))


def _staff(c, adm, email, staff_type="secretaire", permissions=None):
    c.post("/staff", json={
        "first_name": "S", "last_name": email.split("@")[0], "nickname": "S",
        "phone": "+229", "email": email, "password": "Staff2026",
        "staff_type": staff_type,
    }, headers=adm)
    h = login(c, email, "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h)
    headers = login(c, email, "StaffNew2026")
    staff_id = c.get(f"/staff?search={email}", headers=adm).json()["items"][0]["id"]
    if permissions:
        role = c.post("/rbac/roles", json={"name": f"Rôle {email}",
                      "permissions": permissions}, headers=adm).json()
        c.post(f"/rbac/staff/{staff_id}/roles/{role['id']}", headers=adm)
    return headers, staff_id


def _child(c, adm, dep_id, sec_id, name="Emma"):
    return c.post("/children", json={
        "last_name": "Alpha", "first_names": name, "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep_id, "section_id": sec_id, "guardians": [],
    }, headers=adm).json()


def _parent(c, adm, child_id, email):
    c.post("/parents", json={
        "first_name": "A", "last_name": "K", "nickname": "Maman A",
        "phone": "+229 97", "email": email, "password": "Parent2026",
        "child_ids": [child_id],
    }, headers=adm)
    h = login(c, email, "Parent2026")
    c.post("/auth/password-change", json={"current_password": "Parent2026",
           "new_password": "ParentNew2026"}, headers=h)
    return login(c, email, "ParentNew2026")


def _storage_key(book_id: str) -> str | None:
    """Clé de stockage de la couverture, lue directement en base.

    ⚠️ Un moteur JETABLE, créé et refermé dans le même `asyncio.run` : une
    connexion asyncpg appartient à la boucle qui l'a ouverte, et le projet s'en
    tient à cette discipline partout (tâches Celery, `conftest.py`).
    """
    import asyncio

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import settings

    async def _run() -> str | None:
        connect_args = {}
        if settings.db_schema:
            connect_args = {"server_settings": {
                "search_path": f"{settings.db_schema},public"}}
        engine = create_async_engine(settings.database_url, connect_args=connect_args)
        try:
            async with engine.connect() as conn:
                result = await conn.execute(
                    text("select cover_storage_key from books where id = :i"),
                    {"i": book_id},
                )
                return result.scalar()
        finally:
            await engine.dispose()

    return asyncio.run(_run())


def _setup(c):
    adm = onboard(c, login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD),
                  "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec1 = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                  headers=adm).json()
    sec2 = c.post("/sections", json={"department_id": dep["id"], "name": "MS"},
                  headers=adm).json()
    book = c.post("/library/books", json={
        "title": "Le Petit Prince", "author": "Saint-Exupéry",
        "total_quantity": 2, "section_ids": [sec1["id"]],
    }, headers=adm).json()
    return adm, dep, sec1, sec2, book


def test_book_cover_round_trip(client):
    c = client
    adm, dep, sec1, sec2, book = _setup(c)

    ck("Un livre neuf n'a pas de couverture", book["has_cover"], False)
    ck("  et la demander → 404", c.get(
       f"/library/books/{book['id']}/cover", headers=adm).status_code, 404)

    r = c.put(f"/library/books/{book['id']}/cover",
              files={"file": ("cover.jpg", _cover(), "image/jpeg")}, headers=adm)
    ck("Dépôt de la couverture → 200", r.status_code, 200)
    ck("  has_cover passe à vrai", r.json()["has_cover"], True)
    ck("  et la liste le dit aussi", c.get(
       "/library/books", headers=adm).json()["items"][0]["has_cover"], True)

    plein = c.get(f"/library/books/{book['id']}/cover", headers=adm)
    ck("Original servi", plein.status_code, 200)
    ck("  en JPEG", plein.headers["content-type"], "image/jpeg")
    ck("  jamais en cache public (contenu authentifié)",
       plein.headers["cache-control"].startswith("private"), True)

    vignette = c.get(f"/library/books/{book['id']}/cover?thumb=true", headers=adm)
    ck("Vignette servie", vignette.status_code, 200)
    ck("  en JPEG", vignette.headers["content-type"], media.THUMBNAIL_TYPE)
    # Le RAPPORT de poids est tout l'intérêt : une grille de catalogue affiche
    # des cases de quelques dizaines de pixels, pas des couvertures en 1600 px.
    ck("  au moins 5x plus légère que l'original",
       len(vignette.content) * 5 <= len(plein.content), True)
    with Image.open(io.BytesIO(vignette.content)) as img:
        ck("  et reste une image utilisable", max(img.size) <= 480, True)

    # ── Remplacement : l'ancien fichier QUITTE le stockage ──
    #
    # La clé de stockage est lue EN BASE, pas déduite de la réponse : elle n'y
    # est volontairement pas exposée (l'écran n'a que `has_cover`), et c'est
    # bien le fichier sur le disque qu'il s'agit de vérifier.
    avant = _storage_key(book["id"])
    ck("  une clé de stockage est posée", bool(avant), True)

    c.put(f"/library/books/{book['id']}/cover",
          files={"file": ("autre.jpg", _image("JPEG", size=(800, 1200)), "image/jpeg")},
          headers=adm)
    apres = _storage_key(book["id"])
    ck("Remplacement : nouvelle clé de stockage", apres != avant, True)
    ck("  l'ancien fichier a quitté le disque",
       storage.resolve_path(avant).exists(), False)
    ck("  le nouveau est là", storage.resolve_path(apres).exists(), True)

    # ── Retrait, idempotent ──
    ck("Retrait → 204", c.delete(
       f"/library/books/{book['id']}/cover", headers=adm).status_code, 204)
    ck("  has_cover repasse à faux", c.get(
       f"/library/books/{book['id']}", headers=adm).json()["has_cover"], False)
    ck("  le fichier a quitté le disque",
       storage.resolve_path(apres).exists(), False)
    ck("Retrait d'une couverture absente → 204 quand même (idempotent)", c.delete(
       f"/library/books/{book['id']}/cover", headers=adm).status_code, 204)

    # ── Ce qui n'est pas une image ──
    ck("Un PDF n'illustre pas une couverture → 422", c.put(
       f"/library/books/{book['id']}/cover",
       files={"file": ("doc.pdf", PDF, "application/pdf")},
       headers=adm).status_code, 422)
    ck("  et le livre n'a toujours pas de couverture", c.get(
       f"/library/books/{book['id']}", headers=adm).json()["has_cover"], False)


def test_cover_is_visible_from_the_three_catalogue_screens(client):
    """Le cœur du changement : la gestion, le parent et l'éducatrice voient la
    même couverture par trois portes différentes — et personne d'autre."""
    c = client
    adm, dep, sec1, sec2, book = _setup(c)
    c.put(f"/library/books/{book['id']}/cover",
          files={"file": ("cover.jpg", _cover(), "image/jpeg")}, headers=adm)
    url = f"/library/books/{book['id']}/cover?thumb=true"

    ck("Admin : 200", c.get(url, headers=adm).status_code, 200)

    reader, _ = _staff(c, adm, "reader@a.fr", permissions=["library:read"])
    ck("Gestion (library:read) : 200", c.get(url, headers=reader).status_code, 200)
    lender, _ = _staff(c, adm, "lender@a.fr", permissions=["library:lend"])
    ck("Prêts (library:lend) : 200 — même grille à l'écran",
       c.get(url, headers=lender).status_code, 200)

    # Éducatrice de la section du livre : hors RBAC, par son groupe.
    educ, educ_id = _staff(c, adm, "educ@a.fr", staff_type="educateur")
    c.post("/groups", json={"section_id": sec1["id"], "educatrice_id": educ_id},
           headers=adm)
    ck("Éducatrice de la section : 200", c.get(url, headers=educ).status_code, 200)

    # Éducatrice d'une AUTRE section : le livre n'est pas dans son périmètre.
    autre, autre_id = _staff(c, adm, "autre@a.fr", staff_type="educateur")
    c.post("/groups", json={"section_id": sec2["id"], "educatrice_id": autre_id},
           headers=adm)
    ck("Éducatrice d'une autre section : 404", c.get(url, headers=autre).status_code, 404)

    # Parent d'un enfant de la section : hors RBAC, par ses enfants.
    enfant = _child(c, adm, dep["id"], sec1["id"])
    par = _parent(c, adm, enfant["id"], "parent@a.fr")
    ck("Parent d'un enfant de la section : 200", c.get(url, headers=par).status_code, 200)

    ailleurs = _child(c, adm, dep["id"], sec2["id"], name="Noa")
    par2 = _parent(c, adm, ailleurs["id"], "parent2@a.fr")
    ck("Parent d'un enfant d'une autre section : 404",
       c.get(url, headers=par2).status_code, 404)

    # Staff sans permission bibliothèque ET sans groupe : rien.
    nu, _ = _staff(c, adm, "nu@a.fr")
    ck("Staff sans droit ni groupe : 404", c.get(url, headers=nu).status_code, 404)

    # Un livre désactivé disparaît des portails, couverture comprise — mais
    # reste visible côté gestion, où `include_inactive` l'affiche.
    c.patch(f"/library/books/{book['id']}", json={"is_active": False}, headers=adm)
    ck("Livre désactivé : le parent ne voit plus la couverture",
       c.get(url, headers=par).status_code, 404)
    ck("  l'éducatrice non plus", c.get(url, headers=educ).status_code, 404)
    ck("  la gestion, oui", c.get(url, headers=reader).status_code, 200)


def test_cover_isolation_and_write_permission(client):
    c = client
    adm, dep, sec1, sec2, book = _setup(c)
    c.put(f"/library/books/{book['id']}/cover",
          files={"file": ("cover.jpg", _cover(), "image/jpeg")}, headers=adm)

    # ── Écriture : library:write, comme le reste du catalogue ──
    reader, _ = _staff(c, adm, "reader@a.fr", permissions=["library:read"])
    ck("library:read ne dépose pas de couverture → 403", c.put(
       f"/library/books/{book['id']}/cover",
       files={"file": ("x.jpg", _cover(), "image/jpeg")},
       headers=reader).status_code, 403)
    ck("library:read ne la retire pas non plus → 403", c.delete(
       f"/library/books/{book['id']}/cover", headers=reader).status_code, 403)
    writer, _ = _staff(c, adm, "writer@a.fr", permissions=["library:write"])
    ck("library:write dépose → 200", c.put(
       f"/library/books/{book['id']}/cover",
       files={"file": ("x.jpg", _cover(), "image/jpeg")},
       headers=writer).status_code, 200)

    # ── Isolation établissement : 404, jamais 403 ──
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm2 = onboard(c, su, "AUTRE", "admin@b.fr")
    ck("Couverture d'un livre d'un autre établissement : 404", c.get(
       f"/library/books/{book['id']}/cover", headers=adm2).status_code, 404)
    ck("  ni déposable", c.put(
       f"/library/books/{book['id']}/cover",
       files={"file": ("x.jpg", _cover(), "image/jpeg")},
       headers=adm2).status_code, 404)

    # ── Superadmin exclu, comme partout (minimisation RGPD) ──
    ck("Superadmin : 404", c.get(
       f"/library/books/{book['id']}/cover", headers=su).status_code, 404)


def test_lendings_list_carries_the_cover_and_a_borrowed_book_stays_visible(client):
    """La liste des prêts montre les mêmes livres : elle porte le même drapeau.

    ⚠️ Et elle OUVRE un trou que le catalogue n'avait pas : un livre emprunté
    peut avoir quitté le périmètre du parent — désactivé, ou l'enfant a changé
    de section — alors que sa ligne reste dans « Mes emprunts ». Sans la branche
    « a-t-il emprunté ce livre », l'écran annoncerait une couverture que le
    serveur refuserait.
    """
    c = client
    adm, dep, sec1, sec2, book = _setup(c)
    c.put(f"/library/books/{book['id']}/cover",
          files={"file": ("cover.jpg", _cover(), "image/jpeg")}, headers=adm)

    enfant = _child(c, adm, dep["id"], sec1["id"])
    par = _parent(c, adm, enfant["id"], "parent@qacov.fr")
    pret = c.post("/library/lendings", json={
        "book_id": book["id"], "child_id": enfant["id"]}, headers=adm)
    ck("Prêt créé", pret.status_code, 201)
    ck("La réponse du prêt porte le drapeau", pret.json()["book_has_cover"], True)

    gestion = c.get("/library/lendings", headers=adm).json()["items"][0]
    ck("Liste de gestion : drapeau présent", gestion["book_has_cover"], True)
    mine = c.get("/library/mine/lendings", headers=par).json()["items"][0]
    ck("Liste du parent : drapeau présent", mine["book_has_cover"], True)

    url = f"/library/books/{book['id']}/cover?thumb=true"
    ck("Parent : couverture visible", c.get(url, headers=par).status_code, 200)

    # ── Le livre quitte le périmètre, le prêt reste ──
    c.post(f"/library/lendings/{pret.json()['id']}/return", headers=adm)
    c.patch(f"/library/books/{book['id']}", json={"is_active": False}, headers=adm)
    ck("Livre désactivé : le prêt reste dans « Mes emprunts »", c.get(
       "/library/mine/lendings", headers=par).json()["total"], 1)
    ck("  et sa couverture reste visible du parent qui l'a emprunté",
       c.get(url, headers=par).status_code, 200)

    # Un parent qui n'a JAMAIS emprunté ce livre, lui, ne voit rien.
    ailleurs = _child(c, adm, dep["id"], sec2["id"], name="Noa")
    par2 = _parent(c, adm, ailleurs["id"], "parent2@qacov.fr")
    ck("Un parent qui n'a pas emprunté ce livre : 404",
       c.get(url, headers=par2).status_code, 404)
