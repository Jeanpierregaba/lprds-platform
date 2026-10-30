"""
Exemptions de présence — PÉRIODE, enfants, sections.

Ce que la suite verrouille, et pourquoi chaque point a besoin d'être vérifié
plutôt que relu :

* **la SECTION couvre ses enfants** sans qu'on les nomme un par un (le chemin
  principal demandé), et un enfant d'une autre section n'est pas touché ;
* **la période est la seule autorité** : la veille du début et le lendemain de
  la fin, la personne est de nouveau attendue — sans qu'aucune tâche de fond
  n'ait eu à passer ;
* **l'échéance ne réécrit pas l'historique.** C'est le contrôle décisif : une
  exemption passée reste lisible dans l'export des jours qu'elle couvrait, là
  où basculer un `is_active=False` à l'échéance aurait fait réapparaître
  quinze jours en « absent » ;
* **annuler et raccourcir ne disent pas la même chose** — l'un vaut pour le
  passé, l'autre non ;
* **les parents d'un enfant dispensé ne sont pas interrogés sur son absence**,
  ni en masse ni en relance individuelle (deux voies, deux gardes) ;
* la notification d'échéance part **une fois**, et repart si la période est
  prolongée puis s'achève pour de bon.
"""

from datetime import date, timedelta

from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

#: Un lundi fixe du passé. Les jours ouvrés seuls produisent « absent » (le
#: week-end donne `not_expected`) : une date calculée en « aujourd'hui moins
#: trois jours » tomberait un samedi une fois sur trois, et le test passerait
#: ou tomberait selon le jour de la semaine où on le lance.
def _monday_weeks_ago(weeks: int) -> date:
    today = date.today()
    monday_this_week = today - timedelta(days=today.weekday())
    return monday_this_week - timedelta(weeks=weeks)


def _setup(c):
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "EXEMPT", "admin@ex.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec_a = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                   headers=adm).json()
    sec_b = c.post("/sections", json={"department_id": dep["id"], "name": "MS"},
                   headers=adm).json()

    def child(name, section):
        return c.post("/children", json={
            "last_name": "Test", "first_names": name, "birth_date": "2023-01-01",
            "admission_date": "2024-01-01", "residence_address": "x",
            "department_id": dep["id"], "section_id": section["id"],
            "guardians": [{"last_name": "T", "first_names": "P", "phone": "+229"}],
        }, headers=adm).json()

    kid_a1 = child("Emma", sec_a)
    kid_a2 = child("Louis", sec_a)
    kid_b = child("Nina", sec_b)
    staff = c.post("/staff", json={
        "first_name": "Vic", "last_name": "Tata", "nickname": "Tata Vic",
        "phone": "+229", "email": "educ@ex.fr", "password": "Staff2026",
        "staff_type": "educateur"}, headers=adm).json()
    return adm, dep, sec_a, sec_b, kid_a1, kid_a2, kid_b, staff


def _status_of(c, adm, day, child_id):
    daily = c.get(f"/attendance/daily/children?date={day.isoformat()}", headers=adm).json()
    rows = [i for i in daily["items"] if i["child"]["id"] == child_id]
    return rows[0] if rows else None


def test_section_exemption_covers_its_children(client):
    c = client
    adm, _dep, sec_a, _sec_b, kid_a1, kid_a2, kid_b, _staff = _setup(c)

    day = _monday_weeks_ago(1)
    created = c.post("/attendance/settings/exemptions", json={
        "scope": "section", "section_id": sec_a["id"],
        "starts_on": day.isoformat(), "ends_on": day.isoformat(),
        "reason": "Sortie scolaire"}, headers=adm)
    ck("Exemption de section créée", created.status_code, 201)
    ck("État « en cours » calculé pour une période passée ? non",
       created.json()["state"], "expired")
    ck("Nom de la section affiché", created.json()["target_name"], "PS")

    ck("1er enfant de la section exempté", _status_of(c, adm, day, kid_a1["id"])["status"], "exempt")
    ck("2e enfant de la section exempté", _status_of(c, adm, day, kid_a2["id"])["status"], "exempt")
    ck("Drapeau exempt porté par la ligne",
       _status_of(c, adm, day, kid_a1["id"])["exempt"], True)
    # ⚠️ Le contrôle qui compte : une section exemptée ne doit pas dispenser
    # l'établissement entier.
    ck("Enfant d'une AUTRE section non exempté",
       _status_of(c, adm, day, kid_b["id"])["status"], "absent")

    # La veille et le lendemain : de nouveau attendu, sans qu'aucune tâche
    # n'ait eu à passer. C'est la période qui décide, pas un drapeau.
    ck("La veille du début, attendu",
       _status_of(c, adm, day - timedelta(days=3), kid_a1["id"])["status"], "absent")
    ck("Le lendemain de la fin, attendu",
       _status_of(c, adm, day + timedelta(days=1), kid_a1["id"])["status"], "absent")


