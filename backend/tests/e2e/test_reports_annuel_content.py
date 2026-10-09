"""E2E rapports : contenu structuré annuel (bulletin), validations, PDF."""
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


def domain(rating, obs):
    return {"rating": rating, "observation": obs}


FULL_ANNUEL = {
    "oral_written_language": domain("acquis", "Vocabulaire riche, phrases construites."),
    "physical_activities": domain("en_cours_acquisition", "Progresse en motricité fine."),
    "artistic_activities": domain("acquis", "Grande créativité en peinture."),
    "math_foundations": domain("a_consolider", "Compte jusqu'à 3, à renforcer."),
    "world_exploration": domain("acquis", "Très curieux(se) de son environnement."),
    "english": domain("en_cours_acquisition", "Reconnaît les couleurs basiques."),
}


def test_reports_annuel_content(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    did = dep["id"]
    sec = c.post("/sections", json={"department_id": did, "name": "PS"}, headers=adm).json()
    sid = sec["id"]
    c.post(f"/reports/settings/departments/{did}/types/annuel", headers=adm)

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
    child = c.post("/children", json={"last_name": "Alpha", "first_names": "Emma",
                   "birth_date": "2023-01-01", "admission_date": "2025-01-01",
                   "residence_address": "x", "department_id": did, "section_id": sid,
                   "guardians": [{"last_name": "Alpha", "first_names": "P",
                   "phone": "+229"}]}, headers=adm).json()
    cid = child["id"]
    c.post(f"/groups/{group['id']}/children/{cid}", headers=adm)

    rp = c.post("/parents", json={"first_name": "Anaïs", "last_name": "Kossou",
           "nickname": "Maman Anaïs", "phone": "+229 97", "email": "parent@a.fr",
           "password": "Parent2026", "child_ids": [cid]}, headers=adm)
    assert rp.status_code == 201, rp.text
    pl = login(c, "parent@a.fr", "Parent2026")
    c.post("/auth/password-change", json={"current_password": "Parent2026",
           "new_password": "ParentNew2026"}, headers=pl)
    par = login(c, "parent@a.fr", "ParentNew2026")

    # ── Vocabulaire ──
    vocab = c.get("/reports/vocabulary", headers=educ).json()
    ck("8 catégories de vocabulaire", sorted(vocab.keys()), sorted([
       "health_status", "meal_amount", "mood", "behavior_tag",
       "class_behavior", "peer_relation", "emotion_management", "acquisition_level"]))
    ck("3 notations d'acquisition", len(vocab["acquisition_level"]), 3)
    ck("Libellé notation correct", vocab["acquisition_level"]["a_consolider"], "À consolider")

    # ── Création avec contenu structuré ──
    r = c.post("/reports", json={"child_id": cid, "report_type": "annuel",
               "reference_date": "2026-06-15", "content": FULL_ANNUEL}, headers=educ)
    ck("Création annuel", r.status_code, 201)
    rep = r.json()
    rid = rep["id"]
    ck("  period_label = année civile", rep["period_label"], "Année 2026")
    ck("  summary absent (optionnel)", rep["summary"], None)
    ck("  rating stocké", rep["content"]["math_foundations"]["rating"], "a_consolider")

    # ── Brouillon partiel : incomplet accepté à l'écriture, exigé à la soumission ──
    # Années différentes : la période annuelle = l'année civile entière,
    # un doublon (409) sur 2026 masquerait sinon l'erreur attendue.
    r = c.post("/reports", json={
       "child_id": cid, "report_type": "annuel", "reference_date": "2024-05-01",
       "content": {k: v for k, v in FULL_ANNUEL.items() if k != "english"}},
       headers=educ)
    ck("Domaine manquant (english) → brouillon accepté", r.status_code, 201)
    ck("  soumission → 422", c.post(
       f"/reports/{r.json()['id']}/submit", headers=educ).status_code, 422)
    ck("Rating invalide → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "annuel", "reference_date": "2023-04-01",
       "content": {**FULL_ANNUEL, "english": domain("excellent", "top")}},
       headers=educ).status_code, 422)
    r = c.post("/reports", json={
       "child_id": cid, "report_type": "annuel", "reference_date": "2022-03-01",
       "content": {**FULL_ANNUEL, "english": domain("acquis", "")}},
       headers=educ)
    ck("Observation vide → brouillon accepté", r.status_code, 201)
    ck("  soumission → 422", c.post(
       f"/reports/{r.json()['id']}/submit", headers=educ).status_code, 422)

    # ── PDF : indisponible avant validation ──
    ck("Rapport encore draft → invisible au parent → 404", c.get(
       f"/reports/mine/{rid}/pdf", headers=par).status_code, 404)

    # ── Cycle complet jusqu'à validation ──
    c.post(f"/reports/{rid}/submit", headers=educ)
    c.post(f"/reports/{rid}/validate", headers=adm)

    # ── PDF côté parent (annuel, validé) ──
    r = c.get(f"/reports/mine/{rid}/pdf", headers=par)
    ck("Téléchargement PDF → 200", r.status_code, 200)
    ck("  Content-Type = application/pdf", r.headers.get("content-type"), "application/pdf")
    ck("  Signature PDF (%PDF-)", r.content[:5], b"%PDF-")
    ck("  Contenu non vide", len(r.content) > 500, True)
    ck("  Content-Disposition attachment", "attachment" in r.headers.get("content-disposition", ""), True)

    # ── PDF : réservé au parent (pas staff/admin) ──
    r_staff = c.get(f"/reports/mine/{rid}/pdf", headers=educ)
    ck("Token staff sur /mine/pdf → 403 (pas un parent)", r_staff.status_code, 403)

    # ── PDF : indisponible pour quotidien/bi_mensuel ──
    c.post(f"/reports/settings/departments/{did}/types/quotidien", headers=adm)
    rq = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
                "reference_date": "2026-02-01", "content": {
                    "health_status": "bien", "breakfast": "bien_mange",
                    "lunch": "bien_mange", "snack": "bien_mange", "nap": False,
                    "bath": True, "poop": True, "moods": ["joyeux"],
                    "activities": ["Jeux"], "behaviors": ["pleasant_day"]}}, headers=educ)
    rqid = rq.json()["id"]
    c.post(f"/reports/{rqid}/submit", headers=educ)
    c.post(f"/reports/{rqid}/validate", headers=adm)
    r_wrong = c.get(f"/reports/mine/{rqid}/pdf", headers=par)
    ck("PDF sur quotidien → 422", r_wrong.status_code, 422)
