"""Relance d'invitation — parents et personnel.

⚠️ Le mot de passe d'ORIGINE est irrécupérable (bcrypt). La relance en génère
donc un neuf et renvoie l'email de bienvenue. Ces contrôles portent sur ce qui
compte vraiment : l'ancien mot de passe cesse de fonctionner, le NOUVEAU
fonctionne, et un échec d'envoi ne laisse JAMAIS le destinataire dehors.
"""

import pytest

from app.modules.auth import service as auth_service
from app.modules.auth.email import EmailDeliveryError
from app.modules.auth.schemas import validate_password_strength
from tests.helpers import ck, login, onboard


@pytest.fixture
def emails_captures(monkeypatch):
    """Capture le mot de passe parti dans l'email — il n'existe nulle part ailleurs."""
    envoyes = []

    async def faux_envoi(**kwargs):
        envoyes.append(kwargs)

    monkeypatch.setattr(auth_service, "send_welcome_email", faux_envoi)
    return envoyes


def _cree_parent(client, adm, suffixe=""):
    enfant = client.post("/children", headers=adm, json={
        "last_name": "Test", "first_names": "Enfant",
        "birth_date": "2022-01-01", "admission_date": "2024-09-01",
        "residence_address": "Cotonou", "guardians": [],
    })
    assert enfant.status_code == 201, enfant.text[:200]
    r = client.post("/parents", headers=adm, json={
        "first_name": "Pa", "last_name": "Rent", "nickname": "Papa",
        "phone": "+22900000000", "email": f"parent{suffixe}@relance.fr",
        "password": "Initial2026", "child_ids": [enfant.json()["id"]],
    })
    assert r.status_code == 201, r.text[:300]
    return r.json()["id"]


def test_relance_parent_remplace_le_mot_de_passe(client, emails_captures):
    su = login(client, "tech@lespetitsrayonsdesoleil.fr", "Geek-Ot@ku#2002")
    adm = onboard(client, su, "RLNC", "admin@rlnc.fr")
    parent_id = _cree_parent(client, adm)

    ck("le mot de passe initial fonctionne",
       client.post("/auth/login", json={"email": "parent@relance.fr",
                                        "password": "Initial2026"}).status_code, 200)

    emails_captures.clear()
    r = client.post(f"/parents/{parent_id}/resend-invitation", headers=adm)
    ck("relance acceptée", r.status_code, 204)
    ck("un email est bien reparti", len(emails_captures), 1)

    nouveau = emails_captures[0]["temp_password"]
    ck("l'email part à la MÊME adresse", emails_captures[0]["email"], "parent@relance.fr")
    ck("le nouveau mot de passe diffère de l'ancien", nouveau != "Initial2026", True)

    # Conformité : contrôlée en VOLUME ci-dessous, pas sur ce tirage unique.
    validate_password_strength(nouveau)

    ck("l'ANCIEN mot de passe ne marche plus",
       client.post("/auth/login", json={"email": "parent@relance.fr",
                                        "password": "Initial2026"}).status_code, 401)
    ck("le NOUVEAU mot de passe fonctionne",
       client.post("/auth/login", json={"email": "parent@relance.fr",
                                        "password": nouveau}).status_code, 200)


def test_echec_d_envoi_ne_laisse_pas_le_parent_dehors(client, monkeypatch):
    """⚠️ Le contrôle qui compte le plus : si l'email ne part pas, le mot de
    passe NE DOIT PAS avoir changé — sinon on met dehors quelqu'un qui avait
    peut-être encore accès, sans aucun moyen de le lui dire."""
    su = login(client, "tech@lespetitsrayonsdesoleil.fr", "Geek-Ot@ku#2002")
    adm = onboard(client, su, "RLN2", "admin@rln2.fr")
    parent_id = _cree_parent(client, adm, "2")

    async def smtp_en_panne(**kwargs):
        raise EmailDeliveryError("SMTP indisponible")

    monkeypatch.setattr(auth_service, "send_welcome_email", smtp_en_panne)

    r = client.post(f"/parents/{parent_id}/resend-invitation", headers=adm)
    ck("échec SMTP → 503", r.status_code, 503)
    ck("le mot de passe d'origine fonctionne TOUJOURS",
       client.post("/auth/login", json={"email": "parent2@relance.fr",
                                        "password": "Initial2026"}).status_code, 200)


