"""E2E enfants : documents du dossier d'inscription (upload en deux temps,
téléchargement authentifié, suppression, PBAC et isolation)."""
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

PDF = b"%PDF-1.4 fake content"


def test_child_documents(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    child = c.post("/children", json={"last_name": "Alpha", "first_names": "Emma",
                   "birth_date": "2023-01-01", "admission_date": "2025-01-01",
                   "residence_address": "x",
                   "guardians": [{"last_name": "Alpha", "first_names": "P",
                                  "phone": "+229"}]}, headers=adm)
    ck("Création enfant", child.status_code, 201)
    cid = child.json()["id"]
    ck("Aucun document au départ", child.json()["documents"], [])

    # ── Upload en deux temps (la fiche existe déjà) ──
    r = c.post(f"/children/{cid}/documents",
               files={"file": ("acte_naissance.pdf", PDF, "application/pdf")},
               headers=adm)
    ck("Upload PDF", r.status_code, 201)
    doc = r.json()
    ck("  filename conservé", doc["filename"], "acte_naissance.pdf")
    ck("  content_type", doc["content_type"], "application/pdf")
    ck("  size_bytes exact", doc["size_bytes"], len(PDF))
    ck("  url de téléchargement authentifié", doc["url"],
       f"/api/v1/children/{cid}/documents/{doc['id']}")

    r = c.post(f"/children/{cid}/documents",
               files={"file": ("photo_enfant.png", PNG, "image/png")}, headers=adm)
    ck("Upload PNG", r.status_code, 201)
    png_doc = r.json()

    detail = c.get(f"/children/{cid}", headers=adm).json()
    ck("Les 2 documents apparaissent sur la fiche",
       len(detail["documents"]), 2)
    ck("  url présent dans le détail",
       detail["documents"][0]["url"], f"/api/v1/children/{cid}/documents/{doc['id']}")

    # ── Téléchargement authentifié ──
    dl = c.get(f"/children/{cid}/documents/{doc['id']}", headers=adm)
    ck("Téléchargement (admin)", dl.status_code, 200)
    ck("  contenu identique", dl.content, PDF)
    ck("  media_type", dl.headers.get("content-type").split(";")[0], "application/pdf")

    ck("Sans jeton → 403 (HTTPBearer auto_error)", c.get(
        f"/children/{cid}/documents/{doc['id']}").status_code, 403)
    ck("Jeton invalide → 401", c.get(f"/children/{cid}/documents/{doc['id']}",
       headers={"Authorization": "Bearer token.invalide"}).status_code, 401)

    # ── Validations (mêmes règles que les autres modules) ──
    ck("Type non autorisé (vidéo) → 422", c.post(f"/children/{cid}/documents",
       files={"file": ("video.mp4", b"fake", "video/mp4")},
       headers=adm).status_code, 422)
    ck("Fichier vide → 422", c.post(f"/children/{cid}/documents",
       files={"file": ("vide.pdf", b"", "application/pdf")},
       headers=adm).status_code, 422)
    big = b"x" * (11 * 1024 * 1024)  # 11 Mo > limite par défaut (children_max_attachment_mb=10)
    ck("Fichier trop volumineux → 413", c.post(f"/children/{cid}/documents",
       files={"file": ("gros.pdf", big, "application/pdf")},
       headers=adm).status_code, 413)

    # ── RBAC : un staff en lecture seule télécharge mais n'upload pas ──
    c.post("/staff", json={"first_name": "L", "last_name": "S", "nickname": "Secrétaire",
           "phone": "+229", "email": "secretaire@a.fr", "password": "Staff2026",
           "staff_type": "secretaire"}, headers=adm)
    h = login(c, "secretaire@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h)
    sec_id = c.get("/staff?search=secretaire@a.fr", headers=adm).json()["items"][0]["id"]
    role = c.post("/rbac/roles", json={"name": "Lecture seule",
          "permissions": ["children:read"]}, headers=adm).json()
    c.post(f"/rbac/staff/{sec_id}/roles/{role['id']}", headers=adm)
    sec = login(c, "secretaire@a.fr", "StaffNew2026")

    ck("Lecture seule peut télécharger", c.get(
        f"/children/{cid}/documents/{doc['id']}", headers=sec).status_code, 200)
    ck("Lecture seule ne peut PAS uploader → 403", c.post(f"/children/{cid}/documents",
       files={"file": ("autre.pdf", PDF, "application/pdf")},
       headers=sec).status_code, 403)
    ck("Lecture seule ne peut PAS supprimer → 403", c.delete(
        f"/children/{cid}/documents/{doc['id']}", headers=sec).status_code, 403)

    # ── Suppression (fichier + ligne) ──
    ck("Suppression", c.delete(f"/children/{cid}/documents/{doc['id']}",
       headers=adm).status_code, 204)
    ck("Téléchargement après suppression → 404", c.get(
        f"/children/{cid}/documents/{doc['id']}", headers=adm).status_code, 404)
    detail2 = c.get(f"/children/{cid}", headers=adm).json()
    ck("Il reste 1 document sur la fiche", len(detail2["documents"]), 1)
    ck("  c'est le PNG", detail2["documents"][0]["id"], png_doc["id"])

    # ── Isolation multi-établissement ──
    adm2 = onboard(c, su, "KIDS", "admin2@a.fr")
    ck("Document d'un autre établissement → 404", c.get(
        f"/children/{cid}/documents/{png_doc['id']}", headers=adm2).status_code, 404)
    ck("Upload sur enfant d'un autre établissement → 404", c.post(
        f"/children/{cid}/documents",
        files={"file": ("x.pdf", PDF, "application/pdf")},
        headers=adm2).status_code, 404)