def test_single_child_exemption_and_a_scan_still_counts(client):
    c = client
    adm, _dep, _sa, _sb, kid_a1, kid_a2, _kid_b, _staff = _setup(c)

    day = _monday_weeks_ago(1)
    r = c.post("/attendance/settings/exemptions", json={
        "scope": "child", "child_id": kid_a1["id"],
        "starts_on": day.isoformat(), "ends_on": None,
        "reason": "Convalescence"}, headers=adm)
    ck("Exemption nominative créée", r.status_code, 201)
    ck("Section de l'enfant donnée en contexte", r.json()["section_name"], "PS")
    ck("Sans date de fin → en cours", r.json()["state"], "active")

    ck("L'enfant visé est exempté", _status_of(c, adm, day, kid_a1["id"])["status"], "exempt")
    ck("Son camarade de section ne l'est pas",
       _status_of(c, adm, day, kid_a2["id"])["status"], "absent")

    # Exempté ET venu quand même : l'exemption dispense de pointer, elle
    # n'efface pas un pointage.
    c.post("/attendance/events/manual", json={
        "person_type": "child", "child_id": kid_a1["id"],
        "event_type": "arrival", "date": day.isoformat(), "time": "09:00"}, headers=adm)
    row = _status_of(c, adm, day, kid_a1["id"])
    ck("Un scan reprend le dessus sur l'exemption", row["status"] in ("present", "late"), True)
    ck("Le drapeau reste vrai (il EST dispensé)", row["exempt"], True)


def test_expiry_never_rewrites_the_past(client):
    """⚠️ LE contrôle de la conception : rien n'est éteint en base à
    l'échéance, donc l'export d'une période révolue la montre toujours
    couverte. Avec un `is_active=False` basculé par la tâche, ces jours
    réapparaîtraient en « absent » des mois plus tard."""
    c = client
    adm, _dep, sec_a, _sb, kid_a1, _ka2, _kb, _staff = _setup(c)

    start = _monday_weeks_ago(3)
    end = start + timedelta(days=4)
    r = c.post("/attendance/settings/exemptions", json={
        "scope": "section", "section_id": sec_a["id"],
        "starts_on": start.isoformat(), "ends_on": end.isoformat(),
        "reason": "Fermeture"}, headers=adm)
    ck("Exemption passée créée", r.status_code, 201)
    ck("Elle se LIT « expirée »", r.json()["state"], "expired")

    # La tâche d'échéance a tourné (elle notifie, elle ne désactive rien).
    from app.modules.attendance.tasks import notify_expired_exemptions_all
    notify_expired_exemptions_all()

    ck("Un jour de la période reste exempté APRÈS l'échéance",
       _status_of(c, adm, start, kid_a1["id"])["status"], "exempt")
    exp = c.get(
        f"/attendance/export?format=excel&person_type=children"
        f"&date_from={start.isoformat()}&date_to={end.isoformat()}",
        headers=adm)
    ck("L'export de la période révolue répond 200", exp.status_code, 200)

    # Et l'exemption reste bien active en base — ce n'est pas la tâche qui
    # éteint quoi que ce soit.
    listed = c.get("/attendance/settings/exemptions", headers=adm).json()
    mine = [i for i in listed["items"] if i["id"] == r.json()["id"]][0]
    ck("Toujours active en base après l'échéance", mine["is_active"], True)
    ck("Mais son état dérivé dit « expirée »", mine["state"], "expired")


