"""Validation d'un rapport : ce que la requête attend, et ce qu'elle n'attend plus.

Un établissement a signalé « Impossible de joindre le serveur » à la
soumission et à la validation des rapports — surtout bi-mensuels. Ce n'était
pas le réseau : `apiClient` plafonne ses appels à 10 s, et la validation
tenait la requête le temps d'un email PAR PARENT (60 s de plafond SMTP chacun,
le défaut d'`aiosmtplib`, jamais surchargé) puis d'un push PAR APPAREIL
(10 000 s de plafond côté `pywebpush`). Le serveur menait pourtant l'action à
terme : l'admin lisait un échec sur une publication réussie, déjà partie chez
le parent, et son second clic récoltait un 409.
"""

import time

from app.modules.reports import service as reports_service
from app.modules.auth.email import EmailDeliveryError
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

FULL_BIMENSUEL = {
    "oral_written_language": "Progrès sur le vocabulaire, reconnaît son prénom écrit.",
    "physical_activities": "Participe activement aux jeux de motricité.",
    "artistic_activities": "Aime le dessin et la peinture au doigt.",
    "math_foundations": "Commence à compter jusqu'à 5.",
    "world_exploration": "Curieux des plantes du jardin pédagogique.",
    "english": "Reconnaît quelques couleurs en anglais.",
    "class_behaviors": ["joyful"],
    "peer_relations": ["sociable"],
    "emotion_management": ["autonomous"],
    "teacher_observations": "Belle progression sur la période, continue ainsi.",
}


def _attendre(liste, combien, delai=10.0):
    """⚠️ L'envoi part EN FOND : sans cette attente, le test lirait la liste
    avant que la tâche n'ait tourné, et passerait selon la charge machine."""
    fin = time.monotonic() + delai
    while time.monotonic() < fin and len(liste) < combien:
        time.sleep(0.05)
    return liste


