"""E2E bibliothèque : catalogue multi-sections, prêts/retours bornés par la
quantité, rappels (email best-effort + message dans la conversation admin↔parent),
paramètres admin-only, rôles socle bibliothécaire, consultation parent/éducatrice,
isolation établissement, soft-delete des livres."""
from datetime import date, timedelta
from pathlib import Path

from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

TODAY = date.today()
YESTERDAY = (TODAY - timedelta(days=1)).isoformat()


def _create_child(c, adm, dep_id, sec_id):
    r = c.post("/children", json={
        "last_name": "Alpha", "first_names": "Emma",
        "birth_date": "2023-01-01", "admission_date": "2025-01-01",
        "residence_address": "x", "department_id": dep_id, "section_id": sec_id,
        "guardians": [{"last_name": "Alpha", "first_names": "P", "phone": "+229"}],
    }, headers=adm)
    assert r.status_code == 201, r.text
    return r.json()


def _create_parent(c, adm, child_id, email):
    r = c.post("/parents", json={
        "first_name": "Anaïs", "last_name": "Kossou", "nickname": "Maman Anaïs",
        "phone": "+229 97", "email": email, "password": "Parent2026",
        "child_ids": [child_id],
    }, headers=adm)
    assert r.status_code == 201, r.text
    h = login(c, email, "Parent2026")
    c.post("/auth/password-change", json={"current_password": "Parent2026",
           "new_password": "ParentNew2026"}, headers=h)
    return login(c, email, "ParentNew2026")