def test_revoking_erases_the_past_shortening_does_not(client):
    c = client
    adm, _dep, sec_a, _sb, kid_a1, _ka2, _kb, _staff = _setup(c)

    start = _monday_weeks_ago(2)
    end = start + timedelta(days=4)
    created = c.post("/attendance/settings/exemptions", json={
        "scope": "section", "section_id": sec_a["id"],
        "starts_on": start.isoformat(), "ends_on": end.isoformat(),
        "reason": "Stage"}, headers=adm).json()

    ck("Jour 1 couvert", _status_of(c, adm, start, kid_a1["id"])["status"], "exempt")
    ck("Jour 3 couvert",
       _status_of(c, adm, start + timedelta(days=2), kid_a1["id"])["status"], "exempt")

    # FIN ANTICIPÉE : on raccourcit. Le jour 1 reste couvert, le jour 3 non.
    shortened = c.patch(f"/attendance/settings/exemptions/{created['id']}", json={
        "starts_on": start.isoformat(), "ends_on": start.isoformat(),
        "reason": "Stage (écourté)"}, headers=adm)
    ck("Période raccourcie", shortened.status_code, 200)
    ck("Le jour déjà couvert le RESTE",
       _status_of(c, adm, start, kid_a1["id"])["status"], "exempt")
    ck("Le jour sorti de la période ne l'est plus",
       _status_of(c, adm, start + timedelta(days=2), kid_a1["id"])["status"], "absent")

    # ANNULATION : la ligne est une erreur, elle n'a jamais valu — y compris
    # pour le jour 1.
    ck("Annulation 204", c.delete(
        f"/attendance/settings/exemptions/{created['id']}", headers=adm).status_code, 204)
    ck("Le passé n'est plus couvert non plus",
       _status_of(c, adm, start, kid_a1["id"])["status"], "absent")
    ck("Annulation idempotente", c.delete(
        f"/attendance/settings/exemptions/{created['id']}", headers=adm).status_code, 204)

    # Masquée par défaut, visible sur demande.
    ck("Masquée par défaut", [
        i for i in c.get("/attendance/settings/exemptions", headers=adm).json()["items"]
        if i["id"] == created["id"]], [])
    revoked = [i for i in c.get(
        "/attendance/settings/exemptions?include_revoked=true", headers=adm
    ).json()["items"] if i["id"] == created["id"]]
    ck("Visible avec include_revoked", len(revoked), 1)
    ck("Son état est « annulée »", revoked[0]["state"], "revoked")


def test_exempt_child_parents_are_never_asked_why(client):
    """Deux voies, deux gardes. L'envoi en masse est protégé par construction
    (le statut n'est plus « absent ») ; la relance individuelle fabrique
    « absent » à la main et doit donc refuser explicitement."""
    c = client
    adm, _dep, sec_a, _sb, kid_a1, kid_a2, _kb, _staff = _setup(c)

    day = date.today()
    c.post("/attendance/settings/exemptions", json={
        "scope": "child", "child_id": kid_a1["id"],
        "starts_on": None, "ends_on": None, "reason": None}, headers=adm)

    inquiry = c.post(
        f"/attendance/absent-notifications?date={day.isoformat()}", headers=adm)
    ck("Enquête d'absence 200", inquiry.status_code, 200)
    names = " ".join(inquiry.json()["skipped_no_parent"])
    ck("L'enfant dispensé n'est pas dans les absents interrogés",
       "Emma" in names, False)
    ck("Son camarade, lui, y est", "Louis" in names, True)

    ck("Relance individuelle sur un enfant dispensé → 422", c.post(
        f"/attendance/absent-notifications?date={day.isoformat()}&child_id={kid_a1['id']}",
        headers=adm).status_code, 422)
    ck("Relance individuelle sur un absent ordinaire → 200", c.post(
        f"/attendance/absent-notifications?date={day.isoformat()}&child_id={kid_a2['id']}",
        headers=adm).status_code, 200)


def test_staff_exemption_still_works_with_a_period(client):
    c = client
    adm, _dep, _sa, _sb, _ka1, _ka2, _kb, staff = _setup(c)

    day = _monday_weeks_ago(1)
    r = c.post("/attendance/settings/exemptions", json={
        "scope": "staff", "staff_id": staff["id"],
        "starts_on": None, "ends_on": None, "reason": None}, headers=adm)
    ck("Exemption de personnel sans bornes créée", r.status_code, 201)
    ck("Le surnom est le nom affiché", r.json()["target_name"], "Tata Vic")

    daily = c.get(f"/attendance/daily/staff?date={day.isoformat()}", headers=adm).json()
    mine = [i for i in daily["items"] if i["staff"]["id"] == staff["id"]][0]
    ck("Personnel exempté", mine["status"], "exempt")
    ck("Drapeau exempt", mine["exempt"], True)

    # Bornée au passé : plus d'effet aujourd'hui.
    c.patch(f"/attendance/settings/exemptions/{r.json()['id']}", json={
        "starts_on": _monday_weeks_ago(4).isoformat(),
        "ends_on": _monday_weeks_ago(3).isoformat(), "reason": None}, headers=adm)
    daily = c.get(f"/attendance/daily/staff?date={day.isoformat()}", headers=adm).json()
    mine = [i for i in daily["items"] if i["staff"]["id"] == staff["id"]][0]
    ck("Hors période, de nouveau attendu", mine["status"], "absent")