def _monter(c, code, educ_email):
    """Un bi-mensuel SOUMIS par l'éducatrice — l'état où l'admin valide."""
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, code, f"admin@{code.lower()}.fr")

    dep = c.post("/departments", json={"name": "Crèche"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    c.post(f"/reports/settings/departments/{dep['id']}/types/bi_mensuel", headers=adm)

    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": "Tata",
           "phone": "+229", "email": educ_email, "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    educ_id = c.get(f"/staff?search={educ_email}", headers=adm).json()["items"][0]["id"]
    role = c.post("/rbac/roles", json={"name": "Rédactrice",
                  "permissions": ["reports:read", "reports:write"]}, headers=adm).json()
    c.post(f"/rbac/staff/{educ_id}/roles/{role['id']}", headers=adm)
    educ = login(c, educ_email, "Staff2026")

    child = c.post("/children", json={
        "last_name": "Alpha", "first_names": "Emma", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"], "guardians": []},
        headers=adm).json()
    c.post("/groups", json={"section_id": sec["id"], "educatrice_id": educ_id,
           "child_ids": [child["id"]]}, headers=adm)

    return adm, educ, child, dep, sec


def _parent(c, adm, email, child_id):
    r = c.post("/parents", json={
        "first_name": "Awa", "last_name": "Parent", "nickname": "P",
        "phone": "+229", "email": email, "password": "Parent2026",
        "child_ids": [child_id]}, headers=adm)
    assert r.status_code == 201, r.text[:300]
    return r.json()["id"]


def _soumettre(c, educ, child_id, reference_date="2026-07-10"):
    rep = c.post("/reports", json={
        "child_id": child_id, "report_type": "bi_mensuel",
        "reference_date": reference_date, "content": FULL_BIMENSUEL}, headers=educ)
    assert rep.status_code == 201, rep.text[:300]
    rid = rep.json()["id"]
    assert c.post(f"/reports/{rid}/submit", headers=educ).status_code == 200
    return rid


def test_la_validation_n_attend_ni_email_ni_push(client, monkeypatch):
    """La requête rend la main AVANT que les notifications ne soient parties.

    Prouvé par sabotage : l'envoi remis dans la requête, la validation met
    plus de deux secondes et le contrôle de latence tombe — c'est-à-dire
    exactement le dépassement que l'établissement voyait, en plus lent encore
    avec un vrai serveur SMTP.
    """
    c = client
    adm, educ, child, _dep, _sec = _monter(c, "VALLAT", "educ@vallat.fr")
    _parent(c, adm, "parent@vallat.fr", child["id"])
    rid = _soumettre(c, educ, child["id"])

    partis = []

    async def envoi_lent(**kwargs):
        import asyncio
        await asyncio.sleep(2)
        partis.append(kwargs)

    monkeypatch.setattr(reports_service, "send_report_available_email", envoi_lent)

    debut = time.monotonic()
    r = c.post(f"/reports/{rid}/validate", headers=adm)
    duree = time.monotonic() - debut

    ck("Validation → 200", r.status_code, 200)
    ck("  statut publié", r.json()["status"], "validated")
    ck("  la requête n'attend pas l'email (< 1,5 s)", duree < 1.5, True)
    ck("  et l'email part bien, après la réponse", len(_attendre(partis, 1)), 1)


def test_un_email_refuse_ne_prive_pas_les_AUTRES_parents(client, monkeypatch):
    """Un parent dont l'adresse est refusée ne doit pas en priver un second.

    Le best-effort PAR DESTINATAIRE est la seule forme utile ici : une
    exception non rattrapée dans la tâche de fond n'a aucun écran où se
    plaindre, donc elle emporterait les suivants en silence.
    """
    c = client
    adm, educ, child, _dep, _sec = _monter(c, "VALSMTP", "educ@valsmtp.fr")
    _parent(c, adm, "un@valsmtp.fr", child["id"])
    _parent(c, adm, "deux@valsmtp.fr", child["id"])
    rid = _soumettre(c, educ, child["id"])

    vus, servis = [], []

    async def smtp_capricieux(**kwargs):
        vus.append(kwargs["to"])
        if len(vus) == 1:
            raise EmailDeliveryError("refus simulé sur le premier destinataire")
        servis.append(kwargs["to"])

    monkeypatch.setattr(reports_service, "send_report_available_email", smtp_capricieux)

    ck("Validation → 200 malgré le refus", c.post(
        f"/reports/{rid}/validate", headers=adm).status_code, 200)
    _attendre(vus, 2)
    ck("  les deux parents ont été tentés", len(vus), 2)
    ck("  le second a bien reçu le sien", len(servis), 1)


def test_valider_apres_retouche_publie_LA_RETOUCHE(client, monkeypatch):
    """Le contrat dont dépend l'écran : retoucher un SOUMIS, puis valider.

    L'admin corrige un rapport pendant sa relecture — c'est le but de l'écran.
    La mutation de validation n'envoyait que l'identifiant : la correction
    était perdue et le rapport partait au parent avec l'ancien texte, sous un
    toast de succès. L'écran enchaîne désormais `PATCH` puis `validate`, comme
    « Soumettre » le faisait déjà ; ce test verrouille le chemin serveur dont
    il dépend, sur un rapport déjà SOUMIS (et non un simple brouillon).
    """
    c = client
    adm, educ, child, _dep, _sec = _monter(c, "VALEDIT", "educ@valedit.fr")
    _parent(c, adm, "parent@valedit.fr", child["id"])
    rid = _soumettre(c, educ, child["id"])

    async def envoi_muet(**kwargs):
        return None

    monkeypatch.setattr(reports_service, "send_report_available_email", envoi_muet)

    corrige = dict(FULL_BIMENSUEL)
    corrige["teacher_observations"] = "Correction de l'admin pendant la relecture."

    r = c.patch(f"/reports/{rid}", json={"content": corrige}, headers=adm)
    ck("Retouche d'un rapport SOUMIS par l'admin → 200", r.status_code, 200)
    ck("  statut inchangé par la retouche", r.json()["status"], "submitted")

    r = c.post(f"/reports/{rid}/validate", headers=adm)
    ck("Validation → 200", r.status_code, 200)
    ck("  c'est la CORRECTION qui est publiée",
       r.json()["content"]["teacher_observations"],
       "Correction de l'admin pendant la relecture.")

    vu_par_le_parent = c.get(f"/reports/{rid}", headers=adm).json()
    ck("  et elle est bien en base", vu_par_le_parent["content"]["teacher_observations"],
       "Correction de l'admin pendant la relecture.")


def test_les_plafonds_d_attente_sont_POSES(client):
    """Les deux défauts d'origine sont des DÉFAUTS DE BIBLIOTHÈQUE.

    60 s par message côté `aiosmtplib`, 10 000 s par push côté `pywebpush` :
    rien dans notre code ne les contredisait. Un plafond qu'on croit avoir
    posé et qui n'est lu par personne ne protège de rien — d'où ce contrôle
    sur la configuration RÉELLEMENT remise aux bibliothèques.
    """
    from app.core.config import settings
    from app.modules.auth.email import _mail_config

    ck("plafond SMTP posé", _mail_config.TIMEOUT, settings.mail_timeout_seconds)
    ck("  et plus bas que le défaut de 60 s", _mail_config.TIMEOUT < 60, True)
    ck("plafond push posé", settings.push_timeout_seconds < 60, True)
