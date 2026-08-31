"""E2E rapports : types par département, workflow soumission/validation/rejet,
isolation par groupe, auto-publication admin, portail parent."""
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

VALID_CONTENT = {
    "health_status": "bien", "breakfast": "bien_mange", "lunch": "bien_mange",
    "snack": "bien_mange", "nap": True, "nap_duration_minutes": 60,
    "bath": True, "poop": True, "moods": ["joyeux"], "activities": "Jeux calmes.",
    "behaviors": ["pleasant_day"],
}


def onboard_staff(c, adm, email, stype="educateur", nick="Educ"):
    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": nick,
           "phone": "+229", "email": email, "password": "Staff2026",
           "staff_type": stype}, headers=adm)
    h = login(c, email, "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h)
    return login(c, email, "StaffNew2026")


def test_reports_workflow(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    adm_b = onboard(c, su, "AUTRE", "admin@b.fr")

    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    did = dep["id"]
    sec = c.post("/sections", json={"department_id": did, "name": "PS"}, headers=adm).json()
    sid = sec["id"]

    onboard_staff(c, adm, "educ1@a.fr", nick="Tata Un")
    onboard_staff(c, adm, "educ2@a.fr", nick="Tata Deux")
    educ1_id = c.get("/staff?search=educ1@a.fr", headers=adm).json()["items"][0]["id"]

    # Les éducatrices doivent recevoir reports:write/read via RBAC — la
    # permission RBAC et la restriction "enfants de son groupe" sont deux
    # contrôles indépendants et cumulatifs.
    educ2_id = c.get("/staff?search=educ2@a.fr", headers=adm).json()["items"][0]["id"]
    writer_role = c.post("/rbac/roles", json={"name": "Rédactrice de rapports",
                 "permissions": ["reports:read", "reports:write"]}, headers=adm).json()
    c.post(f"/rbac/staff/{educ1_id}/roles/{writer_role['id']}", headers=adm)
    c.post(f"/rbac/staff/{educ2_id}/roles/{writer_role['id']}", headers=adm)
    educ1 = login(c, "educ1@a.fr", "StaffNew2026")
    educ2 = login(c, "educ2@a.fr", "StaffNew2026")

    group = c.post("/groups", json={"section_id": sid, "educatrice_id": educ1_id},
                   headers=adm).json()
    gid = group["id"]

    child = c.post("/children", json={"last_name": "Alpha", "first_names": "E",
                   "birth_date": "2023-01-01", "admission_date": "2025-01-01",
                   "residence_address": "x", "department_id": did, "section_id": sid,
                   "guardians": [{"last_name": "Alpha",
                   "first_names": "P", "phone": "+229"}]}, headers=adm).json()
    cid = child["id"]
    # L'affectation à un groupe passe par l'endpoint dédié du module organisation.
    c.post(f"/groups/{gid}/children/{cid}", headers=adm)

    c.post("/parents", json={"first_name": "Anaïs", "last_name": "Kossou",
           "nickname": "Maman Anaïs", "phone": "+229 97", "email": "parent@a.fr",
           "password": "Parent2026", "child_ids": [cid]}, headers=adm)
    pl = login(c, "parent@a.fr", "Parent2026")
    c.post("/auth/password-change", json={"current_password": "Parent2026",
           "new_password": "ParentNew2026"}, headers=pl)
    par = login(c, "parent@a.fr", "ParentNew2026")

    # ── Paramètres : types de rapport par département ──
    ck("Aucun type assigné au départ", c.get(
        f"/reports/settings/departments/{did}/types", headers=adm).json(), [])
    ck("Assigner quotidien", c.post(
        f"/reports/settings/departments/{did}/types/quotidien", headers=adm).status_code, 204)
    ck("Assigner annuel", c.post(
        f"/reports/settings/departments/{did}/types/annuel", headers=adm).status_code, 204)
    types = c.get(f"/reports/settings/departments/{did}/types", headers=adm).json()
    ck("2 types assignés", len(types), 2)
    ck("Désassigner annuel", c.request("DELETE",
       f"/reports/settings/departments/{did}/types/annuel", headers=adm).status_code, 204)
    types2 = c.get(f"/reports/settings/departments/{did}/types", headers=adm).json()
    ck("1 type restant (quotidien)", [t["report_type"] for t in types2], ["quotidien"])

    # ── Création par une éducatrice ──
    ck("Educ2 (pas le groupe) → 403", c.post("/reports", json={
       "child_id": cid, "report_type": "quotidien", "reference_date": "2026-07-20",
       "content": VALID_CONTENT}, headers=educ2).status_code, 403)
    r = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
               "reference_date": "2026-07-20", "content": VALID_CONTENT},
               headers=educ1)
    ck("Educ1 (leader du groupe) crée un rapport", r.status_code, 201)
    rep = r.json()
    rid = rep["id"]
    ck("  statut = draft", rep["status"], "draft")
    ck("  period_label calculé", rep["period_label"], "20 juillet 2026")

    ck("Type non assigné (bi_mensuel) → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "bi_mensuel", "reference_date": "2026-07-20",
       "summary": "x"}, headers=educ1).status_code, 422)
    ck("Doublon même période → 409", c.post("/reports", json={
       "child_id": cid, "report_type": "quotidien", "reference_date": "2026-07-20",
       "content": VALID_CONTENT}, headers=educ1).status_code, 409)
    ck("Date future → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "quotidien", "reference_date": "2099-01-01",
       "content": VALID_CONTENT}, headers=educ1).status_code, 422)

    # ── Visibilité scoping par groupe ──
    lst_e1 = c.get("/reports", headers=educ1).json()
    ck("Educ1 voit son rapport", lst_e1["total"], 1)
    lst_e2 = c.get("/reports", headers=educ2).json()
    ck("Educ2 (autre groupe) ne voit rien", lst_e2["total"], 0)
    ck("Educ2 → GET détail → 404", c.get(f"/reports/{rid}", headers=educ2).status_code, 404)
    lst_adm = c.get("/reports", headers=adm).json()
    ck("Admin voit tout", lst_adm["total"], 1)

    # ── Soumission → rejet → modification → resoumission → validation ──
    r = c.post(f"/reports/{rid}/submit", headers=educ1)
    ck("Educ1 soumet", r.status_code, 200)
    ck("  statut = submitted", r.json()["status"], "submitted")
    ck("Resoumission impossible → 409", c.post(
        f"/reports/{rid}/submit", headers=educ1).status_code, 409)
    ck("Modification pendant submitted → 409", c.patch(
        f"/reports/{rid}", json={"summary": "x"}, headers=educ1).status_code, 409)

    par_before = c.get("/reports/mine/list", headers=par).json()
    ck("Parent ne voit rien tant que non validé", par_before["total"], 0)

    r = c.post(f"/reports/{rid}/reject", json={"reason": "Trop court, détaille davantage."},
               headers=adm)
    ck("Admin rejette", r.status_code, 200)
    ck("  statut = rejected", r.json()["status"], "rejected")
    ck("  motif conservé", r.json()["rejected_reason"], "Trop court, détaille davantage.")

    r = c.patch(f"/reports/{rid}", json={
        "summary": "Bonne journée. A bien mangé, fait une longue sieste, joué dehors."},
        headers=educ1)
    ck("Educ1 modifie après rejet", r.status_code, 200)
    r = c.post(f"/reports/{rid}/submit", headers=educ1)
    ck("Educ1 resoumet", r.status_code, 200)
    ck("  motif de rejet effacé", r.json()["rejected_reason"], None)

    ck("Staff sans reports:validate → 403", c.post(
        f"/reports/{rid}/validate", headers=educ2).status_code, 403)
    r = c.post(f"/reports/{rid}/validate", headers=adm)
    ck("Admin valide", r.status_code, 200)
    ck("  statut = validated", r.json()["status"], "validated")

    # ── Portail parent ──
    par_after = c.get("/reports/mine/list", headers=par).json()
    ck("Parent voit le rapport validé", par_after["total"], 1)
    ck("  is_read=False initialement", par_after["items"][0]["is_read"], False)
    detail = c.get(f"/reports/mine/{rid}", headers=par).json()
    ck("Parent lit le détail (summary présent)", "Bonne journée" in detail["summary"], True)
    ck("Parent marque comme lu", c.post(f"/reports/mine/{rid}/read", headers=par).status_code, 204)
    par_read = c.get("/reports/mine/list", headers=par).json()
    ck("  is_read=True après lecture", par_read["items"][0]["is_read"], True)

    # ── Auto-publication admin (pas de détour par la validation) ──
    r = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
               "reference_date": "2026-07-21", "content": VALID_CONTENT},
               headers=adm)
    ck("Admin crée un rapport", r.status_code, 201)
    rid2 = r.json()["id"]
    r = c.post(f"/reports/{rid2}/submit", headers=adm)
    ck("Admin soumet → publié immédiatement", r.status_code, 200)
    ck("  statut = validated directement", r.json()["status"], "validated")
    ck("  validated_by = admin", r.json()["validated_by"]["id"] is not None, True)
    par_list2 = c.get("/reports/mine/list", headers=par).json()
    ck("Parent voit aussi ce rapport", par_list2["total"], 2)

    # ── Isolation établissement B ──
    ck("Admin B ne voit pas le rapport de A → 404", c.get(
        f"/reports/{rid}", headers=adm_b).status_code, 404)
    ck("Admin B ne peut pas valider → 404", c.post(
        f"/reports/{rid2}/validate", headers=adm_b).status_code, 404)

    # ── Suppression (brouillons uniquement) ──
    draft = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
                   "reference_date": "2026-07-22", "content": VALID_CONTENT},
                   headers=educ1).json()
    ck("Suppression d'un brouillon", c.request("DELETE",
       f"/reports/{draft['id']}", headers=educ1).status_code, 204)
    ck("  bien supprimé (404)", c.get(f"/reports/{draft['id']}", headers=educ1).status_code, 404)
    ck("Suppression d'un rapport validé → 409", c.request("DELETE",
       f"/reports/{rid}", headers=adm).status_code, 409)

    # ── Délégation RBAC de la validation ──
    role = c.post("/rbac/roles", json={"name": "Validatrice",
          "permissions": ["reports:read", "reports:write", "reports:validate"]},
          headers=adm).json()
    c.post(f"/rbac/staff/{educ2_id}/roles/{role['id']}", headers=adm)
    educ2b = login(c, "educ2@a.fr", "StaffNew2026")

    # Nouveau rapport côté educ1, soumis, validé par educ2 (déléguée)
    r3 = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
                "reference_date": "2026-07-23", "content": VALID_CONTENT},
                headers=educ1).json()
    c.post(f"/reports/{r3['id']}/submit", headers=educ1)
    r = c.post(f"/reports/{r3['id']}/validate", headers=educ2b)
    ck("Staff délégué (reports:validate) peut valider", r.status_code, 200)
