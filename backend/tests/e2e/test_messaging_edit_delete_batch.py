"""Édition / suppression de messages + pièces jointes en lot (messages).

Couverture (Phase 1 messaging) :
- édition par l'auteur uniquement (parent ET admin), fenêtre 15 min, 409 après ;
- corps rogné, max 5000, vide interdit sauf si le message porte des médias ;
- suppression auteur uniquement, à tout âge, idempotente : corps purgé,
  réponse nulle, pièces jointes supprimées (base + disque) ;
- retrait unitaire d'une pièce jointe : auteur uniquement, jamais un message
  vide sans média (422) ;
- lot de médias pour un message : tout ou rien, quota de 15 au total ;
- messages supprimés exclus du non-lu et du téléchargement.
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.core import storage
from sqlalchemy.ext.asyncio import async_sessionmaker

from tests.conftest import _schema_engine
from app.modules.messaging.models import Attachment, Message
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

VIDEO = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 128


def _parent(c, adm, email, child_ids):
    pwd = "Parent2026"
    c.post("/parents", json={"first_name": "P", "last_name": email.split("@")[0],
           "nickname": f"Parent {email}", "phone": "+229", "email": email,
           "password": pwd, "child_ids": child_ids}, headers=adm)
    h = login(c, email, pwd)
    c.post("/auth/password-change", json={"current_password": pwd,
           "new_password": pwd + "New"}, headers=h)
    return login(c, email, pwd + "New")


def _setup(c, admin_email="admin@a.fr"):
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", admin_email)
    dep = c.post("/departments", json={"name": "Mat"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    child = c.post("/children", json={
        "last_name": "Emma", "first_names": "E", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Emma", "first_names": "T", "phone": "+229"}],
    }, headers=adm).json()
    par = _parent(c, adm, "mama@e.fr", [child["id"]])
    ck("Conversation parent", c.get("/messaging/conversations/me", headers=par).status_code, 200)
    return adm, par


def _conv_id(c, adm, nickname="Parent mama@e.fr"):
    convs = c.get("/messaging/conversations", headers=adm).json()
    return next(x["id"] for x in convs["items"]
                if x["parent"]["nickname"] == nickname)


def _force_age(message_id, minutes=16):
    async def run():
        engine = _schema_engine()
        try:
            async with async_sessionmaker(engine)() as db:
                await db.execute(
                    update(Message)
                    .where(Message.id == uuid.UUID(str(message_id)))
                    .values(created_at=datetime.now(timezone.utc) - timedelta(minutes=minutes))
                )
                await db.commit()
        finally:
            await engine.dispose()

    asyncio.run(run())


def _attachment_storage_keys(message_id):
    async def run():
        engine = _schema_engine()
        try:
            async with async_sessionmaker(engine)() as db:
                rows = await db.execute(
                    select(Attachment.storage_key).where(
                        Attachment.message_id == uuid.UUID(str(message_id))
                    )
                )
                return rows.scalars().all()
        finally:
            await engine.dispose()

    return asyncio.run(run())




def test_edit_message_author_window(client):
    c = client
    adm, par = _setup(c)
    msg = c.post("/messaging/conversations/me/messages", json={"body": "Hello"},
                 headers=par).json()
    ck("Édition par l'auteur", c.patch(
        f"/messaging/conversations/me/messages/{msg['id']}",
        json={"body": "Hello modifié"}, headers=par).status_code, 200)
    _force_age(msg["id"], minutes=16)
    ck("Édition après 15 min → 409", c.patch(
        f"/messaging/conversations/me/messages/{msg['id']}",
        json={"body": "trop tard"}, headers=par).status_code, 409)


def test_edit_ownership_and_rules(client):
    c = client
    adm, par = _setup(c)
    msg = c.post("/messaging/conversations/me/messages", json={"body": "Salut"},
                 headers=par).json()
    mid = msg["id"]
    conv = _conv_id(c, adm)
    ck("Édition par un non-auteur → 403", c.patch(
        f"/messaging/conversations/{conv}/messages/{mid}",
        json={"body": "pirate"}, headers=adm).status_code, 403)
    ck("Corps > 5000 → 422", c.patch(
        f"/messaging/conversations/me/messages/{mid}",
        json={"body": "x" * 5001}, headers=par).status_code, 422)
    ck("Édition valide par l'auteur", c.patch(
        f"/messaging/conversations/me/messages/{mid}",
        json={"body": "Hello modifié"}, headers=par).status_code, 200)
    ck("Message édité (edited_at)",
       next(x["edited_at"] for x in c.get("/messaging/conversations/me/messages",
            headers=par).json()["items"] if x["id"] == mid) is not None, True)
    media_msg = c.post("/messaging/conversations/me/messages",
                       json={"body": ""}, headers=par).json()
    c.post(f"/messaging/conversations/me/messages/{media_msg['id']}/attachments",
           files={"file": ("photo.png", PNG, "image/png")}, headers=par)
    r = c.patch(f"/messaging/conversations/me/messages/{media_msg['id']}",
                json={"body": ""}, headers=par)
    ck("Corps vide OK si médias présents", r.status_code, 200)


def test_delete_message_author_and_idempotent(client):
    c = client
    adm, par = _setup(c)
    msg = c.post("/messaging/conversations/me/messages", json={"body": "À supprimer"},
                 headers=par).json()
    mid = msg["id"]
    conv = _conv_id(c, adm)
    c.post(f"/messaging/conversations/me/messages/{mid}/attachments",
           files={"file": ("photo.png", PNG, "image/png")}, headers=par)
    ck("Suppression par un non-auteur → 403", c.delete(
        f"/messaging/conversations/{conv}/messages/{mid}", headers=adm).status_code, 403)
    keys = _attachment_storage_keys(mid)
    ck("Une pièce jointe en base avant suppression", len(keys), 1)
    ck("Fichiers sur disque avant suppression",
       all(storage.resolve_path(k).exists() for k in keys), True)
    ck("Suppression par l'auteur → 204", c.delete(
        f"/messaging/conversations/me/messages/{mid}", headers=par).status_code, 204)
    ck("Pièces jointes physiquement supprimées (base)",
       _attachment_storage_keys(mid), [])
    ck("Fichiers supprimés du disque",
       all(not storage.resolve_path(k).exists() for k in keys), True)
    item = next(x for x in c.get("/messaging/conversations/me/messages",
                headers=par).json()["items"] if x["id"] == mid)
    ck("Corps de réponse null", item["body"], None)
    ck("is_deleted true", item["is_deleted"], True)
    ck("attachments vide", item["attachments"], [])
    ck("Suppression idempotente → 204", c.delete(
        f"/messaging/conversations/me/messages/{mid}", headers=par).status_code, 204)
    ck("Édition d'un message supprimé → 409", c.patch(
        f"/messaging/conversations/me/messages/{mid}",
        json={"body": "résurrection"}, headers=par).status_code, 409)


def test_remove_message_attachment_rules(client):
    c = client
    adm, par = _setup(c)
    conv = None
    msg = c.post("/messaging/conversations/me/messages", json={"body": ""},
                 headers=par).json()
    mid = msg["id"]
    up = c.post(f"/messaging/conversations/me/messages/{mid}/attachments",
                files={"file": ("photo.png", PNG, "image/png")}, headers=par)
    att = up.json()["id"]
    conv = _conv_id(c, adm)
    ck("Retrait par un non-auteur → 403", c.delete(
        f"/messaging/conversations/{conv}/messages/{mid}/attachments/{att}",
        headers=adm).status_code, 403)
    ck("Retrait du seul média d'un message vide → 422", c.delete(
        f"/messaging/conversations/me/messages/{mid}/attachments/{att}",
        headers=par).status_code, 422)
    ck("Pièce jointe toujours là après refus", len(
        next(x for x in c.get("/messaging/conversations/me/messages", headers=par)
             .json()["items"] if x["id"] == mid)["attachments"]), 1)
    up2 = c.post(f"/messaging/conversations/me/messages/{mid}/attachments",
                 files={"file": ("photo2.png", PNG, "image/png")}, headers=par)
    ck("Deuxième média ajouté", up2.status_code, 201)
    ck("Retrait d'un média avec un autre restant → 204", c.delete(
        f"/messaging/conversations/me/messages/{mid}/attachments/{att}",
        headers=par).status_code, 204)
    item = next(x for x in c.get("/messaging/conversations/me/messages", headers=par)
                .json()["items"] if x["id"] == mid)
    ck("Un seul média restant", len(item["attachments"]), 1)
    ck("Retrait d'une pièce jointe inconnue → 404", c.delete(
        f"/messaging/conversations/me/messages/{mid}/attachments/{att}",
        headers=par).status_code, 404)


def test_message_batch_attachments_quota_and_atomicity(client):
    c = client
    adm, par = _setup(c)
    msg = c.post("/messaging/conversations/me/messages", json={"body": "Lot"},
                 headers=par).json()
    mid = msg["id"]
    r = c.post(f"/messaging/conversations/me/messages/{mid}/attachments/batch", files=[
        ("files", ("a.png", PNG, "image/png")),
        ("files", ("b.mp4", VIDEO, "video/mp4")),
    ], headers=par)
    ck("Lot de 2 médias (message) → 201", r.status_code, 201)
    ck("  2 pièces jointes retournées", len(r.json()), 2)
    keys = _attachment_storage_keys(mid)
    ck("  2 fichiers en base", len(keys), 2)
    ck("Lot avec un SVG → 422", c.post(
        f"/messaging/conversations/me/messages/{mid}/attachments/batch", files=[
            ("files", ("ok.png", PNG, "image/png")),
            ("files", ("ko.svg", b"<svg/>", "image/svg+xml")),
        ], headers=par).status_code, 422)
    ck("  rien ajouté après lot refusé", len(_attachment_storage_keys(mid)), 2)
    ck("  aucun fichier orphelin sur disque", all(
        storage.resolve_path(k).exists() for k in _attachment_storage_keys(mid)), True)
    too_many = [("files", (f"p{i}.png", PNG, "image/png")) for i in range(14)]
    ck("Lot dépassant 15 → 409", c.post(
        f"/messaging/conversations/me/messages/{mid}/attachments/batch",
        files=too_many, headers=par).status_code, 409)
    ok_many = [("files", (f"p{i}.png", PNG, "image/png")) for i in range(13)]
    ck("Lot complétant à 15 → 201", c.post(
        f"/messaging/conversations/me/messages/{mid}/attachments/batch",
        files=ok_many, headers=par).status_code, 201)
    ck("Upload unitaire au-delà du quota → 409", c.post(
        f"/messaging/conversations/me/messages/{mid}/attachments",
        files={"file": ("extra.png", PNG, "image/png")}, headers=par).status_code, 409)
    ck("Lot d'un message d'un autre auteur → 403", c.post(
        f"/messaging/conversations/me/messages/{mid}/attachments/batch",
        files=[("files", ("x.png", PNG, "image/png"))], headers=adm).status_code, 403)


def test_deleted_message_excluded_unread_and_download(client):
    c = client
    adm, par = _setup(c)
    conv = _conv_id(c, adm)
    unread = c.get("/messaging/conversations", headers=adm).json()["items"][0]["unread_count"]
    msg = c.post("/messaging/conversations/me/messages", json={"body": "Lu puis supprimé"},
                 headers=par).json()
    mid = msg["id"]
    c.post(f"/messaging/conversations/me/messages/{mid}/attachments",
           files={"file": ("photo.png", PNG, "image/png")}, headers=par)
    att_id = next(x for x in c.get("/messaging/conversations/me/messages", headers=par)
                  .json()["items"] if x["id"] == mid)["attachments"][0]["id"]
    ck("Non-lu côté admin = 1", c.get("/messaging/conversations", headers=adm)
       .json()["items"][0]["unread_count"], unread + 1)
    c.delete(f"/messaging/conversations/me/messages/{mid}", headers=par)
    ck("Message supprimé exclu du non-lu", c.get("/messaging/conversations", headers=adm)
       .json()["items"][0]["unread_count"], unread)
    ck("Téléchargement d'une pièce jointe d'un message supprimé → 404",
       c.get(f"/messaging/attachments/{att_id}", headers=adm).status_code, 404)
    ck("Téléchargement côté parent aussi → 404",
       c.get(f"/messaging/attachments/{att_id}", headers=par).status_code, 404)
    ck("Marquer lu ne compte pas les supprimés", c.post(
        f"/messaging/conversations/{conv}/read", headers=adm).status_code, 204)
    ck("Non-lu toujours 0 après read", c.get("/messaging/conversations", headers=adm)
       .json()["items"][0]["unread_count"], 0)


def test_message_pagination_stable_ordering(client):
    c = client
    adm, par = _setup(c)
    ids = []
    for i in range(7):
        m = c.post("/messaging/conversations/me/messages",
                   json={"body": f"Message {i}"}, headers=par).json()
        ids.append(m["id"])
    page1 = c.get("/messaging/conversations/me/messages",
                  params={"limit": 3, "skip": 0}, headers=par).json()
    ck("total", page1["total"], 7)
    ck("page 1 (les 3 plus récents, ordre chronologique)",
       [x["id"] for x in page1["items"]], [ids[4], ids[5], ids[6]])
    page2 = c.get("/messaging/conversations/me/messages",
                  params={"limit": 3, "skip": 3}, headers=par).json()
    ck("page 2 sans chevauchement",
       [x["id"] for x in page2["items"]], [ids[1], ids[2], ids[3]])
    ck("dernière page", [x["id"] for x in c.get(
        "/messaging/conversations/me/messages",
        params={"limit": 3, "skip": 6}, headers=par).json()["items"]], [ids[0]])
