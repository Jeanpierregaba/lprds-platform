"""Abonnements et envois de notifications push.

⚠️ **Le premier test de ce module.** C'était le seul du dépôt que rien ne
touchait, et c'est exactement ce qui explique son état : neuf défauts
indépendants, du code écrit de bout en bout mais jamais EXÉCUTÉ, et aucun
symptôme visible — l'envoi étant best-effort, ses échecs sont journalisés au
fond du module.

Deux partis pris, sans lesquels cette suite ne prouverait rien :

1. **Des clés de la VRAIE taille.** `p256dh` est un point de courbe non
   compressé de 65 octets (87 caractères en base64url), `auth` un secret de
   16 octets (22 caractères). C'est la seule façon d'attraper la classe de
   défaut qui a tué ce module : un plancher de validation à 44 caractères
   refusait `auth`, et une colonne `VARCHAR(44)` tronquait `p256dh`. Des clés
   « plausibles » de longueur arbitraire passeraient les deux.
2. **L'envoi réel est remplacé, le reste ne l'est pas.** Seul `pywebpush` est
   substitué (aucun service de push n'est joignable depuis un test) ; la
   validation, la base, le scope par compte et le rendu par langue sont ceux
   de production.
"""

import base64
import os
import uuid

import pytest

from app.core.config import settings
from tests.helpers import ck, login, onboard

SU_EMAIL = "tech@lespetitsrayonsdesoleil.fr"
SU_PASSWORD = "Geek-Ot@ku#2002"


def cle_p256dh() -> str:
    """65 octets : préfixe 0x04 d'un point non compressé + deux coordonnées
    de 32 octets. Exactement ce que produit `subscription.getKey('p256dh')`."""
    brut = b"\x04" + os.urandom(64)
    return base64.urlsafe_b64encode(brut).decode().rstrip("=")


def cle_auth() -> str:
    """16 octets, comme `subscription.getKey('auth')`."""
    return base64.urlsafe_b64encode(os.urandom(16)).decode().rstrip("=")


def abonnement(endpoint: str | None = None) -> dict:
    return {
        "endpoint": endpoint or f"https://fcm.googleapis.com/fcm/send/{uuid.uuid4()}",
        "p256dh": cle_p256dh(),
        "auth_key": cle_auth(),
    }


@pytest.fixture
def push_envoyes(monkeypatch):
    """Capture les envois et pose de fausses clés VAPID.

    Le serveur de test tourne dans le MÊME processus (cf. conftest.py), donc
    substituer `pywebpush.webpush` ici vaut bien pour le code appelé par les
    requêtes HTTP. L'import de `webpush` est fait à l'appel dans le service,
    jamais au chargement du module : c'est ce qui rend la substitution
    possible."""
    import pywebpush

    envois: list[dict] = []

    def faux_webpush(**kwargs):
        envois.append(kwargs)
        return None

    monkeypatch.setattr(pywebpush, "webpush", faux_webpush)
    monkeypatch.setattr(settings, "vapid_private_key", "fausse-cle-privee")
    monkeypatch.setattr(settings, "vapid_public_key", "fausse-cle-publique")
    return envois


def _parent_abonne(client, adm, suffixe=""):
    """Crée un enfant, son compte parent, et renvoie (headers parent, child_id)."""
    enfant = client.post("/children", headers=adm, json={
        "last_name": "Push", "first_names": f"Enfant{suffixe}",
        "birth_date": "2022-01-01", "admission_date": "2024-09-01",
        "residence_address": "Cotonou", "guardians": [],
    })
    assert enfant.status_code == 201, enfant.text[:300]
    child_id = enfant.json()["id"]

    r = client.post("/parents", headers=adm, json={
        "first_name": "Pa", "last_name": "Rent", "nickname": f"Papa{suffixe}",
        "phone": "+22900000000", "email": f"parent{suffixe}@push.fr",
        "password": "Initial2026", "child_ids": [child_id],
    })
    assert r.status_code == 201, r.text[:300]
    return login(client, f"parent{suffixe}@push.fr", "Initial2026"), child_id


# ── Enregistrement ───────────────────────────────────────────────

def test_une_vraie_cle_est_acceptee_et_stockee_sans_troncature(client):
    """⚠️ Le contrôle central : avant correction, ce seul appel renvoyait 422
    (plancher de 44 sur `auth_key`, qui en fait 22) puis 500 (« value too long
    for varchar(44) » sur `p256dh`, qui en fait 87). Un 201 prouve les deux à
    la fois — le schéma accepte, et la colonne encaisse sans tronquer."""
    su = login(client, SU_EMAIL, SU_PASSWORD)
    adm = onboard(client, su, "PSH1", "admin@psh1.fr")
    parent, _ = _parent_abonne(client, adm)

    corps = abonnement()
    ck("la clé p256dh fait bien 87 caractères", len(corps["p256dh"]), 87)
    ck("le secret auth fait bien 22 caractères", len(corps["auth_key"]), 22)

    r = client.post("/notifications/subscriptions", headers=parent, json=corps)
    ck("abonnement enregistré", r.status_code, 201)
    ck("l'endpoint est rendu intact", r.json()["endpoint"], corps["endpoint"])

    # Aucun secret ne repart dans la réponse : il n'a rien à faire dans les
    # journaux d'accès ni dans un cache de navigateur.
    ck("pas de p256dh en réponse", "p256dh" in r.json(), False)
    ck("pas de auth_key en réponse", "auth_key" in r.json(), False)


