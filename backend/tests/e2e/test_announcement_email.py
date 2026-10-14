"""Notification email à la publication d'une diffusion.

Une diffusion ne disposait que du WebSocket et du push. Aucun des deux
n'atteint un parent qui n'a rien fait : le premier suppose un onglet ouvert à
cet instant, le second un abonnement PAR APPAREIL que le parent doit accorder
lui-même. L'email est le seul canal qui n'exige ni l'un ni l'autre.

Ce que ces contrôles protègent, dans l'ordre d'importance :

1. **Le CIBLAGE est respecté.** Un email parti à un département non concerné
   est exactement ce qu'un ciblage sert à éviter — et c'est le genre de fuite
   qu'aucun écran ne montre, puisqu'elle se produit dans la boîte de quelqu'un
   d'autre.
2. **Le lien mène à LA diffusion**, pas à l'onglet qui en contient trente.
3. **Un échec SMTP ne bloque JAMAIS la publication** — best-effort, comme la
   notification de rapport, à l'opposé du mot de passe temporaire.
4. **La langue est celle du DESTINATAIRE**, pas celle de l'admin qui publie.
"""
import time
from html import unescape

import pytest

from app.modules.messaging import service as messaging_service
from app.modules.auth.email import EmailDeliveryError
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


@pytest.fixture
def emails(monkeypatch):
    """Capture les envois — `MAIL_SUPPRESS_SEND` les rendrait invisibles."""
    envoyes = []

    async def faux_envoi(**kwargs):
        envoyes.append(kwargs)

    monkeypatch.setattr(messaging_service, "send_announcement_email", faux_envoi)
    return envoyes


def _attendre(envoyes, combien, delai=5.0):
    """⚠️ L'envoi part EN FOND (la publication ne l'attend pas, cf. service) :
    sans cette attente, le test lirait la liste avant que la tâche n'ait
    tourné — il passerait ou non selon la charge de la machine."""
    fin = time.monotonic() + delai
    while time.monotonic() < fin and len(envoyes) < combien:
        time.sleep(0.05)
    return envoyes


def _parent(c, adm, email, child_ids, locale=None):
    r = c.post("/parents", json={
        "first_name": "Awa", "last_name": "Parent", "nickname": "P",
        "phone": "+229", "email": email, "password": "Parent2026",
        "child_ids": child_ids,
    }, headers=adm)
    assert r.status_code == 201, r.text[:300]
    if locale:
        jeton = login(c, email, "Parent2026")
        assert c.patch("/auth/me/locale", json={"locale": locale},
                       headers=jeton).status_code in (200, 204)
    return r.json()["id"]


def _deux_departements(c, adm):
    """Deux départements PEUPLÉS : un ciblage ne se vérifie que si le
    département écarté a réellement un parent à écarter."""
    sortie = []
    for code in ("Mat", "Creche"):
        dep = c.post("/departments", json={"name": code}, headers=adm).json()
        sec = c.post("/sections", json={"department_id": dep["id"], "name": f"S{code}"},
                     headers=adm).json()
        enfant = c.post("/children", json={
            "last_name": code, "first_names": "Enfant",
            "birth_date": "2023-01-01", "admission_date": "2025-01-01",
            "residence_address": "x", "department_id": dep["id"],
            "section_id": sec["id"], "guardians": [],
        }, headers=adm).json()
        sortie.append((dep, enfant))
    return sortie


def test_diffusion_ciblee_n_ecrit_qu_aux_departements_concernes(client, emails):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "MAIL", "admin@mail.fr")
    (dep_vise, enfant_vise), (dep_hors, enfant_hors) = _deux_departements(c, adm)
    _parent(c, adm, "vise@e.fr", [enfant_vise["id"]])
    _parent(c, adm, "hors@e.fr", [enfant_hors["id"]])

    emails.clear()
    r = c.post("/messaging/announcements", json={
        "title": "Sortie au zoo", "body": "Rendez-vous à 8h.",
        "department_ids": [dep_vise["id"]],
    }, headers=adm)
    ck("diffusion publiée", r.status_code, 201)
    annonce_id = r.json()["id"]

    _attendre(emails, 1)
    time.sleep(0.3)  # laisser le temps à un envoi de TROP d'arriver, s'il devait
    destinataires = sorted(e["to"] for e in emails)
    ck("un seul email, au parent du département visé", destinataires, ["vise@e.fr"])

    envoi = emails[0]
    ck("le titre est repris", envoi["title"], "Sortie au zoo")
    # ⚠️ Le CORPS n'est pas repris : un email part en clair chez un
    # fournisseur de messagerie, et une diffusion peut nommer des enfants.
    ck("le corps de la diffusion ne voyage pas",
       any("Rendez-vous" in str(v) for v in envoi.values()), False)
    ck("la diffusion est désignée", str(envoi["announcement_id"]), annonce_id)
    ck("l'établissement est nommé", envoi["establishment_name"] != "", True)


