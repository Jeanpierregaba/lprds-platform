"""E2E rapports : brouillon partiel accepté, soumission/validation strictes.

Contrat verrouillé ici :
- POST /reports et PATCH acceptent un contenu INCOMPLET (champ manquant ou
  vide) — c'est un brouillon, un travail en cours ;
- restent refusés à l'écriture l'incohérent (durée de sieste sans sieste) et
  le malformé (enum inconnu, température hors plage) ;
- POST /reports/{id}/submit et /validate exigent le contenu COMPLET (422
  sinon) — rien d'incomplet ne part vers le parent, y compris via la
  publication immédiate admin ou une retouche admin d'un soumis.
"""
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

FULL_QUOTIDIEN = {
    "health_status": "bien",
    "breakfast": "bien_mange",
    "lunch": "bien_mange",
    "snack": "peu_mange",
    "nap": True,
    "nap_duration_minutes": 60,
    "bath": True,
    "poop": False,
    "moods": ["joyeux"],
    "activities": ["Peinture"],
    "behaviors": ["pleasant_day"],
}

FULL_BIMENSUEL = {
    "oral_written_language": "Progrès.",
    "physical_activities": "Participe.",
    "artistic_activities": "Dessine.",
    "math_foundations": "Compte jusqu'à 3.",
    "world_exploration": "Curieux.",
    "english": "Hello.",
    "class_behaviors": ["joyful"],
    "peer_relations": ["sociable"],
    "emotion_management": ["autonomous"],
    "teacher_observations": "Bien.",
}


def _setup(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    did = dep["id"]
    sec = c.post("/sections", json={"department_id": did, "name": "PS"}, headers=adm).json()
    sid = sec["id"]
    c.post(f"/reports/settings/departments/{did}/types/quotidien", headers=adm)
    c.post(f"/reports/settings/departments/{did}/types/bi_mensuel", headers=adm)

    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": "Tata",
           "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    h = login(c, "educ@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h)
    educ_id = c.get("/staff?search=educ@a.fr", headers=adm).json()["items"][0]["id"]
    role = c.post("/rbac/roles", json={"name": "Rédactrice",
          "permissions": ["reports:read", "reports:write"]}, headers=adm).json()
    c.post(f"/rbac/staff/{educ_id}/roles/{role['id']}", headers=adm)
    educ = login(c, "educ@a.fr", "StaffNew2026")

    group = c.post("/groups", json={"section_id": sid, "educatrice_id": educ_id},
                   headers=adm).json()
    child = c.post("/children", json={"last_name": "Alpha", "first_names": "E",
                   "birth_date": "2023-01-01", "admission_date": "2025-01-01",
                   "residence_address": "x", "department_id": did, "section_id": sid,
                   "guardians": []}, headers=adm).json()
    cid = child["id"]
    c.post(f"/groups/{group['id']}/children/{cid}", headers=adm)
    return adm, educ, cid


def test_draft_partiel_puis_soumission_complete(client):
    adm, educ, cid = _setup(client)
    c = client

    # ── Brouillon vide, puis partiel : acceptés ──
    r = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
               "reference_date": "2026-07-10", "content": {}}, headers=educ)
    ck("Brouillon vide accepté", r.status_code, 201)
    rid = r.json()["id"]
    ck("  contenu stocké vide", r.json()["content"], {})
    ck("Soumission du vide → 422", c.post(f"/reports/{rid}/submit", headers=educ).status_code, 422)

    r = c.patch(f"/reports/{rid}", json={"content": {"health_status": "bien"}},
                headers=educ)
    ck("PATCH partiel (un seul champ) accepté", r.status_code, 200)
    ck("  seul le champ rempli est stocké", r.json()["content"], {"health_status": "bien"})
    ck("Soumission du partiel → 422", c.post(f"/reports/{rid}/submit", headers=educ).status_code, 422)

    # ── Complété : la soumission passe ──
    r = c.patch(f"/reports/{rid}", json={"content": FULL_QUOTIDIEN}, headers=educ)
    ck("PATCH complet accepté", r.status_code, 200)
    r = c.post(f"/reports/{rid}/submit", headers=educ)
    ck("Soumission du complet → 200", r.status_code, 200)
    ck("  statut soumis (staff)", r.json()["status"], "submitted")

    # ── Publication immédiate admin sur incomplet → 422 ──
    r = c.post("/reports", json={"child_id": cid, "report_type": "bi_mensuel",
               "reference_date": "2026-07-10",
               "content": {"english": "Hello"}}, headers=adm)
    ck("Brouillon admin partiel accepté", r.status_code, 201)
    ck("Soumission admin (= publication) → 422", c.post(
       f"/reports/{r.json()['id']}/submit", headers=adm).status_code, 422)


