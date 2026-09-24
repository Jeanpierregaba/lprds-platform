"""Correction manuelle des présences — PATCH d'une ligne scannée + saisie
manuelle (scan faux ou jamais scanné). Admin ou attendance:write uniquement.
"""
from datetime import datetime, timedelta, timezone

from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


def _setup(c):
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    child = c.post("/children", json={
        "last_name": "Alpha", "first_names": "Emma", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Alpha", "first_names": "P", "phone": "+229"}],
    }, headers=adm).json()
    staff = c.post("/staff", json={
        "first_name": "Vic", "last_name": "Tata", "nickname": "Tata Vic",
        "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
        "staff_type": "educateur"}, headers=adm).json()
    return adm, child, staff


def test_manual_correction_flow(client):
    c = client
    adm, child, staff = _setup(c)

    # Scan d'arrivée réel, puis rectification de l'heure (ligne modifiée).
    qr = c.get(f"/attendance/qrcode/child/{child['id']}", headers=adm).json()
    scanned = c.post("/attendance/scan", json={
        "qr_payload": qr["qr_payload"], "event_type": "arrival"}, headers=adm)
    ck("Scan d'arrivée enregistré", scanned.status_code, 201)
    event_id = scanned.json()["id"]

    past = datetime.now(tz=timezone.utc) - timedelta(hours=1)
    fixed = c.patch(f"/attendance/events/{event_id}",
                    json={"scanned_at": past.isoformat()}, headers=adm)
    ck("Heure scannée rectifiée", fixed.status_code, 200)
    ck("Nouvelle heure renvoyée",
       fixed.json()["scanned_at"][:16], past.isoformat()[:16])

    # Heure future refusée.
    future = datetime.now(tz=timezone.utc) + timedelta(hours=1)
    ck("Heure future refusée", c.patch(
        f"/attendance/events/{event_id}",
        json={"scanned_at": future.isoformat()}, headers=adm).status_code, 422)

    # Saisie manuelle du départ (aucun scan de départ ce jour-là).
    dep_time = (datetime.now(tz=timezone.utc) - timedelta(minutes=30))
    manual = c.post("/attendance/events/manual", json={
        "person_type": "child", "child_id": child["id"],
        "event_type": "departure", "date": dep_time.date().isoformat(),
        "time": dep_time.strftime("%H:%M")}, headers=adm)
    ck("Départ saisi manuellement", manual.status_code, 201)
    ck("Saisie attribuée à l'admin",
       manual.json()["scanned_by"]["id"] != child["id"], True)

    # Le dashboard reflète la correction.
    daily = c.get(
        f"/attendance/daily/children?date={dep_time.date().isoformat()}",
        headers=adm).json()
    mine = [i for i in daily["items"] if i["child"]["id"] == child["id"]][0]
    ck("Statut calculé sur heures corrigées",
       mine["status"] in ("present", "late"), True)
    ck("Heure de départ affichée", mine["departure_time"] is not None, True)

    # Cantine manuelle pour un enfant refusée (même garde CHECK qu'au scan).
    ck("Cantine enfant refusée en manuel", c.post(
        "/attendance/events/manual", json={
            "person_type": "child", "child_id": child["id"],
            "event_type": "meal", "date": dep_time.date().isoformat(),
            "time": dep_time.strftime("%H:%M")}, headers=adm).status_code, 422)

    # Cantine manuelle pour le STAFF acceptée (le rejet ne vise que l'enfant).
    staff_meal = c.post("/attendance/events/manual", json={
        "person_type": "staff", "staff_id": staff["id"],
        "event_type": "meal", "date": dep_time.date().isoformat(),
        "time": dep_time.strftime("%H:%M")}, headers=adm)
    ck("Cantine staff saisie manuellement", staff_meal.status_code, 201)

    # Saisie manuelle pour le personnel.
    staff_manual = c.post("/attendance/events/manual", json={
        "person_type": "staff", "staff_id": staff["id"],
        "event_type": "arrival", "date": dep_time.date().isoformat(),
        "time": dep_time.strftime("%H:%M")}, headers=adm)
    ck("Arrivée staff saisie manuellement", staff_manual.status_code, 201)

    # Enfant inconnu / d'un autre établissement → 404, jamais 403.
    ck("Enfant inconnu → 404", c.post(
        "/attendance/events/manual", json={
            "person_type": "child", "child_id": "00000000-0000-0000-0000-000000000000",
            "event_type": "arrival", "date": dep_time.date().isoformat(),
            "time": dep_time.strftime("%H:%M")}, headers=adm).status_code, 404)
    ck("Événement inconnu → 404", c.patch(
        "/attendance/events/00000000-0000-0000-0000-000000000000",
        json={"scanned_at": past.isoformat()}, headers=adm).status_code, 404)


