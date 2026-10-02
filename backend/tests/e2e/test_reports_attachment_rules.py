"""E2E rapports : qui peut poser une photo, et à quel moment.

Deux bugs rapportés par l'établissement sont verrouillés ici :

  1. « Maîtresse Juli n'arrive pas à ajouter les photos à ses rapports, moi
     (admin) j'y arrive. » — ce n'était pas son compte : la règle d'origine
     arrêtait le staff au brouillon et au rejeté, et l'interface lui montrait
     quand même le bouton. Sur décision de l'utilisateur, le SOUMIS lui est
     désormais ouvert (photos et texte) ; la limite se place à la VALIDATION,
     le moment où le parent reçoit le rapport.
  2. « J'ai voulu enregistrer les modifications et ça a validé le rapport. » —
     côté API, `submit` appelé par un admin publie au parent dans la foulée
     (décision assumée). Ce qui manquait, c'est que la réponse le DISE, pour
     que l'interface ne puisse plus annoncer « soumis » sur un rapport publié.
"""
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

CONTENT = {
    "health_status": "bien",
    "breakfast": "bien_mange", "lunch": "bien_mange", "snack": "bien_mange",
    "nap": False, "bath": True, "poop": True,
    "moods": ["joyeux"], "activities": ["Peinture"], "behaviors": ["pleasant_day"],
}


def _setup(c, adm):
    """Une éducatrice, son groupe, un enfant dedans."""
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    c.post(f"/reports/settings/departments/{dep['id']}/types/quotidien", headers=adm)

    c.post("/staff", json={"first_name": "Juli", "last_name": "T", "nickname": "Maîtresse Juli",
           "phone": "+229", "email": "juli@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    educ_id = c.get("/staff?search=juli@a.fr", headers=adm).json()["items"][0]["id"]
    role = c.post("/rbac/roles", json={"name": "Rédactrice",
                  "permissions": ["reports:read", "reports:write"]}, headers=adm).json()
    c.post(f"/rbac/staff/{educ_id}/roles/{role['id']}", headers=adm)
    educ = login(c, "juli@a.fr", "Staff2026")

    gid = c.post("/groups", json={"section_id": sec["id"], "educatrice_id": educ_id},
                 headers=adm).json()["id"]
    child = c.post("/children", json={"last_name": "Dossou", "first_names": "Jeremy",
                   "birth_date": "2022-05-05", "admission_date": "2026-09-01",
                   "residence_address": "Lomé", "department_id": dep["id"],
                   "section_id": sec["id"], "guardians": []}, headers=adm).json()
    c.post(f"/groups/{gid}/children/{child['id']}", headers=adm)
    return educ, child["id"]


def _photo(c, report_id, headers):
    return c.post(f"/reports/{report_id}/attachments",
                  files={"file": ("photo.png", PNG, "image/png")}, headers=headers)


def test_educatrice_keeps_her_report_until_it_is_validated(client):
    """La frontière est la VALIDATION, pas la soumission.

    Les photos d'une journée arrivent souvent après la rédaction : s'arrêter à
    la soumission obligeait à faire rejeter le rapport pour chaque photo
    oubliée. Tant que le rapport n'est pas validé, le parent ne l'a pas vu —
    rien ne lui échappe. Une fois validé, modifier reviendrait à changer sous
    ses yeux ce qu'il a déjà lu, sans qu'il en soit prévenu : c'est là que la
    main lui est retirée, et l'admin seul passe encore.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    educ, child_id = _setup(c, adm)

    rid = c.post("/reports", json={"child_id": child_id, "report_type": "quotidien",
                 "reference_date": "2026-07-20", "content": CONTENT}, headers=educ).json()["id"]

    ck("brouillon : elle pose sa photo", _photo(c, rid, educ).status_code, 201)

    c.post(f"/reports/{rid}/submit", headers=educ)
    ck("SOUMIS : elle pose encore sa photo", _photo(c, rid, educ).status_code, 201)
    edited = c.patch(f"/reports/{rid}",
                     json={"content": {**CONTENT, "highlight": "A chanté toute la matinée"}},
                     headers=educ)
    ck("  et corrige encore son texte", edited.status_code, 200)
    ck("  texte bien enregistré", edited.json()["content"]["highlight"],
       "A chanté toute la matinée")

    # Elle ne resoumet pas pour autant : la décision reste au validateur.
    ck("  resoumettre refusé", c.post(f"/reports/{rid}/submit", headers=educ).status_code, 409)

    c.post(f"/reports/{rid}/validate", headers=adm)
    ck("VALIDÉ : elle est refusée", _photo(c, rid, educ).status_code, 409)
    ck("  son texte aussi", c.patch(f"/reports/{rid}", json={"content": CONTENT},
                                    headers=educ).status_code, 409)
    ck("  l'admin, lui, passe encore", _photo(c, rid, adm).status_code, 201)


def test_rejected_report_stays_editable(client):
    """Le rejet n'a pas été perdu en chemin : il rend la main comme avant."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    educ, child_id = _setup(c, adm)

    rid = c.post("/reports", json={"child_id": child_id, "report_type": "quotidien",
                 "reference_date": "2026-07-23", "content": CONTENT}, headers=educ).json()["id"]
    c.post(f"/reports/{rid}/submit", headers=educ)
    c.post(f"/reports/{rid}/reject", json={"reason": "Ajoute les photos"}, headers=adm)
    ck("rejeté : elle repose une photo", _photo(c, rid, educ).status_code, 201)
    ck("  et peut resoumettre", c.post(f"/reports/{rid}/submit", headers=educ).status_code, 200)


def test_admin_submit_says_it_published(client):
    """⚠️ `submit` par un ADMIN valide et publie au parent dans le même appel.

    C'est voulu — personne n'est au-dessus de l'admin pour approuver son propre
    rapport. Mais la réponse doit le dire : l'interface annonçait « Rapport
    soumis » sur un rapport déjà parti chez le parent, et c'est précisément ce
    qui a surpris l'établissement (« ça a validé automatiquement »).
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    educ, child_id = _setup(c, adm)

    created = c.post("/reports", json={"child_id": child_id, "report_type": "quotidien",
                     "reference_date": "2026-07-21", "content": CONTENT}, headers=adm).json()
    out = c.post(f"/reports/{created['id']}/submit", headers=adm)
    ck("statut renvoyé : validé, pas soumis", out.json()["status"], "validated")
    ck("  et daté comme tel", bool(out.json()["validated_at"]), True)

    # Une éducatrice, elle, s'arrête bien à « soumis ».
    created = c.post("/reports", json={"child_id": child_id, "report_type": "quotidien",
                     "reference_date": "2026-07-22", "content": CONTENT}, headers=educ).json()
    out = c.post(f"/reports/{created['id']}/submit", headers=educ)
    ck("éducatrice : soumis, en attente", out.json()["status"], "submitted")
    ck("  jamais validé au passage", out.json()["validated_at"], None)