def test_expiry_notification_fires_once_and_again_if_prolonged(client):
    c = client
    adm, _dep, sec_a, _sb, _ka1, _ka2, _kb, _staff = _setup(c)
    from app.modules.attendance.tasks import notify_expired_exemptions_all

    # On purge d'abord les échéances laissées par d'autres établissements de
    # test : la tâche balaie TOUTE la base.
    notify_expired_exemptions_all()

    start = _monday_weeks_ago(2)
    created = c.post("/attendance/settings/exemptions", json={
        "scope": "section", "section_id": sec_a["id"],
        "starts_on": start.isoformat(),
        "ends_on": (start + timedelta(days=1)).isoformat(),
        "reason": "Fermeture"}, headers=adm).json()

    first = notify_expired_exemptions_all()
    ck("L'échéance est annoncée une fois", first["notified_exemptions"], 1)
    second = notify_expired_exemptions_all()
    ck("Pas de rappel quotidien de la même échéance",
       second["notified_exemptions"], 0)

    # Prolongée puis de nouveau échue : il faut que ça reparte, sinon une
    # exemption rouverte finirait en silence.
    c.patch(f"/attendance/settings/exemptions/{created['id']}", json={
        "starts_on": start.isoformat(),
        "ends_on": (start + timedelta(days=3)).isoformat(),
        "reason": "Fermeture prolongée"}, headers=adm)
    third = notify_expired_exemptions_all()
    ck("Une période prolongée puis échue est annoncée de nouveau",
       third["notified_exemptions"], 1)

    # Une exemption SANS date de fin n'échoit jamais.
    c.post("/attendance/settings/exemptions", json={
        "scope": "section", "section_id": sec_a["id"],
        "starts_on": None, "ends_on": None, "reason": None}, headers=adm)
    ck("Une exemption sans fin n'est jamais annoncée échue",
       notify_expired_exemptions_all()["notified_exemptions"], 0)


