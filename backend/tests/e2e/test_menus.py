"""E2E menus PAR DÉPARTEMENT : un menu = (semaine, département), plus de menu
général d'établissement.

Couvre : validations d'écriture, 409 par (semaine, département), visibilité
scopée (parent = départements de ses enfants — y compris multi-départements,
éducatrice = départements de ses groupes, autre staff = tout comme avant),
/current en liste, historique scopé, isolation établissement.

Les dates sont calculées par rapport à `date.today()` (jamais codées en dur).
"""
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


def _login_staff(c, adm, email, first, last, nick, stype, pwd="Staff2026"):
    c.post("/staff", json={"first_name": first, "last_name": last, "nickname": nick,
           "phone": "+229", "email": email, "password": pwd,
           "staff_type": stype}, headers=adm)
    h = login(c, email, pwd)
    c.post("/auth/password-change", json={"current_password": pwd,
           "new_password": pwd + "New"}, headers=h)
    return login(c, email, pwd + "New")


def _setup(c):
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    mat = c.post("/departments", json={"name": "Mat"}, headers=adm).json()
    prim = c.post("/departments", json={"name": "Prim"}, headers=adm).json()
    sec_m = c.post("/sections", json={"department_id": mat["id"], "name": "PS"},
                   headers=adm).json()
    sec_p = c.post("/sections", json={"department_id": prim["id"], "name": "CP"},
                   headers=adm).json()

    resto = _login_staff(c, adm, "resto@a.fr", "R", "Un", "Resto", "restaurateur")
    resto_id = c.get("/staff?search=resto@a.fr", headers=adm).json()["items"][0]["id"]
    role = c.post("/rbac/roles", json={"name": "Restauration",
          "permissions": ["menus:write"]}, headers=adm).json()
    c.post(f"/rbac/staff/{resto_id}/roles/{role['id']}", headers=adm)

    # Éducatrice menant un groupe en Mat (menus:read via socle automatique).
    educ = _login_staff(c, adm, "educ@a.fr", "E", "T", "Educ", "educateur")
    educ_id = c.get("/staff?search=educ@a.fr", headers=adm).json()["items"][0]["id"]
    c.post("/groups", json={"section_id": sec_m["id"], "educatrice_id": educ_id},
           headers=adm)

    # Secrétaire : aucun groupe, aucun menus:write → voit tout (inchangé).
    secr = _login_staff(c, adm, "secr@a.fr", "S", "Ecr", "Secr", "secretaire")

    # Deux enfants dans deux départements + un parent des deux.
    emma = c.post("/children", json={
        "last_name": "Emma", "first_names": "E", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": mat["id"], "section_id": sec_m["id"],
        "guardians": [{"last_name": "Emma", "first_names": "T", "phone": "+229"}],
    }, headers=adm).json()
    hugo = c.post("/children", json={
        "last_name": "Hugo", "first_names": "H", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": prim["id"], "section_id": sec_p["id"],
        "guardians": [{"last_name": "Hugo", "first_names": "T", "phone": "+228"}],
    }, headers=adm).json()
    c.post("/parents", json={"first_name": "P", "last_name": "Deux",
           "nickname": "Parent 2", "phone": "+229", "email": "p2@a.fr",
           "password": "Parent2026", "child_ids": [emma["id"], hugo["id"]]}, headers=adm)
    pl = login(c, "p2@a.fr", "Parent2026")
    c.post("/auth/password-change", json={"current_password": "Parent2026",
           "new_password": "ParentNew2026"}, headers=pl)
    par2 = login(c, "p2@a.fr", "ParentNew2026")
    # Parent d'un seul département (Mat).
    c.post("/parents", json={"first_name": "P", "last_name": "Un",
           "nickname": "Parent 1", "phone": "+229", "email": "p1@a.fr",
           "password": "Parent2026", "child_ids": [emma["id"]]}, headers=adm)
    pl1 = login(c, "p1@a.fr", "Parent2026")
    c.post("/auth/password-change", json={"current_password": "Parent2026",
           "new_password": "ParentNew2026"}, headers=pl1)
    par1 = login(c, "p1@a.fr", "ParentNew2026")
    return {"adm": adm, "mat": mat, "prim": prim, "resto": resto, "educ": educ,
            "secr": secr, "par1": par1, "par2": par2}


