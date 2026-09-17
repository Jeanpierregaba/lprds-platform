"""Édition / suppression de messages + lot et retrait de médias en conversation.

Couverture :
- édition par l'auteur sous 15 min (edited_at renvoyé), 403 sur le message
  de l'autre côté, vide refusé sans média (422), trop long (422), édition
  d'un message supprimé (409) ;
- suppression douce par l'auteur (204, idempotent) : corps masqué (null),
  pièces jointes effacées (téléchargement 404), exclue des non-lus ;
- lot de médias par message (tout ou rien) + quota de 15 (409 au-delà,
  y compris à l'upload unitaire) ;
- retrait d'une pièce jointe par l'auteur (dernier média d'un message sans
  texte refusé en 422, 403 pour l'autre côté) ;
- pagination curseur (before_id) : ordre stable, total inchangé, 404 sur
  curseur inconnu.
"""
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

VIDEO = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 128


def _make_parent(c, adm, email, pwd, child_ids):
    c.post("/parents", json={"first_name": "P", "last_name": email.split("@")[0],
           "nickname": f"Parent {email}", "phone": "+229", "email": email,
           "password": pwd, "child_ids": child_ids}, headers=adm)
    h = login(c, email, pwd)
    c.post("/auth/password-change", json={"current_password": pwd,
           "new_password": pwd + "New"}, headers=h)
    return login(c, email, pwd + "New")


def _setup(c, adm):
    dep = c.post("/departments", json={"name": "Mat"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    child = c.post("/children", json={
        "last_name": "Emma", "first_names": "Enfant",
        "birth_date": "2023-01-01", "admission_date": "2025-01-01",
        "residence_address": "x", "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Emma", "first_names": "T", "phone": "+229"}],
    }, headers=adm).json()
    par = _make_parent(c, adm, "mama@e.fr", "Parent2026", [child["id"]])
    c.get("/messaging/conversations/me", headers=par)
    conv = next(
        x for x in c.get("/messaging/conversations", headers=adm).json()["items"]
        if x["parent"]["nickname"] == "Parent mama@e.fr"
    )
    return par, conv["id"]


