"""Diffusions ciblées par départements + médias vidéo en conversations privées.

Couverture :
- broadcast (aucun département coché) vs ciblage 1..N départements ;
- visibilité parent (404 hors périmètre, jamais 403 — on ne révèle rien) ;
- compteur admin X/Y calculé sur l'audience réelle, pas tous les parents ;
- changement de périmètre au PATCH + élagage des lectures hors périmètre ;
- vidéo acceptée dans les conversations (parent ET admin), refusée en
  diffusion (images + PDF uniquement) ;
- téléchargement d'une pièce jointe de diffusion ciblée : 404 hors périmètre.
"""
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

# Faux MP4 : seul le type MIME déclaré est contrôlé (pas de sniffing), comme
# pour les images — cf. _validate_upload.
VIDEO = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 128


def _make_parent(c, adm, email, pwd, child_ids):
    c.post("/parents", json={"first_name": "P", "last_name": email.split("@")[0],
           "nickname": f"Parent {email}", "phone": "+229", "email": email,
           "password": pwd, "child_ids": child_ids}, headers=adm)
    h = login(c, email, pwd)
    c.post("/auth/password-change", json={"current_password": pwd,
           "new_password": pwd + "New"}, headers=h)
    return login(c, email, pwd + "New")


def _make_child(c, adm, dep_id, sec_id, last_name):
    return c.post("/children", json={
        "last_name": last_name, "first_names": "Enfant",
        "birth_date": "2023-01-01", "admission_date": "2025-01-01",
        "residence_address": "x", "department_id": dep_id, "section_id": sec_id,
        "guardians": [{"last_name": last_name, "first_names": "T", "phone": "+229"}],
    }, headers=adm).json()


def _setup_two_depts(c, adm):
    """Deux départements, un enfant + un parent par département."""
    mat = c.post("/departments", json={"name": "Mat"}, headers=adm).json()
    prim = c.post("/departments", json={"name": "Prim"}, headers=adm).json()
    sec_m = c.post("/sections", json={"department_id": mat["id"], "name": "PS"},
                   headers=adm).json()
    sec_p = c.post("/sections", json={"department_id": prim["id"], "name": "CP"},
                   headers=adm).json()
    emma = _make_child(c, adm, mat["id"], sec_m["id"], "Emma")
    hugo = _make_child(c, adm, prim["id"], sec_p["id"], "Hugo")
    par_m = _make_parent(c, adm, "mama@e.fr", "Parent2026", [emma["id"]])
    par_p = _make_parent(c, adm, "papa@e.fr", "Parent2026", [hugo["id"]])
    return mat, prim, par_m, par_p


