"""E2E galerie : agrégation rapports + messagerie, filtres, isolation RBAC."""
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

QUOTIDIEN_CONTENT = {
    "health_status": "bien", "breakfast": "bien_mange", "lunch": "bien_mange",
    "snack": "bien_mange", "nap": False, "bath": True, "poop": True,
    "moods": ["joyeux"], "activities": ["Jeux"], "behaviors": ["pleasant_day"],
}


def test_gallery(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    did = dep["id"]
    sec = c.post("/sections", json={"department_id": did, "name": "PS"}, headers=adm).json()
    sid = sec["id"]
    c.post(f"/reports/settings/departments/{did}/types/quotidien", headers=adm)

    # educ1 : gallery:read + reports:read/write (peut lister ET télécharger)
    c.post("/staff", json={"first_name": "E", "last_name": "Un", "nickname": "Educ1",
           "phone": "+229", "email": "educ1@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    h1 = login(c, "educ1@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h1)
    educ1_id = c.get("/staff?search=educ1@a.fr", headers=adm).json()["items"][0]["id"]
    role1 = c.post("/rbac/roles", json={"name": "Galerie+Rapports",
          "permissions": ["gallery:read", "reports:read", "reports:write"]},
          headers=adm).json()
    c.post(f"/rbac/staff/{educ1_id}/roles/{role1['id']}", headers=adm)
    educ1 = login(c, "educ1@a.fr", "StaffNew2026")

    # educ2 : reports:write seulement (pas gallery:read) → 403 sur la galerie
    c.post("/staff", json={"first_name": "E", "last_name": "Deux", "nickname": "Educ2",
           "phone": "+229", "email": "educ2@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    h2 = login(c, "educ2@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h2)
    educ2_id = c.get("/staff?search=educ2@a.fr", headers=adm).json()["items"][0]["id"]
    role2 = c.post("/rbac/roles", json={"name": "RapportsSeul",
          "permissions": ["reports:read", "reports:write"]}, headers=adm).json()
    c.post(f"/rbac/staff/{educ2_id}/roles/{role2['id']}", headers=adm)
    educ2 = login(c, "educ2@a.fr", "StaffNew2026")

    # educ3 : gallery:read SANS reports:read → liste ok, téléchargement 403.
    # staff_type=secretaire (pas educateur) : sinon le rôle socle automatique
    # (cf. app/modules/rbac/service.py::ensure_educatrice_baseline_role)
    # accorderait reports:read/write d'office et casserait le scénario.
    c.post("/staff", json={"first_name": "E", "last_name": "Trois", "nickname": "Educ3",
           "phone": "+229", "email": "educ3@a.fr", "password": "Staff2026",
           "staff_type": "secretaire"}, headers=adm)
    h3 = login(c, "educ3@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h3)
    educ3_id = c.get("/staff?search=educ3@a.fr", headers=adm).json()["items"][0]["id"]
    role3 = c.post("/rbac/roles", json={"name": "GalerieSeule",
          "permissions": ["gallery:read"]}, headers=adm).json()
    c.post(f"/rbac/staff/{educ3_id}/roles/{role3['id']}", headers=adm)
    educ3 = login(c, "educ3@a.fr", "StaffNew2026")

    group = c.post("/groups", json={"section_id": sid, "educatrice_id": educ1_id},
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

    # ── Média n°1 : photo de rapport (educ1) ──
    rep = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
                 "reference_date": "2026-07-20", "content": QUOTIDIEN_CONTENT},
                 headers=educ1).json()
    rid = rep["id"]
    c.post(f"/reports/{rid}/attachments",
          files={"file": ("photo_rapport.png", PNG, "image/png")}, headers=educ1)

    # ── Média n°2 : photo de message privé (parent → admin) ──
    msg = c.post("/messaging/conversations/me/messages",
                 json={"body": "Voici une photo de notre weekend !"}, headers=par).json()
    c.post(f"/messaging/conversations/me/messages/{msg['id']}/attachments",
          files={"file": ("photo_message.png", PNG, "image/png")}, headers=par)

    # ── Média (exclu) : photo de diffusion (announcement) ──
    ann = c.post("/messaging/announcements", json={
        "title": "Journée portes ouvertes", "body": "Photos de l'événement"},
        headers=adm).json()
    c.post(f"/messaging/announcements/{ann['id']}/attachments",
          files={"file": ("photo_diffusion.png", PNG, "image/png")}, headers=adm)

    # ── Vue admin : agrégation complète ──
    g_all = c.get("/gallery/media", headers=adm).json()
    ck("Admin : 2 médias (rapport + message, PAS la diffusion)", g_all["total"], 2)
    sources = sorted(i["source"] for i in g_all["items"])
    ck("  1 report + 1 message", sources, ["message", "report"])

    g_report = c.get("/gallery/media?source=report", headers=adm).json()
    ck("Admin filtré source=report", g_report["total"], 1)
    ck("  bon enfant attaché", g_report["items"][0]["child"]["id"], cid)
    ck("  report_type=quotidien", g_report["items"][0]["report_type"], "quotidien")

    g_message = c.get("/gallery/media?source=message", headers=adm).json()
    ck("Admin filtré source=message", g_message["total"], 1)
    ck("  conversation_parent = la maman", g_message["items"][0]["conversation_parent"]["nickname"],
       "Maman Anaïs")

    g_by_child = c.get(f"/gallery/media?child_id={cid}", headers=adm).json()
    ck("Filtre par enfant → exclut la messagerie", g_by_child["total"], 1)
    ck("  c'est bien le média du rapport", g_by_child["items"][0]["source"], "report")

    g_by_group = c.get(f"/gallery/media?group_id={group['id']}", headers=adm).json()
    ck("Filtre par groupe → 1 (rapport)", g_by_group["total"], 1)

    g_by_staff = c.get(f"/gallery/media?staff_id={educ1_id}", headers=adm).json()
    ck("Filtre par éducatrice (auteur upload) → 1", g_by_staff["total"], 1)

    g_by_dept = c.get(f"/gallery/media?department_id={did}", headers=adm).json()
    ck("Filtre par département → 1", g_by_dept["total"], 1)

    g_by_type = c.get("/gallery/media?report_type=bi_mensuel", headers=adm).json()
    ck("Filtre report_type ne correspondant à rien → 0", g_by_type["total"], 0)

    g_by_date = c.get("/gallery/media?date_from=2099-01-01", headers=adm).json()
    ck("Filtre date_from dans le futur → 0", g_by_date["total"], 0)

    # ── Vue staff délégué (educ1 : gallery:read + reports:read) ──
    g_educ1 = c.get("/gallery/media", headers=educ1).json()
    ck("Educ1 : ne voit QUE les rapports (jamais la messagerie)", g_educ1["total"], 1)
    ck("  source=report", g_educ1["items"][0]["source"], "report")
    forbidden_msg = c.get("/gallery/media?source=message", headers=educ1)
    ck("Educ1 → source=message explicite → 403", forbidden_msg.status_code, 403)

    dl_url = g_educ1["items"][0]["url"]
    dl = c.get(dl_url.replace("/api/v1", ""), headers=educ1)
    ck("Educ1 télécharge via l'URL de la galerie (reports:read présent)", dl.status_code, 200)

    # ── Vue staff sans gallery:read (educ2) ──
    forbidden_all = c.get("/gallery/media", headers=educ2)
    ck("Educ2 (pas de gallery:read) → 403", forbidden_all.status_code, 403)

    # ── Vue staff avec gallery:read mais SANS reports:read (educ3) ──
    g_educ3 = c.get("/gallery/media", headers=educ3).json()
    ck("Educ3 : liste quand même visible (gallery:read seul suffit)", g_educ3["total"], 1)
    dl3 = c.get(g_educ3["items"][0]["url"].replace("/api/v1", ""), headers=educ3)
    ck("  mais téléchargement 403 (reports:read manquant)", dl3.status_code, 403)

    # ── Vue parent : avant validation du rapport ──
    g_par_before = c.get("/gallery/mine", headers=par).json()
    ck("Parent avant validation : seulement le message (pas le rapport draft)",
       g_par_before["total"], 1)
    ck("  source=message", g_par_before["items"][0]["source"], "message")
    ck("  pas de conversation_parent exposé côté parent",
       g_par_before["items"][0]["conversation_parent"], None)

    c.post(f"/reports/{rid}/submit", headers=educ1)
    c.post(f"/reports/{rid}/validate", headers=adm)

    # ── Vue parent : après validation ──
    g_par_after = c.get("/gallery/mine", headers=par).json()
    ck("Parent après validation : 2 médias", g_par_after["total"], 2)

    g_par_child = c.get(f"/gallery/mine?child_id={cid}", headers=par).json()
    ck("Parent filtré par enfant → exclut le message", g_par_child["total"], 1)
    ck("  source=report", g_par_child["items"][0]["source"], "report")

    for item in g_par_after["items"]:
        dl = c.get(item["url"].replace("/api/v1", ""), headers=par)
        ck(f"Parent télécharge son média ({item['source']}) → 200", dl.status_code, 200)

    # ── Isolation étab B ──
    adm_b = onboard(c, su, "AUTRE", "admin@b.fr")
    g_b = c.get("/gallery/media", headers=adm_b).json()
    ck("Admin B ne voit rien de l'étab A", g_b["total"], 0)
