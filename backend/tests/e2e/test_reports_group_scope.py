"""E2E rapports : le périmètre d'une éducatrice suit le groupe ACTUEL de
l'enfant, pas la photo prise à la création du rapport.

Signalé par un établissement, sur le **bi-mensuel** : « Un rapport bi_mensuel
existe déjà pour cette période » alors qu'aucun rapport n'était visible nulle
part. Le rapport existait bel et bien — l'unicité porte sur (enfant, type,
période) — mais la LECTURE testait `reports.group_id`, figé à la création,
d'où deux rapports fantômes :

1. un admin crée un rapport pour un enfant pas encore affecté à un groupe :
   `group_id` est NULL, et aucune éducatrice ne le verra jamais, même après
   l'affectation ;
2. un enfant change de groupe : ses rapports de la période en cours restent
   accrochés à l'ancien.

Le bi-mensuel est le type qui le révèle : sa période couvre une quinzaine,
donc une affectation tardive ou un changement de groupe tombe DANS la période
d'un rapport déjà écrit. Un quotidien n'offre qu'une journée pour ça.
"""
from datetime import date

from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

BI = {
    "oral_written_language": "ok", "physical_activities": "ok",
    "artistic_activities": "ok", "math_foundations": "ok",
    "world_exploration": "ok", "english": "ok",
    "class_behaviors": ["calm"], "peer_relations": ["sociable"],
    "emotion_management": ["autonomous"], "teacher_observations": "ok",
}


def _educ(c, adm, email, nick):
    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": nick,
           "phone": "+229", "email": email, "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    sid = c.get(f"/staff?search={email}", headers=adm).json()["items"][0]["id"]
    return sid, login(c, email, "Staff2026")


def _setup(c):
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    did = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()["id"]
    sid = c.post("/sections", json={"department_id": did, "name": "PS"},
                 headers=adm).json()["id"]
    ck("bi_mensuel activé", c.post(
        f"/reports/settings/departments/{did}/types/bi_mensuel",
        headers=adm).status_code, 204)
    role = c.post("/rbac/roles", json={"name": "Rédactrice",
                  "permissions": ["reports:read", "reports:write"]}, headers=adm).json()
    return adm, did, sid, role["id"]


def _child(c, adm, did, sid, name):
    return c.post("/children", json={"last_name": name, "first_names": "E",
                  "birth_date": "2023-01-01", "admission_date": "2025-01-01",
                  "residence_address": "x", "department_id": did, "section_id": sid,
                  "guardians": []}, headers=adm).json()["id"]


def test_un_rapport_sans_groupe_reste_visible_de_l_educatrice(client):
    """Admin → enfant non affecté → rapport `group_id = NULL`, puis affectation."""
    c = client
    adm, did, sid, role_id = _setup(c)
    educ_id, _ = _educ(c, adm, "educ1@a.fr", "Tata Un")
    c.post(f"/rbac/staff/{educ_id}/roles/{role_id}", headers=adm)
    educ = login(c, "educ1@a.fr", "Staff2026")
    gid = c.post("/groups", json={"section_id": sid, "educatrice_id": educ_id},
                 headers=adm).json()["id"]
    cid = _child(c, adm, did, sid, "Alpha")

    # L'admin rédige AVANT que l'enfant ne rejoigne un groupe : le rapport naît
    # sans groupe. C'est le cas le plus traître — rien ne le rattrapait ensuite.
    r = c.post("/reports", json={"child_id": cid, "report_type": "bi_mensuel",
               "reference_date": date.today().isoformat(), "content": BI}, headers=adm)
    ck("Admin crée le bi-mensuel", r.status_code, 201)
    rid = r.json()["id"]

    ck("Affectation au groupe", c.post(
        f"/groups/{gid}/children/{cid}", headers=adm).status_code, 200)

    # Le mur : l'éducatrice ne peut pas créer (l'unicité ne regarde que
    # l'enfant, le type et la période)…
    conflit = c.post("/reports", json={"child_id": cid, "report_type": "bi_mensuel",
                     "reference_date": date.today().isoformat(), "content": BI},
                     headers=educ)
    ck("Création refusée en 409", conflit.status_code, 409)
    detail = conflit.json()["detail"]
    # …et le message doit DIRE laquelle et dans quel état, sinon le blocage se
    # lit comme un bug : la liste s'ouvre sur « Soumis », le rapport est un
    # brouillon, et une date du 3 ou du 14 désigne la même quinzaine.
    assert "brouillon" in detail, detail
    assert "bi-mensuel" in detail, detail
    periode = c.get(f"/reports/{rid}", headers=adm).json()["period_label"]
    assert periode in detail, (periode, detail)

    # …donc elle doit le TROUVER, et pouvoir le reprendre.
    liste = c.get("/reports?report_type=bi_mensuel", headers=educ).json()
    ck("Le rapport apparaît dans sa liste", [i["id"] for i in liste["items"]], [rid])
    ck("Elle peut l'ouvrir", c.get(f"/reports/{rid}", headers=educ).status_code, 200)
    ck("Elle peut l'écrire", c.patch(f"/reports/{rid}",
       json={"summary": "repris"}, headers=educ).status_code, 200)


def test_un_enfant_qui_change_de_groupe_emmene_ses_rapports(client):
    """Le rapport reste chez son auteur ET suit l'enfant chez sa nouvelle
    éducatrice — garder la photo en plus du groupe actuel est volontaire."""
    c = client
    adm, did, sid, role_id = _setup(c)
    e1_id, _ = _educ(c, adm, "educ1@a.fr", "Tata Un")
    e2_id, _ = _educ(c, adm, "educ2@a.fr", "Tata Deux")
    for s in (e1_id, e2_id):
        c.post(f"/rbac/staff/{s}/roles/{role_id}", headers=adm)
    e1 = login(c, "educ1@a.fr", "Staff2026")
    e2 = login(c, "educ2@a.fr", "Staff2026")
    g1 = c.post("/groups", json={"section_id": sid, "educatrice_id": e1_id},
                headers=adm).json()["id"]
    g2 = c.post("/groups", json={"section_id": sid, "educatrice_id": e2_id},
                headers=adm).json()["id"]
    cid = _child(c, adm, did, sid, "Beta")
    c.post(f"/groups/{g1}/children/{cid}", headers=adm)

    r = c.post("/reports", json={"child_id": cid, "report_type": "bi_mensuel",
               "reference_date": date.today().isoformat(), "content": BI}, headers=e1)
    ck("Educ1 crée le bi-mensuel", r.status_code, 201)
    rid = r.json()["id"]

    # Milieu de quinzaine : l'enfant change de groupe.
    ck("Déplacement de groupe", c.post(
        f"/groups/{g2}/children/{cid}", headers=adm).status_code, 200)

    ck("Educ2 (groupe actuel) le voit", [i["id"] for i in c.get(
        "/reports?report_type=bi_mensuel", headers=e2).json()["items"]], [rid])
    ck("Educ2 peut l'ouvrir", c.get(f"/reports/{rid}", headers=e2).status_code, 200)
    ck("Educ1 (autrice) le voit toujours", [i["id"] for i in c.get(
        "/reports?report_type=bi_mensuel", headers=e1).json()["items"]], [rid])
    ck("Educ2 est bloquée en 409, pas perdue", c.post(
        "/reports", json={"child_id": cid, "report_type": "bi_mensuel",
        "reference_date": date.today().isoformat(), "content": BI},
        headers=e2).status_code, 409)