def test_le_corps_ne_choisit_pas_le_compte(client, push_envoyes):
    """Le compte vient du JETON. L'ancien schéma exigeait un `user_id` que le
    router ignorait : un client qui l'omettait (le nôtre) recevait 422, et un
    client qui le falsifiait pouvait croire abonner quelqu'un d'autre."""
    su = login(client, SU_EMAIL, SU_PASSWORD)
    adm = onboard(client, su, "PSH2", "admin@psh2.fr")
    parent_a, _ = _parent_abonne(client, adm, "a")
    parent_b, _ = _parent_abonne(client, adm, "b")

    corps = abonnement()
    corps["user_id"] = str(uuid.uuid4())  # ignoré, pas refusé
    ck("un user_id parasite n'empêche pas l'abonnement",
       client.post("/notifications/subscriptions", headers=parent_a,
                   json=corps).status_code, 201)

    ck("l'abonnement appartient à l'appelant",
       client.post("/notifications/test", headers=parent_a).json()["subscriptions"], 1)
    ck("et à personne d'autre",
       client.post("/notifications/test", headers=parent_b).status_code, 404)


def test_un_second_appareil_ne_desabonne_pas_le_premier(client, push_envoyes):
    """⚠️ L'ancienne version remplaçait l'UNIQUE ligne du compte : s'abonner
    sur son téléphone désabonnait son ordinateur, en silence. La clé est le
    couple (compte, endpoint), un endpoint identifiant un navigateur."""
    su = login(client, SU_EMAIL, SU_PASSWORD)
    adm = onboard(client, su, "PSH3", "admin@psh3.fr")
    parent, _ = _parent_abonne(client, adm)

    telephone = abonnement()
    ordinateur = abonnement()
    for corps in (telephone, ordinateur):
        ck("abonnement accepté",
           client.post("/notifications/subscriptions", headers=parent,
                       json=corps).status_code, 201)

    ck("les DEUX appareils sont abonnés",
       client.post("/notifications/test", headers=parent).json()["subscriptions"], 2)

    # Réabonner le même endpoint met la ligne à jour, il n'en crée pas une
    # seconde — sinon chaque notification arriverait en double.
    rotation = dict(telephone, p256dh=cle_p256dh(), auth_key=cle_auth())
    ck("rotation de clés sur un endpoint connu",
       client.post("/notifications/subscriptions", headers=parent,
                   json=rotation).status_code, 201)
    ck("toujours deux appareils, pas trois",
       client.post("/notifications/test", headers=parent).json()["subscriptions"], 2)


def test_desabonnement_par_appareil_idempotent_et_borne_au_compte(client, push_envoyes):
    su = login(client, SU_EMAIL, SU_PASSWORD)
    adm = onboard(client, su, "PSH4", "admin@psh4.fr")
    parent_a, _ = _parent_abonne(client, adm, "a")
    parent_b, _ = _parent_abonne(client, adm, "b")

    appareil_a = abonnement()
    client.post("/notifications/subscriptions", headers=parent_a, json=appareil_a)
    client.post("/notifications/subscriptions", headers=parent_b, json=abonnement())

    # Un compte ne peut pas retirer l'appareil d'un autre, même en connaissant
    # son endpoint : la requête est acceptée (idempotente) mais sans effet.
    ck("retrait d'un endpoint étranger : 204 sans effet",
       client.post("/notifications/subscriptions/unsubscribe", headers=parent_b,
                   json={"endpoint": appareil_a["endpoint"]}).status_code, 204)
    ck("l'appareil de A est intact",
       client.post("/notifications/test", headers=parent_a).json()["subscriptions"], 1)

    ck("retrait par son propriétaire",
       client.post("/notifications/subscriptions/unsubscribe", headers=parent_a,
                   json={"endpoint": appareil_a["endpoint"]}).status_code, 204)
    ck("rejouer le retrait reste 204",
       client.post("/notifications/subscriptions/unsubscribe", headers=parent_a,
                   json={"endpoint": appareil_a["endpoint"]}).status_code, 204)
    ck("A n'a plus d'abonnement",
       client.post("/notifications/test", headers=parent_a).status_code, 404)