def test_validation_isolation_and_permission(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm, _dep, sec_a, _sb, kid_a1, _ka2, _kb, _staff = _setup(c)

    # Fin avant début → 422, et la contrainte CHECK est doublée côté schéma.
    ck("Fin avant début refusée", c.post("/attendance/settings/exemptions", json={
        "scope": "section", "section_id": sec_a["id"],
        "starts_on": "2026-03-10", "ends_on": "2026-03-01"}, headers=adm).status_code, 422)

    # La portée décide de l'identifiant exigé — un seul, et celui-là.
    ck("Portée « child » avec un section_id refusée", c.post(
        "/attendance/settings/exemptions", json={
            "scope": "child", "section_id": sec_a["id"]}, headers=adm).status_code, 422)
    ck("Portée « child » sans cible refusée", c.post(
        "/attendance/settings/exemptions", json={"scope": "child"},
        headers=adm).status_code, 422)
    ck("Deux cibles à la fois refusées", c.post(
        "/attendance/settings/exemptions", json={
            "scope": "child", "child_id": kid_a1["id"], "section_id": sec_a["id"]},
        headers=adm).status_code, 422)

    # Cible d'un autre établissement → 404, jamais 403.
    other = onboard(c, su, "AUTRE", "admin@autre.fr")
    other_dep = c.post("/departments", json={"name": "D"}, headers=other).json()
    other_sec = c.post("/sections", json={
        "department_id": other_dep["id"], "name": "S"}, headers=other).json()
    ck("Section d'un autre établissement → 404", c.post(
        "/attendance/settings/exemptions", json={
            "scope": "section", "section_id": other_sec["id"]},
        headers=adm).status_code, 404)

    mine = c.post("/attendance/settings/exemptions", json={
        "scope": "section", "section_id": sec_a["id"]}, headers=adm).json()
    ck("Exemption d'un autre établissement invisible", [
        i for i in c.get("/attendance/settings/exemptions", headers=other).json()["items"]
        if i["id"] == mine["id"]], [])
    ck("Modifier l'exemption d'un autre établissement → 404", c.patch(
        f"/attendance/settings/exemptions/{mine['id']}",
        json={"starts_on": None, "ends_on": None, "reason": None},
        headers=other).status_code, 404)
    ck("Annuler l'exemption d'un autre établissement → 404", c.delete(
        f"/attendance/settings/exemptions/{mine['id']}", headers=other).status_code, 404)

    # Staff sans attendance:write → 403 sur les quatre endpoints.
    h = login(c, "educ@ex.fr", "Staff2026")
    c.post("/auth/password-change", json={
        "current_password": "Staff2026", "new_password": "Nouveau2026"}, headers=h)
    staff_h = login(c, "educ@ex.fr", "Nouveau2026")
    ck("Lister sans attendance:write → 403", c.get(
        "/attendance/settings/exemptions", headers=staff_h).status_code, 403)
    ck("Créer sans attendance:write → 403", c.post(
        "/attendance/settings/exemptions", json={
            "scope": "section", "section_id": sec_a["id"]},
        headers=staff_h).status_code, 403)
    ck("Modifier sans attendance:write → 403", c.patch(
        f"/attendance/settings/exemptions/{mine['id']}",
        json={"starts_on": None, "ends_on": None, "reason": None},
        headers=staff_h).status_code, 403)
    ck("Annuler sans attendance:write → 403", c.delete(
        f"/attendance/settings/exemptions/{mine['id']}", headers=staff_h).status_code, 403)

    # Le superadmin n'a rien à faire dans les données d'un établissement.
    ck("Superadmin exclu", c.get(
        "/attendance/settings/exemptions", headers=su).status_code, 403)
    ck("Exemption inconnue → 404", c.delete(
        "/attendance/settings/exemptions/00000000-0000-0000-0000-000000000000",
        headers=adm).status_code, 404)


def test_covers_is_proven_at_the_model_level(client):
    """⚠️ Au ras du MODÈLE, et pas par HTTP — pour une raison précise.

    `is_active` est filtré DEUX fois : par la requête de `_load_exemptions`
    (qui réduit le volume) et par `AttendanceExemption.covers()` (la seule
    autorité). C'est une redondance assumée, mais elle rend le contrôle par
    HTTP aveugle : prouvé par sabotage, retirer la garde du modèle laisse le
    test de l'annulation passer, parce que le filtre SQL suffit. Un contrôle
    qui réussit sur du code cassé ne prouve rien — il faut donc interroger la
    méthode elle-même.

    Les bornes sont INCLUSES des deux côtés : c'est ce qu'un utilisateur lit
    dans « du 3 au 7 », et un décalage d'un jour sur une borne est exactement
    le genre d'écart qu'on ne remarque qu'au bout d'un mois.
    """
    from app.modules.attendance.models import AttendanceExemption, ExemptionState

    jour = date(2026, 3, 10)

    borne = AttendanceExemption(
        scope="child", starts_on=date(2026, 3, 10), ends_on=date(2026, 3, 12),
        is_active=True,
    )
    ck("Premier jour de la période inclus", borne.covers(date(2026, 3, 10)), True)
    ck("Dernier jour de la période inclus", borne.covers(date(2026, 3, 12)), True)
    ck("La veille exclue", borne.covers(date(2026, 3, 9)), False)
    ck("Le lendemain exclu", borne.covers(date(2026, 3, 13)), False)

    annulee = AttendanceExemption(
        scope="child", starts_on=date(2026, 3, 10), ends_on=date(2026, 3, 12),
        is_active=False,
    )
    ck("Une exemption ANNULÉE ne couvre rien, même en pleine période",
       annulee.covers(jour), False)
    ck("Son état est « annulée », pas « en cours »",
       annulee.state(jour), ExemptionState.REVOKED)

    sans_bornes = AttendanceExemption(scope="staff", starts_on=None, ends_on=None,
                                      is_active=True)
    ck("Sans bornes, couvre n'importe quel jour", sans_bornes.covers(jour), True)
    ck("Sans bornes, n'expire jamais", sans_bornes.state(jour), ExemptionState.ACTIVE)

    sans_fin = AttendanceExemption(scope="staff", starts_on=date(2026, 3, 1),
                                   ends_on=None, is_active=True)
    ck("Sans fin, couvre après le début", sans_fin.covers(jour), True)
    ck("Sans fin, ne couvre pas avant le début",
       sans_fin.covers(date(2026, 2, 28)), False)
    ck("Avant son début : à venir",
       sans_fin.state(date(2026, 2, 28)), ExemptionState.UPCOMING)

    depuis_toujours = AttendanceExemption(scope="section", starts_on=None,
                                          ends_on=date(2026, 3, 9), is_active=True)
    ck("Sans début, couvre tout jour antérieur à la fin",
       depuis_toujours.covers(date(2020, 1, 1)), True)
    ck("Après la fin : expirée",
       depuis_toujours.state(jour), ExemptionState.EXPIRED)
