"""E2E blog : étiquettes, workflow brouillon/publication, image à la une,
médias, soft delete, accès public (site vitrine, sans authentification)."""
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


def test_blog(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    c.post("/staff", json={"first_name": "R", "last_name": "Un", "nickname": "Redac1",
           "phone": "+229", "email": "redac1@a.fr", "password": "Staff2026",
           "staff_type": "redacteur"}, headers=adm)
    h1 = login(c, "redac1@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h1)
    redac1_id = c.get("/staff?search=redac1@a.fr", headers=adm).json()["items"][0]["id"]
    role = c.post("/rbac/roles", json={"name": "Rédaction",
          "permissions": ["blog:write"]}, headers=adm).json()
    c.post(f"/rbac/staff/{redac1_id}/roles/{role['id']}", headers=adm)
    redac1 = login(c, "redac1@a.fr", "StaffNew2026")

    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": "Educ",
           "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    h2 = login(c, "educ@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h2)
    educ = login(c, "educ@a.fr", "StaffNew2026")

    # ── Renommage StaffType : community_manager -> redacteur ──
    staff_detail = c.get("/staff?search=redac1@a.fr", headers=adm).json()["items"][0]
    ck("staff_type = redacteur", staff_detail["staff_type"], "redacteur")
    bad_type = c.post("/staff", json={"first_name": "X", "last_name": "Y",
          "nickname": "Z", "phone": "+229", "email": "old@a.fr", "password": "Staff2026",
          "staff_type": "community_manager"}, headers=adm)
    ck("Ancien type community_manager rejeté (422)", bad_type.status_code, 422)

    # ── Étiquettes (créées librement) ──
    ck("Éducatrice sans blog:write → 403", c.post(
       "/blog/tags", json={"name": "Événement"}, headers=educ).status_code, 403)
    tag1 = c.post("/blog/tags", json={"name": "Événement"}, headers=redac1).json()
    tag2 = c.post("/blog/tags", json={"name": "Projet pédagogique"}, headers=redac1).json()
    ck("Doublon nom d'étiquette → 409", c.post(
       "/blog/tags", json={"name": "Événement"}, headers=redac1).status_code, 409)
    tags = c.get("/blog/tags", headers=redac1).json()
    ck("2 étiquettes créées", len(tags["items"]), 2)
    ren = c.patch(f"/blog/tags/{tag2['id']}", json={"name": "Projets pédagogiques"},
                  headers=redac1)
    ck("Renommage étiquette", ren.json()["name"], "Projets pédagogiques")

    # ── Création article (brouillon) ──
    art = c.post("/blog/articles", json={
        "title": "Fête de fin d'année",
        "content": "Retour en images sur notre fête de fin d'année 2026.",
        "tag_id": tag1["id"],
    }, headers=redac1).json()
    aid = art["id"]
    ck("Statut initial = draft", art["status"], "draft")
    ck("cover_url absent au départ", art["cover_url"], None)

    # ── Publication : refusée sans image à la une ──
    pub_fail = c.post(f"/blog/articles/{aid}/publish", headers=redac1)
    ck("Publication sans cover → 422", pub_fail.status_code, 422)

    # ── Upload image à la une ──
    cov = c.post(f"/blog/articles/{aid}/cover",
                 files={"file": ("cover.png", PNG, "image/png")}, headers=redac1)
    ck("Upload cover → 200", cov.status_code, 200)
    ck("  cover_url renseigné", cov.json()["cover_url"] is not None, True)
    bad_cover = c.post(f"/blog/articles/{aid}/cover",
                       files={"file": ("v.mp4", b"\x00\x00\x00\x18ftypmp42fake", "video/mp4")},
                       headers=redac1)
    ck("Cover en vidéo refusée → 422", bad_cover.status_code, 422)

    # ── Ajout de médias (galerie image/vidéo) ──
    media1 = c.post(f"/blog/articles/{aid}/attachments",
                    files={"file": ("photo.png", PNG, "image/png")}, headers=redac1)
    ck("Upload média photo → 201", media1.status_code, 201)
    media2 = c.post(f"/blog/articles/{aid}/attachments",
                    files={"file": ("clip.mp4", b"\x00\x00\x00\x18ftypmp42fake", "video/mp4")},
                    headers=redac1)
    ck("Upload média vidéo → 201", media2.status_code, 201)

    # ── Publication : réussit une fois cover + tag présents ──
    published = c.post(f"/blog/articles/{aid}/publish", headers=redac1)
    ck("Publication OK", published.status_code, 200)
    ck("  statut = published", published.json()["status"], "published")
    ck("  published_at renseigné", published.json()["published_at"] is not None, True)
    ck("Republication → 409", c.post(
       f"/blog/articles/{aid}/publish", headers=redac1).status_code, 409)

    # ── Modification APRÈS publication (autorisée, demande explicite) ──
    upd = c.patch(f"/blog/articles/{aid}", json={"title": "Fête de fin d'année 2026"},
                  headers=redac1)
    ck("Modification après publication → 200", upd.status_code, 200)
    ck("  titre mis à jour", upd.json()["title"], "Fête de fin d'année 2026")
    ck("Éducatrice ne peut pas modifier → 403", c.patch(
       f"/blog/articles/{aid}", json={"title": "x"}, headers=educ).status_code, 403)

    # ── Consultation publique (SANS authentification — aucun header) ──
    pub_list = c.get("/public/blog/LPRDS/articles")
    ck("Liste publique accessible sans token → 200", pub_list.status_code, 200)
    ck("  1 article publié visible", pub_list.json()["total"], 1)
    ck("  titre à jour", pub_list.json()["items"][0]["title"], "Fête de fin d'année 2026")
    pub_detail = c.get(f"/public/blog/LPRDS/articles/{aid}")
    ck("Détail public → 200", pub_detail.status_code, 200)
    ck("  2 médias visibles publiquement", len(pub_detail.json()["attachments"]), 2)
    cov_dl = c.get(f"/public/blog/LPRDS/articles/{aid}/cover")
    ck("Téléchargement cover public → 200", cov_dl.status_code, 200)
    ck("  contenu PNG correct", cov_dl.content, PNG)
    pub_tags = c.get("/public/blog/LPRDS/tags")
    ck("Étiquettes publiques listées", len(pub_tags.json()["items"]), 2)

    # ── Deuxième article, jamais publié : invisible publiquement ──
    art2 = c.post("/blog/articles", json={
        "title": "Brouillon interne", "content": "Pas encore prêt.",
    }, headers=redac1).json()
    aid2 = art2["id"]
    ck("Brouillon absent de la liste publique", c.get(
       "/public/blog/LPRDS/articles").json()["total"], 1)
    ck("Détail public d'un brouillon → 404", c.get(
       f"/public/blog/LPRDS/articles/{aid2}").status_code, 404)

    # ── Soft delete ──
    ck("Éducatrice ne peut pas supprimer → 403", c.delete(
       f"/blog/articles/{aid}", headers=educ).status_code, 403)
    del_r = c.delete(f"/blog/articles/{aid}", headers=redac1)
    ck("Suppression (soft) → 204", del_r.status_code, 204)
    still_there = c.get(f"/blog/articles/{aid}", headers=redac1)
    ck("  toujours en base (soft delete) côté admin", still_there.status_code, 200)
    ck("  is_active=False", still_there.json()["is_active"], False)
    ck("Disparu du site public après soft delete", c.get(
       "/public/blog/LPRDS/articles").json()["total"], 0)
    ck("Modification impossible après soft delete → 409", c.patch(
       f"/blog/articles/{aid}", json={"title": "x"}, headers=redac1).status_code, 409)
    list_active_only = c.get("/blog/articles", headers=redac1).json()
    ck("Liste interne par défaut exclut les inactifs", list_active_only["total"], 1)
    list_all = c.get("/blog/articles?include_inactive=true", headers=redac1).json()
    ck("include_inactive=true → 2 (brouillon + supprimé)", list_all["total"], 2)

    # ── Isolation étab B ──
    adm_b = onboard(c, su, "AUTRE", "admin@b.fr")
    pub_b = c.get("/public/blog/AUTRE/articles")
    ck("Étab B : aucune actualité (isolation)", pub_b.json()["total"], 0)
    pub_wrong_code = c.get("/public/blog/INEXISTANT/articles")
    ck("Code établissement inexistant → 404", pub_wrong_code.status_code, 404)
    list_b = c.get("/blog/articles", headers=adm_b).json()
    ck("Admin B liste interne : 0 (isolation)", list_b["total"], 0)