def test_relance_personnel_et_isolation(client, emails_captures):
    su = login(client, "tech@lespetitsrayonsdesoleil.fr", "Geek-Ot@ku#2002")
    adm_a = onboard(client, su, "RLNA", "admin@rlna.fr")
    adm_b = onboard(client, su, "RLNB", "admin@rlnb.fr")

    r = client.post("/staff", headers=adm_a, json={
        "first_name": "St", "last_name": "Aff", "nickname": "Tata",
        "phone": "+22900000001", "email": "staff@relance.fr",
        "password": "Initial2026", "staff_type": "educateur",
    })
    ck("personnel créé", r.status_code, 201)
    staff_id = r.json()["id"]

    emails_captures.clear()
    ck("relance du personnel acceptée",
       client.post(f"/staff/{staff_id}/resend-invitation", headers=adm_a).status_code, 204)
    nouveau = emails_captures[-1]["temp_password"]
    ck("le nouveau mot de passe du personnel fonctionne",
       client.post("/auth/login", json={"email": "staff@relance.fr",
                                        "password": nouveau}).status_code, 200)

    # Isolation : l'admin d'un AUTRE établissement ne doit rien pouvoir relancer.
    ck("relance inter-établissement → 404",
       client.post(f"/staff/{staff_id}/resend-invitation", headers=adm_b).status_code, 404)


def test_le_generateur_respecte_toujours_la_politique():
    """⚠️ Contrôle en VOLUME, et surtout pas par un appel HTTP.

    La première version de ce fichier se contentait du mot de passe parti dans
    l'email — un seul tirage. Prouvé par sabotage : en retirant la garantie du
    chiffre, ce contrôle unique passait quand même, parce que les dix caractères
    libres en contiennent un dans ~84 % des cas. Un test qui réussit cinq fois
    sur six sur du code cassé ne prouve rien.

    L'ancien générateur produisait 15,4 % de mots de passe sans chiffre, alors
    que `validate_password_strength` en exige un : un compte sur six recevait
    un mot de passe que la plateforme aurait refusé s'il avait voulu le choisir.
    """
    from app.modules.auth.security import generate_temp_password

    tirages = [generate_temp_password() for _ in range(500)]
    non_conformes = []
    for mdp in tirages:
        try:
            validate_password_strength(mdp)
        except ValueError:
            non_conformes.append(mdp)

    ck("aucun mot de passe non conforme sur 500 tirages", non_conformes, [])
    ck("tous distincts (pas de graine figée)", len(set(tirages)), 500)
    # Lisibilité : il est RECOPIÉ À LA MAIN depuis un email, souvent sur mobile.
    ambigus = [c for mdp in tirages for c in mdp if c in "O0lI1"]
    ck("aucun caractère ambigu (O/0, l/I/1)", ambigus, [])


def test_le_double_clic_ne_perime_pas_la_premiere_invitation(client, emails_captures):
    """⚠️ Le vrai danger de cette fonctionnalité n'est pas l'abus — le geste
    exige `parents:write` — mais le DOUBLE CLIC.

    La seconde relance régénère un mot de passe, donc PÉRIME l'email de la
    première, que le destinataire est peut-être en train de lire. Deux
    invitations dont la plus ancienne ne marche plus est le pire résultat
    possible pour un dépannage : on a « aidé » quelqu'un en lui donnant deux
    messages dont il ne sait pas lequel est bon.
    """
    su = login(client, "tech@lespetitsrayonsdesoleil.fr", "Geek-Ot@ku#2002")
    adm = onboard(client, su, "RLN3", "admin@rln3.fr")
    parent_id = _cree_parent(client, adm, "3")

    emails_captures.clear()
    ck("première relance acceptée",
       client.post(f"/parents/{parent_id}/resend-invitation", headers=adm).status_code, 204)
    premier = emails_captures[-1]["temp_password"]

    r = client.post(f"/parents/{parent_id}/resend-invitation",
                    headers={**adm, "Accept-Language": "fr-FR"})
    ck("la relance immédiate suivante est refusée", r.status_code, 429)
    ck("  le délai restant est dit", "secondes" in r.json()["detail"], True)
    ck("  et le message parle d'invitation, pas de force brute",
       "invitation" in r.json()["detail"].lower(), True)

    ck("aucun second email n'est parti", len(emails_captures), 1)
    ck("le mot de passe du PREMIER email fonctionne toujours",
       client.post("/auth/login", json={"email": "parent3@relance.fr",
                                        "password": premier}).status_code, 200)


def test_un_echec_smtp_ne_bloque_pas_la_relance_suivante(client, monkeypatch):
    """La temporisation protège un email DÉLIVRÉ. Si l'envoi a échoué, rien
    n'a été délivré et le mot de passe est annulé par le rollback : laisser le
    verrou posé interdirait de réessayer dès que le SMTP est revenu — soit
    exactement au moment où l'admin a besoin que ça marche."""
    su = login(client, "tech@lespetitsrayonsdesoleil.fr", "Geek-Ot@ku#2002")
    adm = onboard(client, su, "RLN4", "admin@rln4.fr")
    parent_id = _cree_parent(client, adm, "4")

    async def smtp_en_panne(**kwargs):
        raise EmailDeliveryError("SMTP indisponible")

    monkeypatch.setattr(auth_service, "send_welcome_email", smtp_en_panne)
    ck("échec SMTP → 503",
       client.post(f"/parents/{parent_id}/resend-invitation", headers=adm).status_code, 503)

    envoyes = []

    async def smtp_revenu(**kwargs):
        envoyes.append(kwargs)

    monkeypatch.setattr(auth_service, "send_welcome_email", smtp_revenu)
    ck("on peut réessayer tout de suite, sans attendre la temporisation",
       client.post(f"/parents/{parent_id}/resend-invitation", headers=adm).status_code, 204)
    ck("et l'email part bien", len(envoyes), 1)