def test_message_edit(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    par, conv_id = _setup(c, adm)

    msg = c.post("/messaging/conversations/me/messages", json={"body": "Bonjour"},
                 headers=par).json()
    ck("edited_at absent à l'envoi", msg["edited_at"], None)
    ck("is_deleted faux à l'envoi", msg["is_deleted"], False)

    r = c.patch(f"/messaging/conversations/me/messages/{msg['id']}",
                json={"body": "Bonjour !"}, headers=par)
    ck("Édition auteur → 200", r.status_code, 200)
    ck("Corps mis à jour", r.json()["body"], "Bonjour !")
    ck("edited_at posé", r.json()["edited_at"] is not None, True)

    reply = c.post(f"/messaging/conversations/{conv_id}/messages",
                   json={"body": "Bien reçu"}, headers=adm).json()
    ck("Parent édite le message admin → 403", c.patch(
        f"/messaging/conversations/me/messages/{reply['id']}",
        json={"body": "Piraté"}, headers=par).status_code, 403)
    ck("Admin édite le message parent → 403", c.patch(
        f"/messaging/conversations/{conv_id}/messages/{msg['id']}",
        json={"body": "Piraté"}, headers=adm).status_code, 403)
    r = c.patch(f"/messaging/conversations/{conv_id}/messages/{reply['id']}",
                json={"body": "Bien reçu !"}, headers=adm)
    ck("Admin édite son message → 200", r.status_code, 200)

    ck("Édition à vide sans média → 422", c.patch(
        f"/messaging/conversations/me/messages/{msg['id']}",
        json={"body": "   "}, headers=par).status_code, 422)
    ck("Édition trop longue → 422", c.patch(
        f"/messaging/conversations/me/messages/{msg['id']}",
        json={"body": "x" * 5001}, headers=par).status_code, 422)

    media = c.post("/messaging/conversations/me/messages", json={"body": ""},
                   headers=par).json()
    c.post(f"/messaging/conversations/me/messages/{media['id']}/attachments",
           files={"file": ("p.png", PNG, "image/png")}, headers=par)
    ck("Édition à vide avec média → 200", c.patch(
        f"/messaging/conversations/me/messages/{media['id']}",
        json={"body": ""}, headers=par).status_code, 200)
    ck("Message inconnu → 404", c.patch(
        "/messaging/conversations/me/messages/00000000-0000-0000-0000-000000000000",
        json={"body": "X"}, headers=par).status_code, 404)


def test_message_delete(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    par, conv_id = _setup(c, adm)

    msg = c.post("/messaging/conversations/me/messages", json={"body": "Oups"},
                 headers=par).json()
    att = c.post(f"/messaging/conversations/me/messages/{msg['id']}/attachments",
                 files={"file": ("p.png", PNG, "image/png")}, headers=par).json()

    ck("Suppression du message de l'autre → 403", c.delete(
        f"/messaging/conversations/{conv_id}/messages/{msg['id']}",
        headers=adm).status_code, 403)
    ck("Suppression auteur → 204", c.delete(
        f"/messaging/conversations/me/messages/{msg['id']}",
        headers=par).status_code, 204)
    ck("Suppression idempotente → 204", c.delete(
        f"/messaging/conversations/me/messages/{msg['id']}",
        headers=par).status_code, 204)

    item = next(
        m for m in c.get("/messaging/conversations/me/messages",
                         headers=par).json()["items"]
        if m["id"] == msg["id"]
    )
    ck("Message marqué supprimé", item["is_deleted"], True)
    ck("Corps masqué", item["body"], None)
    ck("Pièces jointes effacées", item["attachments"], [])
    ck("Téléchargement d'une PJ effacée → 404",
       c.get(f"/messaging/attachments/{att['id']}", headers=par).status_code, 404)
    ck("Édition d'un message supprimé → 409", c.patch(
        f"/messaging/conversations/me/messages/{msg['id']}",
        json={"body": "Trop tard"}, headers=par).status_code, 409)
    ck("Nouvelle PJ sur message supprimé → 404", c.post(
        f"/messaging/conversations/me/messages/{msg['id']}/attachments",
        files={"file": ("q.png", PNG, "image/png")}, headers=par).status_code, 404)

    unread = next(
        x for x in c.get("/messaging/conversations", headers=adm).json()["items"]
        if x["id"] == conv_id
    )["unread_count"]
    ck("Message supprimé exclu des non-lus admin", unread, 0)


def test_message_attachments_batch_and_quota(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    par, conv_id = _setup(c, adm)

    msg = c.post("/messaging/conversations/me/messages", json={"body": ""},
                 headers=par).json()
    r = c.post(f"/messaging/conversations/me/messages/{msg['id']}/attachments/batch",
               files=[("files", ("a.png", PNG, "image/png")),
                      ("files", ("b.mp4", VIDEO, "video/mp4"))], headers=par)
    ck("Lot de 2 médias → 201", r.status_code, 201)
    ck("  2 pièces jointes retournées", len(r.json()), 2)

    r = c.post(f"/messaging/conversations/me/messages/{msg['id']}/attachments/batch",
               files=[("files", ("ok.png", PNG, "image/png")),
                      ("files", ("ko.svg", b"<svg/>", "image/svg+xml"))], headers=par)
    ck("Lot avec un SVG → 422", r.status_code, 422)
    item = next(
        m for m in c.get("/messaging/conversations/me/messages",
                         headers=par).json()["items"]
        if m["id"] == msg["id"]
    )
    ck("  rien n'a été ajouté (toujours 2)", len(item["attachments"]), 2)

    ck("Lot sur le message de l'autre → 403", c.post(
        f"/messaging/conversations/{conv_id}/messages/{msg['id']}/attachments/batch",
        files=[("files", ("z.png", PNG, "image/png"))], headers=adm).status_code, 403)
    ck("Lot vide → 422", c.post(
        f"/messaging/conversations/me/messages/{msg['id']}/attachments/batch",
        files=[], headers=par).status_code, 422)

    filling = [("files", (f"p{i}.png", PNG, "image/png")) for i in range(13)]
    ck("Lot complétant à 15 → 201", c.post(
        f"/messaging/conversations/me/messages/{msg['id']}/attachments/batch",
        files=filling, headers=par).status_code, 201)
    ck("Upload unitaire au-delà du quota → 409", c.post(
        f"/messaging/conversations/me/messages/{msg['id']}/attachments",
        files={"file": ("extra.png", PNG, "image/png")}, headers=par).status_code, 409)
    ck("Lot au-delà du quota → 409", c.post(
        f"/messaging/conversations/me/messages/{msg['id']}/attachments/batch",
        files=[("files", ("extra.png", PNG, "image/png"))],
        headers=par).status_code, 409)


def test_remove_message_attachment(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    par, conv_id = _setup(c, adm)

    msg = c.post("/messaging/conversations/me/messages", json={"body": "Photos"},
                 headers=par).json()
    a1 = c.post(f"/messaging/conversations/me/messages/{msg['id']}/attachments",
                files={"file": ("a.png", PNG, "image/png")}, headers=par).json()
    a2 = c.post(f"/messaging/conversations/me/messages/{msg['id']}/attachments",
                files={"file": ("b.png", PNG, "image/png")}, headers=par).json()

    ck("Retrait par l'autre côté → 403", c.delete(
        f"/messaging/conversations/{conv_id}/messages/{msg['id']}"
        f"/attachments/{a1['id']}", headers=adm).status_code, 403)
    ck("Retrait auteur → 204", c.delete(
        f"/messaging/conversations/me/messages/{msg['id']}/attachments/{a1['id']}",
        headers=par).status_code, 204)
    item = next(
        m for m in c.get("/messaging/conversations/me/messages",
                         headers=par).json()["items"]
        if m["id"] == msg["id"]
    )
    ck("  une PJ restante", [a["id"] for a in item["attachments"]], [a2["id"]])
    ck("Téléchargement de la PJ retirée → 404",
       c.get(f"/messaging/attachments/{a1['id']}", headers=par).status_code, 404)

    media = c.post("/messaging/conversations/me/messages", json={"body": ""},
                   headers=par).json()
    only = c.post(f"/messaging/conversations/me/messages/{media['id']}/attachments",
                  files={"file": ("s.png", PNG, "image/png")}, headers=par).json()
    ck("Retrait du dernier média d'un message sans texte → 422", c.delete(
        f"/messaging/conversations/me/messages/{media['id']}/attachments/{only['id']}",
        headers=par).status_code, 422)


def test_message_pagination_cursor(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    par, _conv = _setup(c, adm)

    for i in range(5):
        c.post("/messaging/conversations/me/messages", json={"body": f"m{i}"},
               headers=par)
    page = c.get("/messaging/conversations/me/messages?limit=2", headers=par).json()
    ck("Total inchangé par la pagination", page["total"], 5)
    ck("Derniers messages d'abord", [m["body"] for m in page["items"]], ["m3", "m4"])
    older = c.get(
        f"/messaging/conversations/me/messages?limit=2&before_id={page['items'][0]['id']}",
        headers=par).json()
    ck("Curseur → messages plus anciens", [m["body"] for m in older["items"]], ["m1", "m2"])
    ck("Curseur inconnu → 404", c.get(
        "/messaging/conversations/me/messages?before_id=00000000-0000-0000-0000-000000000000",
        headers=par).status_code, 404)
