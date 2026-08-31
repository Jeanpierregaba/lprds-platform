"""E2E menus : écriture (admin/staff délégué), lecture ouverte, historique
restreint, isolation établissement.

Les dates sont calculées par rapport à `date.today()` (jamais codées en dur) —
un test committé doit rester valide indéfiniment, contrairement aux scripts
manuels ponctuels utilisés pendant le développement du module."""
from datetime import date, timedelta

from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

_TODAY = date.today()
CURRENT_MONDAY = _TODAY - timedelta(days=_TODAY.weekday())
NEXT_MONDAY = CURRENT_MONDAY + timedelta(days=7)
PAST_MONDAY = CURRENT_MONDAY - timedelta(days=7)
NOT_A_MONDAY = CURRENT_MONDAY + timedelta(days=1)  # un mardi, jamais un lundi

WEEK_CONTENT = {
    "monday": {"collation": "Fruits frais", "dejeuner": "Poulet rôti, riz",
               "dessert": "Yaourt", "gouter": "Compote"},
    "tuesday": {"collation": "Pain, confiture", "dejeuner": "Poisson, purée",
                "dessert": "Fruit", "gouter": "Biscuits"},
    "wednesday": {"collation": None, "dejeuner": None, "dessert": None, "gouter": None},
    "thursday": {"collation": None, "dejeuner": None, "dessert": None, "gouter": None},
    "friday": {"collation": None, "dejeuner": None, "dessert": None, "gouter": None},
}