def test_validation_refuse_un_soumis_vide_par_l_admin(client):
    adm, educ, cid = _setup(client)
    c = client

    # Complet → soumis par l'éducatrice.
    r = c.post("/reports", json={"child_id": cid, "report_type": "bi_mensuel",
               "reference_date": "2026-07-10", "content": FULL_BIMENSUEL}, headers=educ)
    ck("Création complète", r.status_code, 201)
    rid = r.json()["id"]
    ck("Soumission", c.post(f"/reports/{rid}/submit", headers=educ).status_code, 200)

    # L'admin peut retoucher un soumis — mais s'il le vide, la validation
    # doit refuser : valider publie au parent, comme soumettre.
    complete = c.get(f"/reports/{rid}", headers=adm).json()["content"]
    partial = {k: v for k, v in complete.items() if k != "teacher_observations"}
    ck("Admin vide un champ du soumis → 200 (retouche autorisée)",
       c.patch(f"/reports/{rid}", json={"content": partial}, headers=adm).status_code, 200)
    ck("Validation de l'incomplet → 422",
       c.post(f"/reports/{rid}/validate", headers=adm).status_code, 422)
    ck("Restauration → 200",
       c.patch(f"/reports/{rid}", json={"content": complete}, headers=adm).status_code, 200)
    ck("Validation du complet → 200",
       c.post(f"/reports/{rid}/validate", headers=adm).status_code, 200)


def test_rejet_puis_resoumission_exige_le_complet(client):
    adm, educ, cid = _setup(client)
    c = client

    r = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
               "reference_date": "2026-07-11", "content": FULL_QUOTIDIEN}, headers=educ)
    rid = r.json()["id"]
    c.post(f"/reports/{rid}/submit", headers=educ)
    ck("Rejet admin", c.post(f"/reports/{rid}/reject", json={"reason": "Préciser la sieste"},
                             headers=adm).status_code, 200)

    incomplete = {k: v for k, v in FULL_QUOTIDIEN.items() if k != "moods"}
    ck("Rejeté retouché en partiel → 200",
       c.patch(f"/reports/{rid}", json={"content": incomplete}, headers=educ).status_code, 200)
    ck("Resoumission du partiel → 422",
       c.post(f"/reports/{rid}/submit", headers=educ).status_code, 422)
    ck("Recomplété → 200",
       c.patch(f"/reports/{rid}", json={"content": FULL_QUOTIDIEN}, headers=educ).status_code, 200)
    ck("Resoumission → submitted",
       c.post(f"/reports/{rid}/submit", headers=educ).json()["status"], "submitted")


def test_seul_l_admin_deplace_un_rapport_dans_le_temps(client):
    adm, educ, cid = _setup(client)
    c = client

    r = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
               "reference_date": "2026-07-10", "content": FULL_QUOTIDIEN}, headers=educ)
    ck("Création", r.status_code, 201)
    rid = r.json()["id"]

    # L'éducatrice édite le contenu, pas les dates — même sur son brouillon.
    ck("PATCH date par le staff → 403",
       c.patch(f"/reports/{rid}", json={"reference_date": "2026-07-11"},
               headers=educ).status_code, 403)
    ck("PATCH contenu par le staff → 200",
       c.patch(f"/reports/{rid}", json={"content": {**FULL_QUOTIDIEN, "bath": False}},
               headers=educ).status_code, 200)

    # L'admin déplace à tout statut : ici brouillon, puis soumis, puis validé.
    r = c.patch(f"/reports/{rid}", json={"reference_date": "2026-07-11"}, headers=adm)
    ck("Admin déplace le brouillon → 200", r.status_code, 200)
    ck("  période recalculée", r.json()["period_start"], "2026-07-11")
    ck("Date future → 422",
       c.patch(f"/reports/{rid}", json={"reference_date": "2099-01-01"},
               headers=adm).status_code, 422)

    c.post(f"/reports/{rid}/submit", headers=educ)
    r = c.patch(f"/reports/{rid}", json={"reference_date": "2026-07-12"}, headers=adm)
    ck("Admin déplace le soumis → 200", r.status_code, 200)
    ck("  libellé suit", r.json()["period_label"], "12 juillet 2026")

    # Conflit d'unicité : un second rapport occupe la période cible.
    r2 = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
                "reference_date": "2026-07-13", "content": FULL_QUOTIDIEN}, headers=educ)
    ck("Second rapport (13/07) → 201", r2.status_code, 201)
    ck("Déplacement sur une période occupée → 409",
       c.patch(f"/reports/{rid}", json={"reference_date": "2026-07-13"},
               headers=adm).status_code, 409)

    c.post(f"/reports/{rid}/validate", headers=adm)
    r = c.patch(f"/reports/{rid}", json={"reference_date": "2026-07-14"}, headers=adm)
    ck("Admin déplace le validé → 200", r.status_code, 200)
    ck("  période recalculée", r.json()["period_start"], "2026-07-14")