def test_announcement_department_scope(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    mat, prim, par_m, par_p = _setup_two_depts(c, adm)

    # Broadcast : tout le monde voit, total = tous les parents.
    r = c.post("/messaging/announcements",
               json={"title": "Fête", "body": "Samedi."}, headers=adm)
    ck("Broadcast créé", r.status_code, 201)
    ck("Broadcast sans ciblage", r.json()["department_ids"], [])
    ck("Total broadcast = 2 parents", r.json()["total_parents"], 2)
    ck("Parent Mat voit le broadcast",
       c.get("/messaging/announcements", headers=par_m).json()["total"], 1)
    ck("Parent Prim voit le broadcast",
       c.get("/messaging/announcements", headers=par_p).json()["total"], 1)

    # Ciblage Mat : seul le parent Mat voit.
    r = c.post("/messaging/announcements",
               json={"title": "Sortie", "body": "Zoo.",
                     "department_ids": [mat["id"], mat["id"]]}, headers=adm)
    ck("Diffusion ciblée créée (doublons dédupliqués)", r.status_code, 201)
    scoped = r.json()
    ck("Ciblage dédupliqué", scoped["department_ids"], [mat["id"]])
    ck("Total ciblé = 1 parent", scoped["total_parents"], 1)
    ck("Parent Mat voit broadcast + ciblée",
       c.get("/messaging/announcements", headers=par_m).json()["total"], 2)
    ck("Parent Prim ne voit que le broadcast",
       c.get("/messaging/announcements", headers=par_p).json()["total"], 1)
    ck("Détail hors périmètre → 404",
       c.get(f"/messaging/announcements/{scoped['id']}", headers=par_p).status_code, 404)
    ck("Détail dans le périmètre → 200",
       c.get(f"/messaging/announcements/{scoped['id']}", headers=par_m).status_code, 200)
    ck("Lecture hors périmètre → 404",
       c.post(f"/messaging/announcements/{scoped['id']}/read",
              headers=par_p).status_code, 404)
    ck("Lecture dans le périmètre → 204",
       c.post(f"/messaging/announcements/{scoped['id']}/read",
              headers=par_m).status_code, 204)
    seen = c.get(f"/messaging/announcements/{scoped['id']}", headers=adm).json()
    ck("Compteur ciblé 1/1", (seen["read_count"], seen["total_parents"]), (1, 1))

    # Département inexistant / d'un autre établissement → 404.
    ck("Département inconnu → 404", c.post(
        "/messaging/announcements",
        json={"title": "X", "body": "Y",
              "department_ids": ["00000000-0000-0000-0000-000000000000"]},
        headers=adm).status_code, 404)
    adm2 = onboard(c, su, "AUTRE", "admin@b.fr")
    other_dep = c.post("/departments", json={"name": "Mat"}, headers=adm2).json()
    ck("Département d'un autre établissement → 404", c.post(
        "/messaging/announcements",
        json={"title": "X", "body": "Y", "department_ids": [other_dep["id"]]},
        headers=adm).status_code, 404)

    # PATCH : bascule du périmètre Mat → Prim. Le parent Mat perd la visibilité
    # (retour au seul broadcast), sa lecture est élaguée (compteur 0/1).
    r = c.patch(f"/messaging/announcements/{scoped['id']}",
                json={"department_ids": [prim["id"]]}, headers=adm)
    ck("PATCH périmètre accepté", r.status_code, 200)
    ck("Nouveau ciblage renvoyé", r.json()["department_ids"], [prim["id"]])
    ck("Parent Mat ne voit plus que le broadcast",
       c.get("/messaging/announcements", headers=par_m).json()["total"], 1)
    ck("Parent Prim voit broadcast + ciblée",
       c.get("/messaging/announcements", headers=par_p).json()["total"], 2)
    seen = c.get(f"/messaging/announcements/{scoped['id']}", headers=adm).json()
    ck("Lecture hors périmètre élaguée (0/1)",
       (seen["read_count"], seen["total_parents"]), (0, 1))

    # PATCH périmètre vide → retour au broadcast pour tout le monde.
    r = c.patch(f"/messaging/announcements/{scoped['id']}",
                json={"department_ids": []}, headers=adm)
    ck("Retour broadcast accepté", r.status_code, 200)
    ck("Ciblage vidé", r.json()["department_ids"], [])
    ck("Parent Mat revoit la diffusion",
       c.get("/messaging/announcements", headers=par_m).json()["total"], 2)
    ck("Total broadcast restauré",
       c.get(f"/messaging/announcements/{scoped['id']}", headers=adm
             ).json()["total_parents"], 2)


def test_media_message_with_empty_body(client):
    """Envoi « comme WhatsApp » : message au corps vide + photo attachée dans
    la foulée (le trombone vit dans la barre de saisie, plus sur chaque bulle)."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    mat, _prim, par_m, _par_p = _setup_two_depts(c, adm)

    msg = c.post("/messaging/conversations/me/messages", json={"body": ""},
                 headers=par_m)
    ck("Message au corps vide accepté", msg.status_code, 201)
    mid = msg.json()["id"]
    r = c.post(f"/messaging/conversations/me/messages/{mid}/attachments",
               files={"file": ("photo.png", PNG, "image/png")}, headers=par_m)
    ck("Photo attachée au message vide", r.status_code, 201)
    item = c.get("/messaging/conversations/me/messages", headers=par_m).json()["items"][0]
    ck("Corps vide conservé", item["body"], "")
    ck("Photo listée sur le message", len(item["attachments"]), 1)

    # Garde-fou : un message texte classique fonctionne toujours.
    msg2 = c.post("/messaging/conversations/me/messages", json={"body": "Bonjour"},
                  headers=par_m)
    ck("Message texte toujours accepté", msg2.status_code, 201)


def test_conversation_video_and_scoped_attachment_download(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    mat, _prim, par_m, par_p = _setup_two_depts(c, adm)

    # Vidéo envoyée par le parent dans sa conversation privée.
    msg = c.post("/messaging/conversations/me/messages", json={"body": "Regardez !"},
                 headers=par_m).json()
    r = c.post(f"/messaging/conversations/me/messages/{msg['id']}/attachments",
               files={"file": ("fete.mp4", VIDEO, "video/mp4")}, headers=par_m)
    ck("Vidéo parent → 201", r.status_code, 201)
    ck("Type vidéo conservé", r.json()["content_type"], "video/mp4")
    msgs = c.get("/messaging/conversations/me/messages", headers=par_m).json()
    ck("Pièce jointe listée sur le message",
       msgs["items"][0]["attachments"][0]["content_type"], "video/mp4")
    att_id = msgs["items"][0]["attachments"][0]["id"]
    r = c.get(f"/messaging/attachments/{att_id}", headers=par_m)
    ck("Téléchargement vidéo → 200", r.status_code, 200)

    # Vidéo envoyée par l'admin dans la conversation du parent.
    convs = c.get("/messaging/conversations", headers=adm).json()
    conv = next(x for x in convs["items"]
                if x["parent"]["nickname"] == "Parent mama@e.fr")
    msg2 = c.post(f"/messaging/conversations/{conv['id']}/messages",
                  json={"body": "Merci pour la vidéo !"}, headers=adm).json()
    r = c.post(f"/messaging/conversations/{conv['id']}/messages/{msg2['id']}/attachments",
               files={"file": ("rep.mp4", VIDEO, "video/mp4")}, headers=adm)
    ck("Vidéo admin → 201", r.status_code, 201)

    # La vidéo reste interdite en diffusion (images + PDF uniquement).
    ann = c.post("/messaging/announcements", json={"title": "T", "body": "B"},
                 headers=adm).json()
    ck("Vidéo en diffusion → 422", c.post(
        f"/messaging/announcements/{ann['id']}/attachments",
        files={"file": ("x.mp4", VIDEO, "video/mp4")}, headers=adm).status_code, 422)

    # Pièce jointe d'une diffusion ciblée : 404 hors périmètre, 200 dedans.
    scoped = c.post("/messaging/announcements",
                    json={"title": "S", "body": "B",
                          "department_ids": [mat["id"]]}, headers=adm).json()
    up = c.post(f"/messaging/announcements/{scoped['id']}/attachments",
                files={"file": ("img.png", PNG, "image/png")}, headers=adm).json()
    ck("PJ diffusion hors périmètre → 404",
       c.get(f"/messaging/attachments/{up['id']}", headers=par_p).status_code, 404)
    ck("PJ diffusion dans le périmètre → 200",
       c.get(f"/messaging/attachments/{up['id']}", headers=par_m).status_code, 200)
