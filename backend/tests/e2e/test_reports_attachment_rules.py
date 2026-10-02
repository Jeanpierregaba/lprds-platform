"""E2E rapports : qui peut poser une photo, et à quel moment.

Deux bugs rapportés par l'établissement sont verrouillés ici :

  1. « Maîtresse Juli n'arrive pas à ajouter les photos à ses rapports, moi
     (admin) j'y arrive. » — ce n'est pas son compte : une éducatrice ne peut
     plus toucher un rapport qu'elle a SOUMIS, l'admin si. L'interface lui
     montrait pourtant le bouton, d'où un refus incompréhensible.
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


def test_educatrice_loses_her_photos_once_submitted(client):
    """Le périmètre réel derrière « Juli n'y arrive pas ».

    Son compte n'a rien d'anormal : en BROUILLON elle pose ses photos sans
    difficulté. C'est la SOUMISSION qui lui retire la main — et l'admin, lui,
    passe à tout statut. D'où l'asymétrie observée depuis l'établissement.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    educ, child_id = _setup(c, adm)

    report = c.post("/reports", json={"child_id": child_id, "report_type": "quotidien",
                    "reference_date": "2026-07-20", "content": CONTENT}, headers=educ).json()
    rid = report["id"]

    ck("brouillon : l'éducatrice pose sa photo", _photo(c, rid, educ).status_code, 201)

    c.post(f"/reports/{rid}/submit", headers=educ)
    refused = _photo(c, rid, educ)
    ck("soumis : elle est refusée", refused.status_code, 409)
    ck("  et l'admin, lui, passe", _photo(c, rid, adm).status_code, 201)

    # Le rejet lui rend la main : c'est le chemin de rattrapage existant.
    c.post(f"/reports/{rid}/reject", json={"reason": "Ajoute les photos"}, headers=adm)
    ck("rejeté : elle repose une photo", _photo(c, rid, educ).status_code, 201)


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
