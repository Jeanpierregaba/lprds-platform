"""E2E rapports : contenu structuré du bi-mensuel, validations, vocabulaire étendu."""
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

FULL_BIMENSUEL = {
    "oral_written_language": "Progrès sur le vocabulaire, reconnaît son prénom écrit.",
    "physical_activities": "Participe activement aux jeux de motricité.",
    "artistic_activities": "Aime le dessin et la peinture au doigt.",
    "math_foundations": "Commence à compter jusqu'à 5.",
    "world_exploration": "Curieux des plantes du jardin pédagogique.",
    "english": "Reconnaît quelques couleurs en anglais.",
    "class_behaviors": ["joyful", "participative", "joyful"],  # doublon volontaire
    "peer_relations": ["sociable", "kind_to_peers", "sociable"],  # doublon
    "emotion_management": ["expresses_better", "autonomous"],
    "teacher_observations": "Belle progression sur la période, continue ainsi.",
}


def test_reports_bimensuel_content(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    did = dep["id"]
    sec = c.post("/sections", json={"department_id": did, "name": "PS"}, headers=adm).json()
    sid = sec["id"]
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
                   "guardians": [{"last_name": "Alpha", "first_names": "P",
                   "phone": "+229"}]}, headers=adm).json()
    cid = child["id"]
    c.post(f"/groups/{group['id']}/children/{cid}", headers=adm)

    # ── Vocabulaire étendu ──
    vocab = c.get("/reports/vocabulary", headers=educ).json()
    ck("8 catégories de vocabulaire", sorted(vocab.keys()), sorted([
       "health_status", "meal_amount", "mood", "behavior_tag",
       "class_behavior", "peer_relation", "emotion_management", "acquisition_level"]))
    ck("9 comportements en classe", len(vocab["class_behavior"]), 9)
    ck("5 relations aux autres", len(vocab["peer_relation"]), 5)
    ck("6 items de gestion des émotions", len(vocab["emotion_management"]), 6)
    ck("Libellé accentué correct", vocab["class_behavior"]["reserved"], "🤐 Réservé(e)")

    # ── Création avec contenu structuré ──
    r = c.post("/reports", json={"child_id": cid, "report_type": "bi_mensuel",
               "reference_date": "2026-07-10", "content": FULL_BIMENSUEL}, headers=educ)
    ck("Création bi-mensuel", r.status_code, 201)
    rep = r.json()
    rid = rep["id"]
    ck("  period_label = 1er quinzaine", rep["period_label"], "1–15 juillet 2026")
    ck("  summary absent (optionnel, contenu structuré)", rep["summary"], None)
    ck("  class_behaviors dédupliqués", rep["content"]["class_behaviors"],
       ["joyful", "participative"])
    ck("  peer_relations dédupliqués", rep["content"]["peer_relations"],
       ["sociable", "kind_to_peers"])

    # ── Validations ──
    ck("Champ texte manquant (english) → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "bi_mensuel", "reference_date": "2026-06-20",
       "content": {k: v for k, v in FULL_BIMENSUEL.items() if k != "english"}},
       headers=educ).status_code, 422)
    ck("class_behaviors vide → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "bi_mensuel", "reference_date": "2026-06-05",
       "content": {**FULL_BIMENSUEL, "class_behaviors": []}},
       headers=educ).status_code, 422)
    ck("Valeur d'enum invalide → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "bi_mensuel", "reference_date": "2026-05-20",
       "content": {**FULL_BIMENSUEL, "peer_relations": ["timide"]}},
       headers=educ).status_code, 422)
    ck("Texte vide (chaîne vide) → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "bi_mensuel", "reference_date": "2026-05-05",
       "content": {**FULL_BIMENSUEL, "teacher_observations": ""}},
       headers=educ).status_code, 422)

    # ── Photos/vidéos (mécanisme générique, déjà validé pour quotidien) ──
    r = c.post(f"/reports/{rid}/attachments",
               files={"file": ("photo.png", PNG, "image/png")}, headers=educ)
    ck("Upload photo sur rapport bi-mensuel", r.status_code, 201)
    detail = c.get(f"/reports/{rid}", headers=educ).json()
    ck("Pièce jointe listée", len(detail["attachments"]), 1)

    # ── Annuel, désormais structuré aussi (cf. test_reports_annuel_content.py) ──
    ck("Annuel sans content structuré → 422", c.post(
       "/reports", json={"child_id": cid, "report_type": "annuel",
       "reference_date": "2026-01-01"}, headers=educ).status_code, 422)
