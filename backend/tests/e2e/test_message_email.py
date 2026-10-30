"""Notification email à l'arrivée d'un message privé.

Même raisonnement que pour les diffusions, et le même trou refermé : les trois
canaux en place n'atteignent QUE quelqu'un qui a déjà fait quelque chose — le
WebSocket suppose un onglet ouvert à cet instant, le push un abonnement par
appareil que le destinataire a accordé lui-même, la pastille de non-lus qu'il
revienne de son propre chef.

Ce que ces contrôles protègent, dans l'ordre d'importance :

1. **Le CORPS du message ne voyage JAMAIS**, pas même tronqué. Plus strict que
   pour une diffusion, dont le titre part : une conversation privée porte
   précisément ce qu'on ne dit qu'à une famille.
2. **Une seule notification par échange** (temporisation) : dix allers-retours
   dans l'heure ne doivent pas faire dix emails.
3. **Le bon destinataire, et lui seul** : jamais l'expéditeur lui-même, jamais
   un compte désactivé.
4. **Le lien mène à LA conversation**, et pas au même écran des deux côtés.
5. **Un échec SMTP ne bloque pas l'envoi du message**, et LÈVE la
   temporisation — rien n'ayant été délivré.
"""
import time
from html import unescape

import pytest

from app.core.config import settings
from app.modules.messaging import service as messaging_service
from app.modules.auth.email import EmailDeliveryError
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


@pytest.fixture
def emails(monkeypatch):
    """Capture les envois — `MAIL_SUPPRESS_SEND` les rendrait invisibles."""
    envoyes = []

    async def faux_envoi(**kwargs):
        envoyes.append(kwargs)

    monkeypatch.setattr(messaging_service, "send_message_email", faux_envoi)
    return envoyes


def _attendre(envoyes, combien, delai=5.0):
    """⚠️ L'envoi part EN FOND : sans cette attente, le test lirait la liste
    avant que la tâche n'ait tourné, et passerait selon la charge machine."""
    fin = time.monotonic() + delai
    while time.monotonic() < fin and len(envoyes) < combien:
        time.sleep(0.05)
    return envoyes


def _oublier(cle):
    """Retire une clé Redis depuis le test — en ouvrant un client À SOI.

    ⚠️ Jamais le `redis_client` global : il appartient à la boucle du serveur
    de test, et un `asyncio.run` ouvre une boucle NEUVE. On retombe sinon
    exactement sur le « got Future attached to a different loop » que
    `task_pool()` documente côté tâches Celery — piège vécu en écrivant ce
    fichier, et la même racine.
    """
    import asyncio

    import redis.asyncio as aioredis

    async def _faire():
        client = aioredis.from_url(settings.redis_url, decode_responses=True)
        try:
            await client.delete(cle)
        finally:
            await client.aclose()

    asyncio.run(_faire())


def _famille(c, adm, email="parent@msg.fr", locale=None):
    dep = c.post("/departments", json={"name": "Mat"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "S"},
                 headers=adm).json()
    enfant = c.post("/children", json={
        "last_name": "Doe", "first_names": "Ada", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"], "guardians": [],
    }, headers=adm).json()
    r = c.post("/parents", json={
        "first_name": "Awa", "last_name": "Parent", "nickname": "Maman Ada",
        "phone": "+229", "email": email, "password": "Parent2026",
        "child_ids": [enfant["id"]],
    }, headers=adm)
    assert r.status_code == 201, r.text[:300]
    if locale:
        jeton = login(c, email, "Parent2026")
        assert c.patch("/auth/me/locale", json={"locale": locale},
                       headers=jeton).status_code in (200, 204)
    return login(c, email, "Parent2026")