def test_menus(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    c.post("/staff", json={"first_name": "R", "last_name": "Un", "nickname": "Resto1",
           "phone": "+229", "email": "resto1@a.fr", "password": "Staff2026",
           "staff_type": "restaurateur"}, headers=adm)
    h1 = login(c, "resto1@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h1)
    resto1_id = c.get("/staff?search=resto1@a.fr", headers=adm).json()["items"][0]["id"]
    role = c.post("/rbac/roles", json={"name": "Restauration",
          "permissions": ["menus:write"]}, headers=adm).json()
    c.post(f"/rbac/staff/{resto1_id}/roles/{role['id']}", headers=adm)
    resto1 = login(c, "resto1@a.fr", "StaffNew2026")

    # Staff quelconque SANS menus:write (une éducatrice) — doit pouvoir LIRE,
    # y compris l'historique (menus:read fait partie du rôle socle
    # automatiquement attribué à staff_type=educateur, cf. rbac/service.py::
    # ensure_educatrice_baseline_role), mais jamais écrire.
    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": "Educ",
           "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    h2 = login(c, "educ@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h2)
    educ = login(c, "educ@a.fr", "StaffNew2026")

    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    child = c.post("/children", json={"last_name": "Alpha", "first_names": "Emma",
                   "birth_date": "2023-01-01", "admission_date": "2025-01-01",
                   "residence_address": "x", "department_id": dep["id"],
                   "section_id": sec["id"], "guardians": [{"last_name": "Alpha",
                   "first_names": "P", "phone": "+229"}]}, headers=adm).json()
    cid = child["id"]
    rp = c.post("/parents", json={"first_name": "Anaïs", "last_name": "Kossou",
           "nickname": "Maman Anaïs", "phone": "+229 97", "email": "parent@a.fr",
           "password": "Parent2026", "child_ids": [cid]}, headers=adm)
    assert rp.status_code == 201, rp.text
    pl = login(c, "parent@a.fr", "Parent2026")
    c.post("/auth/password-change", json={"current_password": "Parent2026",
           "new_password": "ParentNew2026"}, headers=pl)
    par = login(c, "parent@a.fr", "ParentNew2026")

    # ── Écriture : validations ──
    ck("Éducatrice sans menus:write → 403 à la création", c.post(
       "/menus", json={"week_start": CURRENT_MONDAY.isoformat(), **WEEK_CONTENT},
       headers=educ).status_code, 403)
    ck("week_start pas un lundi → 422", c.post(
       "/menus", json={"week_start": NOT_A_MONDAY.isoformat(), **WEEK_CONTENT},
       headers=resto1).status_code, 422)
    ck("Semaine passée → 422 (historique immuable)", c.post(
       "/menus", json={"week_start": PAST_MONDAY.isoformat(), **WEEK_CONTENT},
       headers=resto1).status_code, 422)
    ck("Créneau vide (chaîne vide) → 422", c.post(
       "/menus", json={"week_start": CURRENT_MONDAY.isoformat(),
       "monday": {"collation": ""}}, headers=resto1).status_code, 422)

    # ── Création semaine en cours (staff délégué) ──
    r = c.post("/menus", json={"week_start": CURRENT_MONDAY.isoformat(), **WEEK_CONTENT},
               headers=resto1)
    ck("Création OK", r.status_code, 201)
    menu = r.json()
    ck("  week_end = vendredi", menu["week_end"], (CURRENT_MONDAY + timedelta(days=4)).isoformat())
    ck("  monday.dejeuner correct", menu["monday"]["dejeuner"], "Poulet rôti, riz")
    ck("  wednesday encore vide (remplissage progressif)", menu["wednesday"]["dejeuner"], None)
    ck("  created_by = resto1", menu["created_by"]["nickname"], "Resto1")
    ck("  updated_by absent à la création", menu["updated_by"], None)

    ck("Doublon même semaine → 409", c.post(
       "/menus", json={"week_start": CURRENT_MONDAY.isoformat(), **WEEK_CONTENT},
       headers=resto1).status_code, 409)

    # ── Lecture ouverte à tous (semaine en cours) ──
    for label, hdrs in [("admin", adm), ("staff sans menus:write", educ), ("parent", par)]:
        g = c.get("/menus/current", headers=hdrs)
        ck(f"{label} lit /menus/current → 200", g.status_code, 200)
    g_week = c.get(f"/menus/{CURRENT_MONDAY.isoformat()}", headers=educ)
    ck("Lecture par semaine explicite (staff) → 200", g_week.status_code, 200)

    # ── Remplissage progressif (PATCH, remplace le contenu entier) ──
    full_week = {**WEEK_CONTENT, "wednesday": {"collation": "Compote", "dejeuner": "Boeuf, pâtes",
                 "dessert": "Fromage blanc", "gouter": "Madeleine"}}
    upd = c.patch(f"/menus/{CURRENT_MONDAY.isoformat()}", json=full_week, headers=resto1)
    ck("Educatrice ne peut pas modifier (403)", c.patch(
       f"/menus/{CURRENT_MONDAY.isoformat()}", json=full_week, headers=educ).status_code, 403)
    ck("Restaurateur modifie", upd.status_code, 200)
    ck("  wednesday.dejeuner mis à jour", upd.json()["wednesday"]["dejeuner"], "Boeuf, pâtes")
    ck("  updated_by renseigné", upd.json()["updated_by"]["nickname"], "Resto1")

    # ── Semaine future : création + lecture ouverte ──
    r_next = c.post("/menus", json={"week_start": NEXT_MONDAY.isoformat(), **WEEK_CONTENT},
                    headers=resto1)
    ck("Création semaine future OK", r_next.status_code, 201)
    g_next = c.get(f"/menus/{NEXT_MONDAY.isoformat()}", headers=par)
    ck("Parent lit la semaine future → 200 (pas réservé à l'historique)",
       g_next.status_code, 200)

    # ── Historique (semaine passée) : réservé admin/menus:write ──
    # Aucun menu n'existe réellement sur PAST_MONDAY ici : on vérifie que le
    # contrôle d'accès (403) prime sur l'existence de la ressource (404) —
    # même principe que partout ailleurs dans l'application.
    ck("Parent → semaine passée → 403 (pas 404)", c.get(
       f"/menus/{PAST_MONDAY.isoformat()}", headers=par).status_code, 403)
    ck("Éducatrice (menus:read via socle) → semaine passée (inexistante) → 404", c.get(
       f"/menus/{PAST_MONDAY.isoformat()}", headers=educ).status_code, 404)
    ck("Admin → semaine passée (inexistante) → 404, pas 403", c.get(
       f"/menus/{PAST_MONDAY.isoformat()}", headers=adm).status_code, 404)
    ck("Restaurateur (menus:write) → semaine passée (inexistante) → 404", c.get(
       f"/menus/{PAST_MONDAY.isoformat()}", headers=resto1).status_code, 404)

    # ── Liste / historique complet ──
    lst_educ = c.get("/menus", headers=educ)
    ck("Éducatrice (menus:read via socle) → GET /menus (liste) → 200",
       lst_educ.status_code, 200)
    ck("Parent → GET /menus (liste) → 403", c.get(
       "/menus", headers=par).status_code, 403)
    lst = c.get("/menus", headers=adm).json()
    ck("Admin liste : 2 semaines (courante + future)", lst["total"], 2)
    lst_resto = c.get("/menus", headers=resto1).json()
    ck("Restaurateur liste aussi : 2 semaines", lst_resto["total"], 2)

    # ── Suppression ──
    ck("Éducatrice ne peut pas supprimer → 403", c.delete(
       f"/menus/{NEXT_MONDAY.isoformat()}", headers=educ).status_code, 403)
    ck("Restaurateur supprime la semaine future", c.delete(
       f"/menus/{NEXT_MONDAY.isoformat()}", headers=resto1).status_code, 204)
    ck("  bien supprimée (404 ensuite)", c.get(
       f"/menus/{NEXT_MONDAY.isoformat()}", headers=adm).status_code, 404)

    # ── Isolation étab B ──
    adm_b = onboard(c, su, "AUTRE", "admin@b.fr")
    g_b_current = c.get("/menus/current", headers=adm_b)
    ck("Admin B : pas de menu (établissement différent) → 404", g_b_current.status_code, 404)
    lst_b = c.get("/menus", headers=adm_b).json()
    ck("Admin B liste : 0 (isolation)", lst_b["total"], 0)
