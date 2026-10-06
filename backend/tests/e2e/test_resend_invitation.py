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