def test_les_bornes_de_cles_encadrent_les_valeurs_reelles(client):
    """La borne doit refuser le manifestement faux SANS refuser le réel.
    C'est précisément là que l'ancienne version se trompait : son plancher
    tombait ENTRE les deux tailles légitimes (22 et 87)."""
    su = login(client, SU_EMAIL, SU_PASSWORD)
    adm = onboard(client, su, "PSH5", "admin@psh5.fr")
    parent, _ = _parent_abonne(client, adm)

    trop_court = dict(abonnement(), auth_key="court")
    ck("un secret manifestement trop court est refusé",
       client.post("/notifications/subscriptions", headers=parent,
                   json=trop_court).status_code, 422)

    p256dh_trop_court = dict(abonnement(), p256dh=cle_auth())
    ck("une clé publique de la taille d'un secret est refusée",
       client.post("/notifications/subscriptions", headers=parent,
                   json=p256dh_trop_court).status_code, 422)

    ck("et la vraie passe",
       client.post("/notifications/subscriptions", headers=parent,
                   json=abonnement()).status_code, 201)


def test_un_compte_sans_etablissement_ne_peut_pas_s_abonner(client):
    """Le superadmin n'a pas d'établissement : aucun événement ne lui serait
    destiné, un abonnement serait une ligne morte."""
    su = login(client, SU_EMAIL, SU_PASSWORD)
    ck("superadmin refusé",
       client.post("/notifications/subscriptions", headers=su,
                   json=abonnement()).status_code, 403)


def test_la_cle_publique_dit_clairement_qu_elle_manque(client, monkeypatch):
    """⚠️ Le vrai piège de ce module en production : les clés VAPID n'y avaient
    JAMAIS été posées. Sans clé, la route doit le dire — et en 503, parce que
    c'est une dépendance absente, pas un bug de serveur."""
    monkeypatch.setattr(settings, "vapid_public_key", "")
    ck("sans clé configurée : 503",
       client.get("/notifications/vapid-public-key").status_code, 503)

    monkeypatch.setattr(settings, "vapid_public_key", "BO9VP1AQ-fausse-cle")
    r = client.get("/notifications/vapid-public-key")
    ck("avec clé : 200", r.status_code, 200)
    ck("c'est bien la publique qui sort", r.json()["vapidPublicKey"], "BO9VP1AQ-fausse-cle")


# ── Envoi ────────────────────────────────────────────────────────

def test_un_endpoint_revoque_est_retire_mais_une_panne_passagere_non(client, monkeypatch):
    """⚠️ La distinction tient tout le ménage : un 410 est définitif (navigateur
    désinstallé, site effacé) et la ligne ne recevra plus jamais rien ; un 503
    est passager et supprimer la ligne désabonnerait quelqu'un parce que le
    service de push a eu une mauvaise minute."""
    import pywebpush

    su = login(client, SU_EMAIL, SU_PASSWORD)
    adm = onboard(client, su, "PSH6", "admin@psh6.fr")
    parent, _ = _parent_abonne(client, adm)

    monkeypatch.setattr(settings, "vapid_private_key", "fausse-cle-privee")
    client.post("/notifications/subscriptions", headers=parent, json=abonnement())

    def echec(code):
        class Reponse:
            status_code = code

        def _webpush(**kwargs):
            exc = pywebpush.WebPushException("refusé")
            exc.response = Reponse()
            raise exc

        return _webpush

    monkeypatch.setattr(pywebpush, "webpush", echec(503))
    r = client.post("/notifications/test", headers=parent)
    ck("panne passagère : rien n'est envoyé", r.json()["sent"], 0)
    ck("mais l'abonnement est CONSERVÉ", r.json()["subscriptions"], 1)

    monkeypatch.setattr(pywebpush, "webpush", echec(410))
    ck("endpoint révoqué : l'abonnement est retiré d'abord",
       client.post("/notifications/test", headers=parent).json()["subscriptions"], 1)
    ck("et il a bien disparu",
       client.post("/notifications/test", headers=parent).status_code, 404)


def test_une_diffusion_pousse_vraiment_aux_parents_dans_leur_langue(client, push_envoyes):
    """Le bout en bout qui manquait : une diffusion admin atteint réellement
    l'abonnement d'un parent, avec une destination exploitable et le texte
    rendu dans la langue du DESTINATAIRE — pas celle de l'admin."""
    su = login(client, SU_EMAIL, SU_PASSWORD)
    adm = onboard(client, su, "PSH7", "admin@psh7.fr")
    parent, _ = _parent_abonne(client, adm)

    ck("le parent s'abonne",
       client.post("/notifications/subscriptions", headers=parent,
                   json=abonnement()).status_code, 201)
    ck("et choisit l'anglais",
       client.patch("/auth/me/locale", headers=parent,
                    json={"locale": "en"}).status_code, 200)

    push_envoyes.clear()
    r = client.post("/messaging/announcements", headers=adm,
                    json={"title": "Sortie", "body": "Rendez-vous à 8h"})
    ck("diffusion publiée", r.status_code, 201)

    ck("un push est bien parti", len(push_envoyes), 1)
    charge = push_envoyes[0]["data"]
    ck("le titre est rendu en anglais", '"title": "New announcement"' in charge, True)
    ck("la destination mène à l'onglet des diffusions",
       "/dashboard/parent/messaging?tab=announcements" in charge, True)
    ck("la destination est un CHEMIN, jamais une URL absolue",
       "http" in charge.split('"url": "')[1].split('"')[0], False)
