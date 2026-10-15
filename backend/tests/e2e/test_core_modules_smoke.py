"""
Tests de fumée pour les modules 'de base' (auth, établissements, RBAC,
organisation, enfants, parents, staff, présences, messagerie) — construits
avant les modules Rapports/Galerie/Menus/Blog et jamais portés en scripts E2E
committés jusqu'ici. Objectif : un filet de sécurité minimal (le golden path
de chaque module fonctionne), pas une couverture exhaustive des cas limites
— celle-ci existe déjà côté rapports/galerie/menus/blog.
"""
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


def test_establishment_onboarding_and_admin_cap(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    me = c.get("/auth/me", headers=adm).json()
    ck("Admin bien rattaché à l'établissement", me["role"], "admin")

    ck("Code établissement dupliqué → 409", c.post("/establishments", json={
       "code": "LPRDS", "name": "Doublon", "address": "a", "email": "x@x.fr",
       "phone": "+229", "admin": {"email": "x@a.fr", "first_name": "X",
       "last_name": "Y", "nickname": "Direction", "password": "Creche2026"}}, headers=su).status_code, 409)

    ck("Non-superadmin ne peut pas créer d'établissement → 403", c.post(
       "/establishments", json={"code": "AUTRE2", "name": "N", "address": "a",
       "email": "x@x.fr", "phone": "+229", "admin": {"email": "y@a.fr",
       "first_name": "X", "last_name": "Y", "nickname": "Direction",
       "password": "Creche2026"}},
       headers=adm).status_code, 403)


def test_rbac_roles_and_permissions(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    perms = c.get("/rbac/permissions", headers=adm).json()
    ck("Catalogue de permissions non vide", len(perms) > 0, True)

    role = c.post("/rbac/roles", json={
        "name": "Testeuse", "permissions": ["children:read", "children:write"],
    }, headers=adm).json()
    ck("Rôle créé avec 2 permissions", len(role["permissions"]), 2)

    roles = c.get("/rbac/roles", headers=adm).json()
    ck("Rôle listé", any(r["id"] == role["id"] for r in roles), True)

    updated = c.patch(f"/rbac/roles/{role['id']}", json={
        "permissions": ["children:read"],
    }, headers=adm).json()
    ck("Rôle modifié : 1 permission restante", len(updated["permissions"]), 1)

    ck("Suppression du rôle", c.delete(f"/rbac/roles/{role['id']}", headers=adm).status_code, 204)


def test_organization_hierarchy(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    ck("Département créé", dep["name"], "Maternelle")
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    ck("Section rattachée au département", sec["department_id"], dep["id"])

    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": "Educ",
           "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    educ_id = c.get("/staff?search=educ@a.fr", headers=adm).json()["items"][0]["id"]
    group = c.post("/groups", json={"section_id": sec["id"], "educatrice_id": educ_id},
                   headers=adm).json()
    ck("Groupe créé, éducatrice assignée", group["educatrice"]["id"], educ_id)

    depts = c.get("/departments", headers=adm).json()
    ck("Département listé", any(d["id"] == dep["id"] for d in depts), True)


def test_children_and_guardians(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()

    child = c.post("/children", json={
        "last_name": "Alpha", "first_names": "Emma", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Alpha", "first_names": "P", "phone": "+229"}],
    }, headers=adm).json()
    ck("Enfant créé avec matricule", child["matricule"].startswith("LPRDS-"), True)
    ck("1 tuteur enregistré", len(child["guardians"]), 1)

    detail = c.get(f"/children/{child['id']}", headers=adm).json()
    ck("Détail enfant cohérent", detail["last_name"], "Alpha")

    upd = c.patch(f"/children/{child['id']}", json={"residence_address": "nouvelle adresse"},
                  headers=adm).json()
    ck("Modification de l'adresse", upd["residence_address"], "nouvelle adresse")

    ck("Désactivation (soft) de la fiche", c.patch(
       f"/children/{child['id']}/status", json={"is_active": False},
       headers=adm).json()["is_active"], False)


def test_parents_portal_access(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    child = c.post("/children", json={
        "last_name": "Alpha", "first_names": "Emma", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Alpha", "first_names": "P", "phone": "+229"}],
    }, headers=adm).json()

    r = c.post("/parents", json={"first_name": "Anaïs", "last_name": "Kossou",
           "nickname": "Maman Anaïs", "phone": "+229 97", "email": "parent@a.fr",
           "password": "Parent2026", "child_ids": [child["id"]]}, headers=adm)
    ck("Parent créé", r.status_code, 201)
    parent_id = r.json()["id"]
    ck("Enfant assigné dès la création (vue admin)", any(
       ch["id"] == child["id"] for ch in r.json()["assigned_children"]), True)

    pl = login(c, "parent@a.fr", "Parent2026")
    ck("Doit changer son mot de passe temporaire", c.get(
       "/children", headers=pl).status_code, 403)
    c.post("/auth/password-change", json={"current_password": "Parent2026",
           "new_password": "ParentNew2026"}, headers=pl)
    par = login(c, "parent@a.fr", "ParentNew2026")

    me = c.get("/auth/me", headers=par).json()
    ck("Le parent connecté a bien le rôle parent", me["role"], "parent")
    detail = c.get(f"/parents/{parent_id}", headers=adm).json()
    ck("L'admin retrouve l'enfant assigné au parent", detail["assigned_children"][0]["id"],
       child["id"])


def test_staff_lifecycle(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    r = c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": "Educ",
           "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    ck("Staff créé", r.status_code, 201)
    staff_id = r.json()["id"]

    listed = c.get("/staff?staff_type=educateur", headers=adm).json()
    ck("Filtre par staff_type", any(s["id"] == staff_id for s in listed["items"]), True)

    c.patch(f"/staff/{staff_id}/status", json={"is_active": False}, headers=adm)
    deactivated = c.get(f"/staff/{staff_id}", headers=adm).json()
    ck("Désactivation du compte staff", deactivated["is_active"], False)

    ck("Compte désactivé ne peut plus se connecter (403)", c.post(
       "/auth/login", json={"email": "educ@a.fr", "password": "Staff2026"}
       ).status_code, 403)


def test_attendance_qr_scan(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    child = c.post("/children", json={
        "last_name": "Alpha", "first_names": "Emma", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Alpha", "first_names": "P", "phone": "+229"}],
    }, headers=adm).json()

    qr = c.get(f"/attendance/qrcode/child/{child['id']}", headers=adm).json()
    ck("QR payload généré", "qr_payload" in qr, True)

    arrival = c.post("/attendance/scan", json={
        "qr_payload": qr["qr_payload"], "event_type": "arrival"}, headers=adm)
    ck("Scan d'arrivée enregistré", arrival.status_code, 201)

    events = c.get(f"/attendance/events?child_id={child['id']}", headers=adm).json()
    ck("1 évènement de présence enregistré", events["total"], 1)


def test_attendance_qr_verify(client):
    """Le endpoint /attendance/scan/verify valide le QR sans créer d'événement et
    renseigne l'état du jour (déjà arrivé/parti/cantine) pour suggérer le
    bon type de scan côté frontend."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    child = c.post("/children", json={
        "last_name": "Beta", "first_names": "Lina", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Beta", "first_names": "P", "phone": "+229"}],
    }, headers=adm).json()
    staff = c.post("/staff", json={"first_name": "S", "last_name": "T",
                   "nickname": "Tata Stella", "phone": "+229", "email": "stella@a.fr",
                   "password": "Staff2026", "staff_type": "educateur"}, headers=adm).json()

    qr_child = c.get(f"/attendance/qrcode/child/{child['id']}", headers=adm).json()
    qr_staff = c.get(f"/attendance/qrcode/staff/{staff['id']}", headers=adm).json()

    # Aucun scan du jour → état vierge.
    v = c.post("/attendance/scan/verify", json={"qr_payload": qr_child["qr_payload"]}, headers=adm)
    ck("Vérification enfant 200", v.status_code, 200)
    vj = v.json()
    ck("Type de personne enfant", vj["person_type"], "child")
    ck("Nom affiché enfant (prénoms + nom)", vj["display_name"], "Lina Beta")
    ck("Matricule enfant fourni", vj["matricule"], child["matricule"])
    ck("Enfant pas encore arrivé", vj["has_arrived"], False)
    ck("Enfant pas encore parti", vj["has_departed"], False)
    ck("Enfant sans cantine", vj["has_meal"], False)

    vs = c.post("/attendance/scan/verify", json={"qr_payload": qr_staff["qr_payload"]}, headers=adm)
    ck("Vérification staff 200", vs.status_code, 200)
    vsj = vs.json()
    ck("Type de personne staff", vsj["person_type"], "staff")
    ck("Nom affiché staff (surnom)", vsj["display_name"], "Tata Stella")

    # Après une arrivée enfant, l'état bascule.
    arrival = c.post("/attendance/scan",
                     json={"qr_payload": qr_child["qr_payload"], "event_type": "arrival"},
                     headers=adm)
    ck("Scan d'arrivée enregistré", arrival.status_code, 201)
    v2 = c.post("/attendance/scan/verify", json={"qr_payload": qr_child["qr_payload"]}, headers=adm).json()
    ck("Enfant déjà arrivé après scan", v2["has_arrived"], True)
    ck("Enfant pas encore parti", v2["has_departed"], False)

    # La vérification ne crée AUCUN événement (append-only préservé).
    events = c.get(f"/attendance/events?child_id={child['id']}", headers=adm).json()
    ck("La vérification n'écrit rien (1 scan seulement)", events["total"], 1)

    # QR invalide → 422 (token chiffré illisible), aucun événement créé.
    bad = c.post("/attendance/scan/verify", json={"qr_payload": "invalid-token"}, headers=adm)
    ck("QR invalide → 422", bad.status_code, 422)
    events2 = c.get(f"/attendance/events?child_id={child['id']}", headers=adm).json()
    ck("Vérification invalide n'écrit rien non plus", events2["total"], 1)


def test_messaging_announcement_and_conversation(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    child = c.post("/children", json={
        "last_name": "Alpha", "first_names": "Emma", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Alpha", "first_names": "P", "phone": "+229"}],
    }, headers=adm).json()
    c.post("/parents", json={"first_name": "Anaïs", "last_name": "Kossou",
           "nickname": "Maman Anaïs", "phone": "+229 97", "email": "parent@a.fr",
           "password": "Parent2026", "child_ids": [child["id"]]}, headers=adm)
    pl = login(c, "parent@a.fr", "Parent2026")
    c.post("/auth/password-change", json={"current_password": "Parent2026",
           "new_password": "ParentNew2026"}, headers=pl)
    par = login(c, "parent@a.fr", "ParentNew2026")

    ann = c.post("/messaging/announcements", json={
        "title": "Bienvenue", "body": "Rentrée le 1er septembre."}, headers=adm)
    ck("Diffusion créée", ann.status_code, 201)
    seen = c.get("/messaging/announcements", headers=par).json()
    ck("Parent voit la diffusion", seen["total"], 1)

    msg = c.post("/messaging/conversations/me/messages",
                 json={"body": "Bonjour, une question sur les horaires."}, headers=par)
    ck("Message privé envoyé par le parent", msg.status_code, 201)

    # Un membre du staff (sans rôle admin/parent) n'a jamais accès à la
    # messagerie — hors RBAC, cf. claude.md.
    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": "Educ",
           "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    h = login(c, "educ@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h)
    educ = login(c, "educ@a.fr", "StaffNew2026")
    ck("Staff (même admin de fiche) exclu de la messagerie → 403", c.get(
       "/messaging/conversations", headers=educ).status_code, 403)


def test_report_attachment_upload_still_reachable_for_regression(client):
    """Filet minimal côté rapports pour confirmer que le montage de base
    (upload de fichier générique via storage.py) fonctionne toujours dans cet
    environnement de test — couverture détaillée dans test_reports_*.py."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    c.post(f"/reports/settings/departments/{dep['id']}/types/quotidien", headers=adm)
    child = c.post("/children", json={
        "last_name": "Alpha", "first_names": "Emma", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Alpha", "first_names": "P", "phone": "+229"}],
    }, headers=adm).json()

    rep = c.post("/reports", json={"child_id": child["id"], "report_type": "quotidien",
                 "content": {
                     "health_status": "bien", "breakfast": "bien_mange",
                     "lunch": "bien_mange", "snack": "bien_mange", "nap": False,
                     "bath": True, "poop": True, "moods": ["joyeux"],
                     "activities": ["Jeux"], "behaviors": ["pleasant_day"]}},
                 headers=adm).json()
    up = c.post(f"/reports/{rep['id']}/attachments",
               files={"file": ("photo.png", PNG, "image/png")}, headers=adm)
    ck("Upload de pièce jointe fonctionnel (storage.py)", up.status_code, 201)