def _create_staff(c, adm, email, staff_type):
    r = c.post("/staff", json={
        "first_name": "S", "last_name": "T", "nickname": "S", "phone": "+229",
        "email": email, "password": "Staff2026", "staff_type": staff_type,
    }, headers=adm)
    assert r.status_code == 201, r.text
    h = login(c, email, "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h)
    return login(c, email, "StaffNew2026")


def test_library(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    # ── Organisation + enfants + parent ──
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec1 = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                  headers=adm).json()
    sec2 = c.post("/sections", json={"department_id": dep["id"], "name": "MS"},
                  headers=adm).json()
    child = _create_child(c, adm, dep["id"], sec1["id"])
    par = _create_parent(c, adm, child["id"], "parent@a.fr")

    # ── Bibliothécaire : rôle socle automatique (3 permissions) ──
    bib = _create_staff(c, adm, "bib@a.fr", "bibliothecaire")
    ck("Bibliothécaire : GET /library/books → 200 (library:read socle)",
       c.get("/library/books", headers=bib).status_code, 200)

    # Staff quelconque SANS permissions bibliothèque (une secrétaire) → 403
    sec = _create_staff(c, adm, "secretaire@a.fr", "secretaire")
    ck("Secrétaire sans library:* → 403", c.get(
       "/library/books", headers=sec).status_code, 403)

    # ── Paramètres : admin-only ──
    ck("Bibliothécaire ne touche pas aux paramètres → 403", c.get(
       "/library/settings", headers=bib).status_code, 403)
    r_settings = c.put("/library/settings", json={
        "reminders_enabled": True, "reminder_days_before": 2,
        "default_loan_days": 14,
    }, headers=adm)
    ck("Admin modifie les paramètres → 200", r_settings.status_code, 200)
    ck("  reminder_days_before enregistré", r_settings.json()["reminder_days_before"], 2)
    ck("  default_loan_days enregistré", r_settings.json()["default_loan_days"], 14)

    # ── Catalogue : création (library:write), multi-sections ──
    r_book = c.post("/library/books", json={
        "title": "Le Petit Prince", "author": "Saint-Exupéry",
        "description": "Conte", "total_quantity": 2,
        "section_ids": [sec1["id"], sec2["id"]],
    }, headers=bib)
    ck("Création livre → 201", r_book.status_code, 201)
    book = r_book.json()
    ck("  disponible = quantité (aucun prêt)", book["available_quantity"], 2)
    ck("  sections rattachées (2)", len(book["sections"]), 2)

    # Section inconnue → 404 (les sections doivent appartenir à l'établissement)
    ck("Section inexistante → 404", c.post(
       "/library/books", json={"title": "X", "author": "Y",
       "section_ids": ["00000000-0000-0000-0000-000000000000"], "total_quantity": 1},
       headers=bib).status_code, 404)

    # ── Prêts (library:lend) ──
    r_loan = c.post("/library/lendings", json={
        "book_id": book["id"], "child_id": child["id"],
    }, headers=bib)
    ck("Prêt 1 → 201 (date de retour par défaut 14j)", r_loan.status_code, 201)
    loan1 = r_loan.json()
    ck("  due_date = aujourd'hui + 14", loan1["due_date"],
       (TODAY + timedelta(days=14)).isoformat())
    ck("  statut active", loan1["status"], "active")

    ck("Prêt 2 → 201 (2e exemplaire)", c.post(
       "/library/lendings", json={"book_id": book["id"], "child_id": child["id"]},
       headers=bib).status_code, 201)
    ck("Prêt 3 → 409 (plus d'exemplaire disponible)", c.post(
       "/library/lendings", json={"book_id": book["id"], "child_id": child["id"]},
       headers=bib).status_code, 409)

    lst = c.get("/library/books", headers=bib).json()
    main = [b for b in lst["items"] if b["title"] == "Le Petit Prince"][0]
    ck("  disponible après 2 prêts", main["available_quantity"], 0)
    ck("  total quantité inchangé", main["total_quantity"], 2)

    # Date de retour antérieure au prêt → 422
    ck("due_date < borrowed_at → 422", c.post(
       "/library/lendings", json={"book_id": book["id"], "child_id": child["id"],
       "borrowed_at": TODAY.isoformat(), "due_date": YESTERDAY},
       headers=bib).status_code, 422)

    # ── Retour ──
    r_ret = c.post(f"/library/lendings/{loan1['id']}/return", headers=bib)
    ck("Retour → 200", r_ret.status_code, 200)
    ck("  statut returned", r_ret.json()["status"], "returned")
    ck("  returned_at aujourd'hui", r_ret.json()["returned_at"], TODAY.isoformat())
    ck("Retour double → 409", c.post(
       f"/library/lendings/{loan1['id']}/return", headers=bib).status_code, 409)

    lst = c.get("/library/books", headers=bib).json()
    main = [b for b in lst["items"] if b["title"] == "Le Petit Prince"][0]
    ck("  disponible remonté à 1 après retour", main["available_quantity"], 1)

    # ── Rappels : message dans la conversation admin↔parent ──
    # Un prêt en retard (due_date hier) → rappelé une fois par jour max.
    c.post("/library/lendings", json={"book_id": book["id"], "child_id": child["id"],
           "borrowed_at": (TODAY - timedelta(days=10)).isoformat(),
           "due_date": YESTERDAY}, headers=bib)
    r_rem = c.post("/library/reminders/run", headers=bib)
    ck("Rappels → 200", r_rem.status_code, 200)
    ck("  1 prêt rappelé", r_rem.json()["reminded_lendings"], 1)
    ck("  1 parent notifié", r_rem.json()["reminded_parents"], 1)

    # Le parent reçoit bien un message de l'administration dans SA conversation
    conv = c.get("/messaging/conversations/me", headers=par).json()
    msgs = c.get("/messaging/conversations/me/messages", headers=par).json()["items"]
    ck("  message de rappel injecté dans la conversation",
       any("bibliothèque" in m["body"] for m in msgs), True)

    # Anti-doublon : rejouer le même jour → plus rien
    r_rem2 = c.post("/library/reminders/run", headers=bib)
    ck("  re-run même jour → 0 (anti-doublon last_reminded_on)",
       r_rem2.json()["reminded_lendings"], 0)

    # ── Consultation parent ──
    mine = c.get("/library/mine/books", headers=par).json()
    ck("Parent voit les livres des sections de son enfant", mine["total"], 1)
    mine_loans = c.get("/library/mine/lendings", headers=par).json()
    # 3 prêts côté parent : 1 rendu, 1 en cours, 1 en retard
    ck("Parent voit tous ses prêts (rendu + en cours + retard)",
       mine_loans["total"], 3)

    # ── Consultation éducatrice : livres de sa section ──
    educ = _create_staff(c, adm, "educ@a.fr", "educateur")
    educ_id = c.get("/staff?search=educ@a.fr", headers=adm).json()["items"][0]["id"]
    c.post("/groups", json={"section_id": sec1["id"], "educatrice_id": educ_id},
           headers=adm)
    educ_books = c.get("/library/educator/books", headers=educ).json()
    ck("Éducatrice voit les livres de SA section", educ_books["total"], 1)
    # Une éducatrice SANS groupe ne voit rien
    educ2 = _create_staff(c, adm, "educ2@a.fr", "educateur")
    ck("Éducatrice sans groupe → 0 livre", c.get(
       "/library/educator/books", headers=educ2).json()["total"], 0)

    # ── Soft delete ──
    # Un livre avec prêt en cours → 409
    ck("Désactiver un livre avec prêts en cours → 409", c.delete(
       f"/library/books/{book['id']}", headers=bib).status_code, 409)
    # Après retour complet → OK, puis invisibilité en consultation standard
    loans = c.get("/library/lendings?book_id=" + book["id"], headers=bib).json()["items"]
    for lo in loans:
        if lo["status"] != "returned":
            c.post(f"/library/lendings/{lo['id']}/return", headers=bib)
    ck("Désactivation OK", c.delete(
       f"/library/books/{book['id']}", headers=bib).status_code, 200)
    visible = [b for b in c.get("/library/books", headers=bib).json()["items"]
               if b["title"] == "Le Petit Prince"]
    ck("  livre désactivé invisible par défaut", len(visible), 0)
    incl = c.get("/library/books?include_inactive=true", headers=bib).json()["items"]
    ck("  visible avec include_inactive", len([b for b in incl
        if b["title"] == "Le Petit Prince"]), 1)
    ck("  prêt sur livre désactivé → 409", c.post(
       "/library/lendings", json={"book_id": book["id"], "child_id": child["id"]},
       headers=bib).status_code, 409)

    # ── Isolation établissement ──
    adm_b = onboard(c, su, "AUTRE", "admin@b.fr")
    ck("Établissement B : catalogue vide", c.get(
       "/library/books", headers=adm_b).json()["total"], 0)
    ck("Établissement B : prêt d'un livre de A → 404", c.post(
       "/library/lendings", json={"book_id": book["id"], "child_id": child["id"]},
       headers=adm_b).status_code, 404)

    # ── Superadmin exclu (403, minimisation RGPD) ──
    ck("Superadmin : GET /library/books → 403", c.get(
       "/library/books", headers=su).status_code, 403)
    ck("Superadmin : GET /library/settings → 403", c.get(
       "/library/settings", headers=su).status_code, 403)


def _staff_with_permissions(c, adm, email, permissions):
    c.post("/staff", json={
        "first_name": "S", "last_name": email.split("@")[0], "nickname": "S",
        "phone": "+229", "email": email, "password": "Staff2026",
        "staff_type": "secretaire",
    }, headers=adm)
    h = login(c, email, "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h)
    headers = login(c, email, "StaffNew2026")
    staff_id = c.get(f"/staff?search={email}", headers=adm).json()["items"][0]["id"]
    role = c.post("/rbac/roles", json={"name": f"Rôle {email}",
          "permissions": permissions}, headers=adm).json()
    c.post(f"/rbac/staff/{staff_id}/roles/{role['id']}", headers=adm)
    return headers


def test_library_permission_granularity(client):
    """Chaque permission bibliothèque ouvre son seul geste : lecture seule,
    gestion du catalogue, prêts — sans exiger les deux autres."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    child = _create_child(c, adm, dep["id"], sec["id"])
    book = c.post("/library/books", json={
        "title": "T", "author": "A", "total_quantity": 1,
        "section_ids": [sec["id"]],
    }, headers=adm).json()

    reader = _staff_with_permissions(c, adm, "reader@a.fr", ["library:read"])
    ck("Lecture seule : catalogue → 200",
       c.get("/library/books", headers=reader).status_code, 200)
    ck("Lecture seule : prêts → 200",
       c.get("/library/lendings", headers=reader).status_code, 200)
    ck("Lecture seule : création livre → 403",
       c.post("/library/books", json={"title": "X", "author": "Y",
              "total_quantity": 1}, headers=reader).status_code, 403)
    ck("Lecture seule : prêt → 403",
       c.post("/library/lendings", json={"book_id": book["id"],
              "child_id": child["id"]}, headers=reader).status_code, 403)
    ck("Lecture seule : paramètres → 403",
       c.get("/library/settings", headers=reader).status_code, 403)

    lender = _staff_with_permissions(c, adm, "lender@a.fr", ["library:lend"])
    ck("Prêts seuls : catalogue → 403",
       c.get("/library/books", headers=lender).status_code, 403)
    ck("Prêts seuls : création livre → 403",
       c.post("/library/books", json={"title": "X", "author": "Y",
              "total_quantity": 1}, headers=lender).status_code, 403)
    r = c.post("/library/lendings", json={"book_id": book["id"],
               "child_id": child["id"]}, headers=lender)
    ck("Prêts seuls : prêt → 201", r.status_code, 201)
    ck("Prêts seuls : retour → 200", c.post(
       f"/library/lendings/{r.json()['id']}/return", headers=lender).status_code, 200)
    ck("Prêts seuls : rappels → 200",
       c.post("/library/reminders/run", headers=lender).status_code, 200)

    writer = _staff_with_permissions(c, adm, "writer@a.fr", ["library:write"])
    ck("Catalogue seul : création livre → 201",
       c.post("/library/books", json={"title": "W", "author": "Y",
              "total_quantity": 1}, headers=writer).status_code, 201)
    ck("Catalogue seul : catalogue → 403",
       c.get("/library/books", headers=writer).status_code, 403)
    ck("Catalogue seul : prêt → 403",
       c.post("/library/lendings", json={"book_id": book["id"],
              "child_id": child["id"]}, headers=writer).status_code, 403)

def test_library_pagination_cap_matches_the_rest_of_the_api(client):
    """`limit=200` est accepté, comme sur les dix autres modules.

    La bibliothèque plafonnait seule à 100 alors que tout le reste de l'API
    accepte 200, et que le frontend demande 200 partout. Le tableau de bord
    admin appelait donc `/library/lendings?limit=200` et recevait un 422 : le
    compteur « prêts en retard » ne se chargeait jamais, sans que rien ne le
    signale à l'écran (constaté en recette, requête rouge dans l'onglet réseau).

    Les deux routes de gestion sont vérifiées par HTTP. Les trois routes de
    portail (`/mine/*`, `/educator/*`) ne le sont pas ici : un admin y reçoit
    403 — le contrôle d'accès passe AVANT la validation des paramètres — et
    monter un parent puis une éducatrice pour contrôler une borne de
    pagination coûterait plus que ça ne prouve. La dernière assertion couvre
    les cinq d'un coup, à la source.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    for path in ("/library/books", "/library/lendings"):
        ck(f"{path} accepte limit=200",
           c.get(f"{path}?limit=200", headers=adm).status_code, 200)
        ck(f"{path} refuse limit=201",
           c.get(f"{path}?limit=201", headers=adm).status_code, 422)

    # Les cinq routes paginées du module, portails compris : une seule restée
    # à 100 reproduirait l'écart avec le frontend.
    router = (Path(__file__).resolve().parents[2] / "app/modules/library/router.py").read_text()
    ck("aucune borne de pagination restée à 100", "le=100" in router, False)
    ck("les cinq routes paginées sont à 200", router.count("ge=1, le=200"), 5)