def test_menus_per_department(client):
    c = client
    s = _setup(c)
    adm, mat, prim = s["adm"], s["mat"], s["prim"]
    resto, educ, secr, par1, par2 = s["resto"], s["educ"], s["secr"], s["par1"], s["par2"]
    cur, nxt = CURRENT_MONDAY.isoformat(), NEXT_MONDAY.isoformat()

    # ── Écriture : validations ──
    ck("Éducatrice sans menus:write → 403", c.post(
       "/menus", json={"week_start": cur, "department_id": mat["id"], **WEEK_CONTENT},
       headers=educ).status_code, 403)
    ck("Département manquant → 422", c.post(
       "/menus", json={"week_start": cur, **WEEK_CONTENT}, headers=resto).status_code, 422)
    ck("Département inconnu → 404", c.post(
       "/menus", json={"week_start": cur,
       "department_id": "00000000-0000-0000-0000-000000000000", **WEEK_CONTENT},
       headers=resto).status_code, 404)
    ck("Pas un lundi → 422", c.post(
       "/menus", json={"week_start": NOT_A_MONDAY.isoformat(),
       "department_id": mat["id"], **WEEK_CONTENT}, headers=resto).status_code, 422)
    ck("Semaine passée → 422", c.post(
       "/menus", json={"week_start": PAST_MONDAY.isoformat(),
       "department_id": mat["id"], **WEEK_CONTENT}, headers=resto).status_code, 422)

    # ── Création Mat + Prim (même semaine, départements différents : OK) ──
    r = c.post("/menus", json={"week_start": cur, "department_id": mat["id"],
               **WEEK_CONTENT}, headers=resto)
    ck("Création Mat OK", r.status_code, 201)
    ck("department_id renvoyé", r.json()["department_id"], mat["id"])
    ck("department_name dénormalisé", r.json()["department_name"], "Mat")
    ck("Doublon même (semaine, département) → 409", c.post(
       "/menus", json={"week_start": cur, "department_id": mat["id"], **WEEK_CONTENT},
       headers=resto).status_code, 409)
    ck("Création Prim même semaine OK", c.post(
       "/menus", json={"week_start": cur, "department_id": prim["id"], **WEEK_CONTENT},
       headers=resto).status_code, 201)

    # ── /current : UN menu par département visible ──
    ck("Admin voit 2 menus", len(
       c.get("/menus/current", headers=adm).json()["items"]), 2)
    ck("Parent 2 dépts voit 2 menus", len(
       c.get("/menus/current", headers=par2).json()["items"]), 2)
    got1 = c.get("/menus/current", headers=par1).json()["items"]
    ck("Parent 1 dept voit 1 menu", len(got1), 1)
    ck("… celui de Mat", got1[0]["department_id"], mat["id"])
    got_e = c.get("/menus/current", headers=educ).json()["items"]
    ck("Éducatrice (groupes Mat) voit 1 menu", len(got_e), 1)
    ck("… celui de Mat", got_e[0]["department_id"], mat["id"])
    ck("Secrétaire (aucun groupe) voit tout, inchangé", len(
       c.get("/menus/current", headers=secr).json()["items"]), 2)

    # ── /{semaine}?department_id= : périmètre + historique ──
    ck("Parent lit son dept (semaine future) → 200", c.post(
       "/menus", json={"week_start": nxt, "department_id": mat["id"], **WEEK_CONTENT},
       headers=resto).status_code, 201)
    ck("Parent lit Mat future → 200", c.get(
       f"/menus/{nxt}", params={"department_id": mat["id"]}, headers=par1).status_code, 200)
    ck("Parent lit Prim (pas son dept) → 403", c.get(
       f"/menus/{cur}", params={"department_id": prim["id"]}, headers=par1).status_code, 403)
    ck("Éducatrice lit Prim (pas ses groupes) → 403", c.get(
       f"/menus/{cur}", params={"department_id": prim["id"]}, headers=educ).status_code, 403)
    ck("Parent semaine passée → 403 (même son dept)", c.get(
       f"/menus/{PAST_MONDAY.isoformat()}", params={"department_id": mat["id"]},
       headers=par1).status_code, 403)
    ck("department_id manquant → 422", c.get(
       f"/menus/{cur}", headers=par1).status_code, 422)

    # ── PATCH/DELETE scopés au (semaine, département) ──
    ck("Éducatrice ne modifie pas → 403", c.patch(
       f"/menus/{cur}", params={"department_id": mat["id"]},
       json=WEEK_CONTENT, headers=educ).status_code, 403)
    ck("Resto modifie Mat", c.patch(
       f"/menus/{cur}", params={"department_id": mat["id"]},
       json=WEEK_CONTENT, headers=resto).status_code, 200)
    ck("Resto supprime Prim", c.delete(
       f"/menus/{cur}", params={"department_id": prim["id"]},
       headers=resto).status_code, 204)
    ck("Prim supprimé (404 ensuite)", c.get(
       f"/menus/{cur}", params={"department_id": prim["id"]},
       headers=adm).status_code, 404)
    ck("Mat intact après suppression de Prim", c.get(
       f"/menus/{cur}", params={"department_id": mat["id"]},
       headers=adm).status_code, 200)

    # ── Historique : scopé + filtre ──
    lst_e = c.get("/menus", headers=educ).json()
    ck("Historique éducatrice : que Mat", {i["department_id"] for i in lst_e["items"]},
       {mat["id"]})
    ck("Filtre Prim pour l'éducatrice → 403", c.get(
       "/menus", params={"department_id": prim["id"]}, headers=educ).status_code, 403)
    ck("Admin filtre Prim → 200", c.get(
       "/menus", params={"department_id": prim["id"]}, headers=adm).status_code, 200)
    ck("Parent → GET /menus → 403", c.get("/menus", headers=par1).status_code, 403)

    # ── Départements visibles (sélecteurs UI) ──
    depts_par2 = c.get("/menus/departments", headers=par2).json()
    ck("Parent 2 dépts : 2 départements", depts_par2["total"], 2)
    depts_par1 = c.get("/menus/departments", headers=par1).json()
    ck("Parent 1 dept : Mat uniquement",
       [d["name"] for d in depts_par1["items"]], ["Mat"])
    depts_educ = c.get("/menus/departments", headers=educ).json()
    ck("Éducatrice : Mat uniquement",
       [d["name"] for d in depts_educ["items"]], ["Mat"])
    ck("Admin : tout", c.get("/menus/departments", headers=adm).json()["total"], 2)

    # ── Isolation étab B ──
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm_b = onboard(c, su, "AUTRE", "admin@b.fr")
    ck("Admin B /current : liste vide (pas 404)", c.get(
       "/menus/current", headers=adm_b).json()["items"], [])
    ck("Département de B refusé en création ici → 404", c.post(
       "/menus", json={"week_start": cur,
       "department_id": c.post("/departments", json={"name": "X"},
       headers=adm_b).json()["id"], **WEEK_CONTENT},
       headers=resto).status_code, 404)