def test_un_message_de_l_admin_previent_le_parent_sans_rien_dire_du_contenu(
    client, emails
):
    """Le contrôle central : l'email annonce, il ne raconte pas."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "MSG1", "admin@msg1.fr")
    par = _famille(c, adm)
    # La conversation est auto-créée au premier accès du parent.
    conv = c.get("/messaging/conversations/me", headers=par).json()

    emails.clear()
    secret = "Ada a de la fièvre depuis ce matin, venez la chercher."
    r = c.post(f"/messaging/conversations/{conv['id']}/messages",
               json={"body": secret}, headers=adm)
    ck("message envoyé", r.status_code, 201)

    _attendre(emails, 1)
    time.sleep(0.3)  # laisser le temps à un envoi de TROP d'arriver
    ck("le parent, et lui seul, est prévenu",
       [e["to"] for e in emails], ["parent@msg.fr"])
    # ⚠️ LE contrôle de ce fichier. Un aperçu tronqué compterait pour une
    # fuite : « Ada a de la fièvre depuis ce matin » tient dans 120 caractères.
    ck("aucun fragment du message ne voyage",
       any(mot in str(emails[0].values()) for mot in ("fièvre", "chercher", "Ada a")),
       False)
    # Côté parent l'expéditeur est l'administration en tant que COLLECTIF :
    # le portail n'affiche jamais le nom de l'admin qui a répondu.
    ck("l'expéditeur annoncé n'est pas une personne",
       "Admin" in emails[0]["sender_label"], False)
    ck("  mais l'établissement", emails[0]["sender_label"] != "", True)
    ck("le lien mène à la conversation du parent",
       "/dashboard/parent/messaging" in emails[0]["message_url"]
       and "tab=conversation" in emails[0]["message_url"], True)


def test_un_message_du_parent_previent_les_admins_mais_jamais_l_expediteur(
    client, emails
):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "MSG2", "admin@msg2.fr")
    etab = c.get("/establishments", headers=su).json()["items"][0]
    # Un SECOND admin : « l'administration » est collective, n'importe qui
    # répond — les deux doivent donc être prévenus.
    ck("second admin ajouté", c.post(f"/establishments/{etab['id']}/admins", json={
        "first_name": "Deux", "last_name": "Admin", "nickname": "Tata Deux",
        "email": "admin2@msg2.fr", "password": "Admin#2026",
    }, headers=su).status_code, 201)
    par = _famille(c, adm, "parent@msg2.fr")

    emails.clear()
    r = c.post("/messaging/conversations/me/messages",
               json={"body": "Bonjour, une question."}, headers=par)
    ck("message envoyé par le parent", r.status_code, 201)

    _attendre(emails, 2)
    time.sleep(0.3)
    ck("les deux admins sont prévenus",
       sorted(e["to"] for e in emails), ["admin2@msg2.fr", "admin@msg2.fr"])
    # Propriété de RÉSULTAT, pas une garde : l'expéditeur ne peut pas être
    # dans la liste puisqu'on ne lit que l'autre côté de la conversation.
    # Conservé parce que c'est ce qui compte vu de la boîte mail, mais sans
    # illusion sur ce qu'il verrouille (cf. le commentaire du service).
    ck("le parent expéditeur n'est pas dans la liste",
       any(e["to"] == "parent@msg2.fr" for e in emails), False)
    # Côté admin, l'expéditeur EST nommé — il a plusieurs familles en face.
    ck("l'expéditeur est nommé par son surnom",
       emails[0]["sender_label"], "Maman Ada")
    ck("le lien désigne LA conversation",
       "/dashboard/admin/messaging" in emails[0]["message_url"]
       and "conversation=" in emails[0]["message_url"], True)


def test_un_echange_ne_fait_qu_UN_email(client, emails):
    """⚠️ Sans temporisation, une conversation nourrie devient du harcèlement.

    Dix allers-retours en un quart d'heure — le cas NORMAL quand un parent et
    l'établissement règlent quelque chose — feraient dix emails, alors que le
    premier a déjà dit tout ce qu'il avait à dire : « allez voir votre
    messagerie ».
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "MSG3", "admin@msg3.fr")
    par = _famille(c, adm, "parent@msg3.fr")
    conv = c.get("/messaging/conversations/me", headers=par).json()

    emails.clear()
    for i in range(4):
        ck(f"message {i + 1} envoyé",
           c.post(f"/messaging/conversations/{conv['id']}/messages",
                  json={"body": f"Message {i}"}, headers=adm).status_code, 201)
    _attendre(emails, 1)
    time.sleep(0.4)
    ck("quatre messages, un seul email", len(emails), 1)

    # La fenêtre est bien un RÉGLAGE, pas un verrou définitif : la clé expirée,
    # un nouveau message prévient de nouveau. On simule l'expiration en
    # retirant la clé.
    _oublier(messaging_service._cle_email_message(conv["id"], _id_parent(c, adm)))
    ck("message suivant la fenêtre",
       c.post(f"/messaging/conversations/{conv['id']}/messages",
              json={"body": "Plus tard"}, headers=adm).status_code, 201)
    _attendre(emails, 2)
    ck("la fenêtre écoulée, il est prévenu de nouveau", len(emails), 2)
    ck("la temporisation est configurable",
       settings.message_email_cooldown_minutes > 0, True)


def _id_parent(c, adm):
    return c.get("/parents", headers=adm).json()["items"][0]["id"]