def test_broadcast_ecrit_a_tous_les_parents_actifs(client, emails):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "MAI2", "admin@mai2.fr")
    (_, enfant_a), (_, enfant_b) = _deux_departements(c, adm)
    _parent(c, adm, "a@e.fr", [enfant_a["id"]])
    inactif = _parent(c, adm, "b@e.fr", [enfant_b["id"]])
    ck("parent désactivé", c.patch(f"/parents/{inactif}", json={"is_active": False},
                                   headers=adm).status_code, 200)

    emails.clear()
    ck("broadcast publié", c.post("/messaging/announcements", json={
        "title": "Fermeture exceptionnelle", "body": "Lundi.",
    }, headers=adm).status_code, 201)

    _attendre(emails, 1)
    time.sleep(0.3)
    # Un compte désactivé ne peut plus se connecter : lui écrire enverrait vers
    # un espace qu'il ne peut pas ouvrir.
    # ⚠️ Deux filtres `is_active` le garantissent — celui de l'audience et celui
    # de la requête d'envoi — donc saboter l'UN des deux laisse ce test passer.
    # Ce n'est pas qu'il ne vérifie rien : il vérifie le RÉSULTAT, qui tient
    # encore quand une des deux ceintures lâche. Les retirer tous les deux le
    # fait bien tomber (vérifié).
    ck("le parent actif seul est prévenu", sorted(e["to"] for e in emails), ["a@e.fr"])


def test_le_lien_mene_a_la_diffusion_et_pas_a_l_onglet(client, emails, monkeypatch):
    """⚠️ Le contrôle du BOUTON — la raison d'être de cet email.

    Rendu avec le vrai template : une variable mal nommée produirait un
    `href` vide, et un bouton vide reste parfaitement cliquable.
    """
    from app.core import links
    from app.modules.messaging.email import send_announcement_email

    rendus = []

    async def capture(*, to, subject, html):
        rendus.append((to, subject, html))

    monkeypatch.setattr("app.modules.messaging.email.send_html_email", capture)
    import asyncio
    asyncio.run(send_announcement_email(
        to="p@e.fr", parent_first_name="Awa", announcement_id="a-42",
        title="Règlement intérieur", establishment_name="LPRDS",
        requires_signature=True,
    ))
    _, sujet, html = rendus[0]

    attendu = links.url(links.PARENT_MESSAGING,
                        **links.parent_announcement_query("a-42"))
    # ⚠️ Le template échappe le `&` du query en `&amp;` — c'est CORRECT en HTML
    # (le navigateur le relit comme `&`), et un test qui chercherait l'URL
    # brute conclurait à tort que le lien est faux. On déséchappe pour
    # comparer, plutôt que de recopier la forme échappée : recopier, c'est
    # figer dans le test la sortie du moteur de template.
    rendu = unescape(html)
    ck("le lien pointe la diffusion", attendu in rendu, True)
    ck("  avec son identifiant", "announcement=a-42" in rendu, True)
    ck("  et le bon onglet", "tab=announcements" in rendu, True)
    ck("  sous l'espace parent", "/dashboard/parent/messaging" in rendu, True)
    ck("  et le href n'est pas vide", 'href=""' in html, False)
    ck("le titre est dans le sujet", "Règlement intérieur" in sujet, True)
    # Une attestation attendue demande un GESTE : l'email doit le dire, sinon
    # il annonce « une information est disponible » et rien ne sera signé.
    ck("la signature attendue est annoncée", "signer" in html.lower(), True)


def test_un_echec_smtp_ne_prive_ni_la_publication_ni_les_AUTRES(client, monkeypatch):
    """Best-effort strict, et surtout par DESTINATAIRE.

    ⚠️ Depuis que l'envoi part en fond, « la publication répond 201 » ne prouve
    plus rien : elle répondrait 201 même si la tâche explosait au premier
    parent. Ce qui se vérifie ici, c'est que le SECOND parent reçoit quand même
    son email — sur une liste de cent, une adresse morte ne doit pas faire
    taire les quatre-vingt-dix-neuf autres.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "MAI3", "admin@mai3.fr")
    (_, enfant_a), (_, enfant_b) = _deux_departements(c, adm)
    _parent(c, adm, "panne@e.fr", [enfant_a["id"]])
    _parent(c, adm, "ok@e.fr", [enfant_b["id"]])

    envoyes = []

    async def smtp_capricieux(**kwargs):
        if kwargs["to"] == "panne@e.fr":
            raise EmailDeliveryError("SMTP indisponible")
        envoyes.append(kwargs)

    monkeypatch.setattr(messaging_service, "send_announcement_email", smtp_capricieux)

    r = c.post("/messaging/announcements", json={
        "title": "Réunion", "body": "Jeudi.",
    }, headers=adm)
    ck("la diffusion est publiée malgré l'échec d'envoi", r.status_code, 201)
    _attendre(envoyes, 1)
    ck("l'autre parent est prévenu quand même", [e["to"] for e in envoyes], ["ok@e.fr"])
    ck("et la diffusion est bien lisible par le parent en panne d'email",
       c.get("/messaging/announcements", headers=login(c, "panne@e.fr", "Parent2026"))
        .json()["total"], 1)


def test_la_langue_est_celle_du_destinataire(client, emails):
    """Une diffusion touche tout l'établissement, anglophones compris. L'admin
    qui publie n'a pas à connaître la langue de chacun."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "MAI4", "admin@mai4.fr")
    (_, enfant_a), (_, enfant_b) = _deux_departements(c, adm)
    _parent(c, adm, "fr@e.fr", [enfant_a["id"]])
    _parent(c, adm, "en@e.fr", [enfant_b["id"]], locale="en")

    emails.clear()
    ck("broadcast publié", c.post("/messaging/announcements", json={
        "title": "Fermeture", "body": "Lundi.",
    }, headers=adm).status_code, 201)

    _attendre(emails, 2)
    par_adresse = {e["to"]: str(e["locale"]) for e in emails}
    ck("le parent francophone reçoit du français", par_adresse["fr@e.fr"], "fr")
    ck("le parent anglophone reçoit de l'anglais", par_adresse["en@e.fr"], "en")