def test_la_relance_accepte_un_mot_de_passe_fourni(client, emails_captures):
    """Le mot de passe GÉNÉRÉ n'est lisible par personne — ni par l'admin, ni
    par son écran : il n'existe que dans l'email parti, et le retourner dans la
    réponse HTTP est ce que ce module refuse. Fournir le mot de passe est donc
    le seul moyen de pouvoir transmettre les accès par un AUTRE canal que
    l'email — précisément le canal qui échoue quand on en a besoin.

    Ce qui est vérifié ici : le mot de passe fourni est bien celui qui vaut
    pour la connexion, c'est lui qui part dans l'email, et **rien** ne revient
    dans la réponse.
    """
    su = login(client, "tech@lespetitsrayonsdesoleil.fr", "Geek-Ot@ku#2002")
    adm = onboard(client, su, "RLNF", "admin@rlnf.fr")
    parent_id = _cree_parent(client, adm, suffixe="-fourni")
    email = "parent-fourni@relance.fr"

    emails_captures.clear()
    r = client.post(f"/parents/{parent_id}/resend-invitation", headers=adm,
                    json={"password": "Dicte2026"})
    ck("relance acceptée", r.status_code, 204)
    ck("la réponse ne porte AUCUN corps", r.text, "")
    ck("un email est bien reparti", len(emails_captures), 1)
    ck("c'est le mot de passe FOURNI qui part dans l'email",
       emails_captures[0]["temp_password"], "Dicte2026")
    ck("l'ancien ne marche plus",
       client.post("/auth/login", json={"email": email,
                                        "password": "Initial2026"}).status_code, 401)
    ck("le mot de passe fourni ouvre la session",
       client.post("/auth/login", json={"email": email,
                                        "password": "Dicte2026"}).status_code, 200)


def test_un_mot_de_passe_fourni_FAIBLE_est_refuse(client, emails_captures):
    """La politique vaut aussi ici : laisser passer « 123456 » parce que c'est
    un admin qui le saisit ouvrirait une porte que tout le reste de la
    plateforme ferme (`StrongPassword`). Et l'ancien mot de passe doit survivre
    au refus — un 422 ne met personne dehors."""
    su = login(client, "tech@lespetitsrayonsdesoleil.fr", "Geek-Ot@ku#2002")
    adm = onboard(client, su, "RLNW", "admin@rlnw.fr")
    parent_id = _cree_parent(client, adm, suffixe="-faible")

    emails_captures.clear()
    r = client.post(f"/parents/{parent_id}/resend-invitation", headers=adm,
                    json={"password": "court"})
    ck("mot de passe faible refusé", r.status_code, 422)
    ck("aucun email n'est parti", len(emails_captures), 0)
    ck("l'ancien mot de passe fonctionne toujours",
       client.post("/auth/login", json={"email": "parent-faible@relance.fr",
                                        "password": "Initial2026"}).status_code, 200)


def test_le_personnel_aussi_accepte_un_mot_de_passe_fourni(client, emails_captures):
    """Les deux modules partagent le geste (`auth_service.resend_invitation`) :
    une seule des deux routes câblée, et l'écran du personnel proposerait une
    copie d'accès qui ne correspondrait à rien."""
    su = login(client, "tech@lespetitsrayonsdesoleil.fr", "Geek-Ot@ku#2002")
    adm = onboard(client, su, "RLNS", "admin@rlns.fr")
    r = client.post("/staff", headers=adm, json={
        "first_name": "Ta", "last_name": "Ta", "nickname": "Tata",
        "phone": "+22900000000", "email": "staff-fourni@relance.fr",
        "password": "Initial2026", "staff_type": "educateur",
    })
    ck("personnel créé", r.status_code, 201)
    staff_id = r.json()["id"]

    emails_captures.clear()
    ck("relance acceptée", client.post(
        f"/staff/{staff_id}/resend-invitation", headers=adm,
        json={"password": "Dicte2026"}).status_code, 204)
    ck("c'est le mot de passe FOURNI qui part",
       emails_captures[0]["temp_password"], "Dicte2026")
    ck("il ouvre la session",
       client.post("/auth/login", json={"email": "staff-fourni@relance.fr",
                                        "password": "Dicte2026"}).status_code, 200)