def test_correction_temporal_coherence_and_export(client):
    """Cohérence arrivée<d-part au PATCH + export local (.xlsx, heures locales)."""
    c = client
    adm, child, _staff = _setup(c)

    # Date passée fixe (jamais de bascule de jour, même à 00h30).
    day = (datetime.now(tz=timezone.utc) - timedelta(days=3)).date().isoformat()
    arr = c.post("/attendance/events/manual", json={
        "person_type": "child", "child_id": child["id"],
        "event_type": "arrival", "date": day, "time": "10:00"}, headers=adm).json()
    dep = c.post("/attendance/events/manual", json={
        "person_type": "child", "child_id": child["id"],
        "event_type": "departure", "date": day, "time": "12:00"}, headers=adm).json()

    # Déplacer l'arrivée APRÈS le départ → 422.
    ck("Arrivée après le départ refusée", c.patch(
        f"/attendance/events/{arr['id']}",
        json={"scanned_at": f"{day}T13:00:00+00:00"}, headers=adm).status_code, 422)
    # Déplacer le départ AVANT l'arrivée → 422.
    ck("Départ avant l'arrivée refusé", c.patch(
        f"/attendance/events/{dep['id']}",
        json={"scanned_at": f"{day}T09:00:00+00:00"}, headers=adm).status_code, 422)
    # Déplacement cohérent (arrivée 09:30, toujours avant 12:00) → 200.
    ck("Déplacement cohérent accepté", c.patch(
        f"/attendance/events/{arr['id']}",
        json={"scanned_at": f"{day}T09:30:00+00:00"}, headers=adm).status_code, 200)

    # Export Excel : extension .xlsx + heures en heure locale établissement.
    exp = c.get(
        f"/attendance/export?format=excel&person_type=children&date_from={day}&date_to={day}",
        headers=adm)
    ck("Export Excel 200", exp.status_code, 200)
    disp = exp.headers.get("content-disposition", "")
    ck("Nom de fichier en .xlsx", disp.endswith('.xlsx"'), True)


def test_manual_correction_permissions(client):
    c = client
    adm, child, staff = _setup(c)

    qr = c.get(f"/attendance/qrcode/child/{child['id']}", headers=adm).json()
    event_id = c.post("/attendance/scan", json={
        "qr_payload": qr["qr_payload"], "event_type": "arrival"},
        headers=adm).json()["id"]

    # Staff sans attendance:write → 403 sur les deux endpoints.
    h = login(c, "educ@a.fr", "Staff2026")
    c.post("/auth/password-change", json={
        "current_password": "Staff2026", "new_password": "Nouveau2026"}, headers=h)
    staff_h = login(c, "educ@a.fr", "Nouveau2026")

    past = (datetime.now(tz=timezone.utc) - timedelta(hours=1)).isoformat()
    ck("PATCH sans attendance:write → 403", c.patch(
        f"/attendance/events/{event_id}",
        json={"scanned_at": past}, headers=staff_h).status_code, 403)
    ck("Saisie manuelle sans attendance:write → 403", c.post(
        "/attendance/events/manual", json={
            "person_type": "child", "child_id": child["id"],
            "event_type": "arrival", "date": datetime.now(tz=timezone.utc).date().isoformat(),
            "time": "08:00"}, headers=staff_h).status_code, 403)