def test_un_compte_desactive_n_est_pas_prevenu(client, emails):
    """Il ne peut plus se connecter : le lien mènerait à un espace fermé."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "MSG4", "admin@msg4.fr")
    par = _famille(c, adm, "parent@msg4.fr")
    conv = c.get("/messaging/conversations/me", headers=par).json()
    ck("parent désactivé", c.patch(f"/parents/{_id_parent(c, adm)}",
                                   json={"is_active": False},
                                   headers=adm).status_code, 200)

    emails.clear()
    ck("l'admin peut toujours écrire dans le fil",
       c.post(f"/messaging/conversations/{conv['id']}/messages",
              json={"body": "Toc toc"}, headers=adm).status_code, 201)
    time.sleep(0.5)
    ck("aucun email vers un compte désactivé", len(emails), 0)


def test_le_rendu_du_template_et_le_sujet(client, monkeypatch):
    """Rendu avec le VRAI template : une variable mal nommée produirait un
    `href` vide, et un bouton vide reste parfaitement cliquable."""
    import asyncio

    from app.core import links
    from app.modules.messaging.email import send_message_email

    rendus = []

    async def capture(*, to, subject, html):
        rendus.append((to, subject, html))

    monkeypatch.setattr("app.modules.messaging.email.send_html_email", capture)
    destination = links.url(links.ADMIN_MESSAGING,
                            **links.admin_conversation_query("c-7"))
    asyncio.run(send_message_email(
        to="a@e.fr", recipient_first_name="Victoire",
        sender_label="Maman Ada", message_url=destination,
    ))
    _, sujet, html = rendus[0]
    rendu = unescape(html)

    ck("le lien pointe la conversation", destination in rendu, True)
    ck("  avec son identifiant", "conversation=c-7" in rendu, True)
    ck("  et le bon onglet", "tab=conversations" in rendu, True)
    ck("  et le href n'est pas vide", 'href=""' in html, False)
    ck("le destinataire est salué", "Victoire" in rendu, True)
    ck("l'expéditeur est nommé", "Maman Ada" in rendu, True)
    ck("l'expéditeur est dans le sujet", "Maman Ada" in sujet, True)
    # L'email le DIT, sinon le destinataire croira à une panne au deuxième
    # message resté sans notification.
    ck("la temporisation est annoncée au destinataire",
       "chaque message" in rendu, True)


def test_un_echec_smtp_ne_bloque_pas_le_message_et_leve_la_temporisation(
    client, monkeypatch
):
    """⚠️ Même raisonnement que la relance d'invitation : rien n'a été délivré,
    donc laisser le verrou poserait un silence d'une demi-heure au moment même
    où le SMTP revient."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "MSG5", "admin@msg5.fr")
    par = _famille(c, adm, "parent@msg5.fr")
    conv = c.get("/messaging/conversations/me", headers=par).json()

    tentatives = []

    async def smtp_en_panne(**kwargs):
        tentatives.append(kwargs["to"])
        raise EmailDeliveryError("SMTP indisponible")

    monkeypatch.setattr(messaging_service, "send_message_email", smtp_en_panne)
    r = c.post(f"/messaging/conversations/{conv['id']}/messages",
               json={"body": "Premier"}, headers=adm)
    ck("le message part malgré l'échec d'envoi", r.status_code, 201)
    _attendre(tentatives, 1)

    # Le SMTP revient : le message suivant doit pouvoir notifier, c'est-à-dire
    # que la temporisation du premier a bien été levée.
    envoyes = []

    async def smtp_revenu(**kwargs):
        envoyes.append(kwargs["to"])

    monkeypatch.setattr(messaging_service, "send_message_email", smtp_revenu)
    ck("second message", c.post(f"/messaging/conversations/{conv['id']}/messages",
                                json={"body": "Second"},
                                headers=adm).status_code, 201)
    _attendre(envoyes, 1)
    ck("la temporisation a été levée par l'échec", envoyes, ["parent@msg5.fr"])
    ck("et le fil contient bien les deux messages",
       c.get("/messaging/conversations/me/messages", headers=par).json()["total"], 2)


def test_la_langue_est_celle_du_destinataire(client, emails):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "MSG6", "admin@msg6.fr")
    par = _famille(c, adm, "parent@msg6.fr", locale="en")
    conv = c.get("/messaging/conversations/me", headers=par).json()

    emails.clear()
    ck("message envoyé", c.post(f"/messaging/conversations/{conv['id']}/messages",
                                json={"body": "Hello"},
                                headers=adm).status_code, 201)
    _attendre(emails, 1)
    ck("le parent anglophone reçoit de l'anglais", str(emails[0]["locale"]), "en")
