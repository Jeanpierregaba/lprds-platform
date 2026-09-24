"""
Horaires personnalisés du personnel + export des présences (PDF/Excel).

Couvre :
- le CRUD de l'horaire personnel (`PUT/GET/DELETE /attendance/settings/staff/{id}`)
  et son effet sur le dashboard journalier du staff (repli général sinon) ;
- l'export agrégé PDF et Excel, enfants + personnel, avec filtres département.
"""

from datetime import date, timedelta

from tests.helpers import ck, login, onboard

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PDF_MIME = "application/pdf"


def _setup(client, code="LPRDS"):
    su = login(client, "tech@lespetitsrayonsdesoleil.fr", "Geek-Ot@ku#2002")
    adm = onboard(client, su, code, f"admin@{code.lower()}.fr")
    dep = client.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = client.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                      headers=adm).json()
    child = client.post("/children", json={
        "last_name": "Alpha", "first_names": "Emma", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Alpha", "first_names": "P", "phone": "+229"}],
    }, headers=adm).json()
    staff = client.post("/staff", json={
        "first_name": "Victoire", "last_name": "Kossou", "nickname": "Tata Victoire",
        "phone": "+229", "email": f"educ@{code.lower()}.fr", "password": "Staff2026",
        "staff_type": "educateur"}, headers=adm).json()
    return adm, dep, sec, child, staff


def test_late_grace_minutes(client):
    """Tolérance avant retard : 08:05 sur 08:00 attendu = late sans
    tolérance, present avec 10 minutes de grâce."""
    c = client
    adm, dep, sec, child, staff = _setup(c)
    day = (date.today() - timedelta(days=3)).isoformat()
    c.put(f"/attendance/settings/departments/{dep['id']}", json={
        "expected_arrival_time": "08:00", "expected_departure_time": "16:00"},
        headers=adm)
    c.put("/attendance/settings/general", json={
        "timezone": "UTC", "staff_expected_arrival_time": "08:00",
        "staff_expected_departure_time": "16:00", "late_grace_minutes": 0},
        headers=adm)
    c.post("/attendance/events/manual", json={
        "person_type": "child", "child_id": child["id"],
        "event_type": "arrival", "date": day, "time": "08:05"}, headers=adm)

    def status():
        daily = c.get("/attendance/daily/children", params={"date": day},
                      headers=adm).json()
        mine = [i for i in daily["items"] if i["child"]["id"] == child["id"]][0]
        return mine["status"], mine["late_minutes"]

    ck("08:05 sans tolérance → late", status(), ("late", 5))
    c.put("/attendance/settings/general", json={
        "timezone": "UTC", "staff_expected_arrival_time": "08:00",
        "staff_expected_departure_time": "16:00", "late_grace_minutes": 10},
        headers=adm)
    ck("08:05 avec 10 min de grâce → present", status(), ("present", 0))


def test_staff_schedule_crud_and_fallback(client):
    c = client
    adm, dep, sec, child, staff = _setup(c)
    staff_id = staff["id"]

    # Repli : sans horaire personnalisé ni horaire général configuré, le staff
    # apparaît au dashboard avec un statut calculable (présence pas encore scannée).
    daily = c.get("/attendance/daily/staff", params={"date": date.today().isoformat()},
                  headers=adm).json()
    by_id = {item["staff"]["id"]: item for item in daily["items"]}
    ck("Staff listé au dashboard journalier", staff_id in by_id, True)

    # Pose d'un horaire personnalisé.
    put = c.put(f"/attendance/settings/staff/{staff_id}", json={
        "expected_arrival_time": "09:00", "expected_departure_time": "16:30"},
        headers=adm)
    ck("PUT horaire personnalisé", put.status_code, 200)
    sched = put.json()
    ck("Arrivée personnalisée renvoyée", sched["expected_arrival_time"], "09:00:00")
    ck("Départ personnalisé renvoyé", sched["expected_departure_time"], "16:30:00")

    got = c.get(f"/attendance/settings/staff/{staff_id}", headers=adm).json()
    ck("GET renvoie l'horaire posé", got["expected_arrival_time"], "09:00:00")

    # Départ avant arrivée → 422 (même garde que les autres réglages horaires).
    bad = c.put(f"/attendance/settings/staff/{staff_id}", json={
        "expected_arrival_time": "10:00", "expected_departure_time": "09:00"},
        headers=adm)
    ck("Horaire départ avant arrivée rejeté", bad.status_code, 422)

    # Le dashboard continue de marcher avec un horaire personnalisé en place.
    daily2 = c.get("/attendance/daily/staff", params={"date": date.today().isoformat()},
                   headers=adm).json()
    ck("Dashboard inchangé avec horaire personnalisé",
       {item["staff"]["id"] for item in daily2["items"]} == {staff_id}, True)

    # Suppression → repli sur l'horaire général ; la lecture redonne 404.
    ck("DELETE horaire personnalisé", c.delete(
        f"/attendance/settings/staff/{staff_id}", headers=adm).status_code, 204)
    ck("GET après suppression → 404", c.get(
        f"/attendance/settings/staff/{staff_id}", headers=adm).status_code, 404)

    # Un staff d'un AUTRE établissement → 404 (isolation), jamais 403.
    adm_other = onboard(c, login(c, "tech@lespetitsrayonsdesoleil.fr", "Geek-Ot@ku#2002"),
                        "AUTRE", "admin@autre.fr")
    ck("Staff hors établissement → 404", c.put(
        f"/attendance/settings/staff/{staff_id}", json={
            "expected_arrival_time": "09:00", "expected_departure_time": "16:30"},
        headers=adm_other).status_code, 404)


def test_attendance_export_pdf_and_excel(client):
    c = client
    adm, dep, sec, child, staff = _setup(c)
    today = date.today()
    from_ = (today - timedelta(days=7)).isoformat()
    to = today.isoformat()

    pdf = c.get("/attendance/export", params={
        "format": "pdf", "person_type": "both",
        "date_from": from_, "date_to": to}, headers=adm)
    ck("Export PDF OK", pdf.status_code, 200)
    ck("Export PDF content-type", pdf.headers["content-type"], PDF_MIME)
    ck("Export PDF corps non vide", len(pdf.content) > 500, True)
    ck("Export PDF nom de fichier", pdf.headers.get("content-disposition", "")
       .startswith("attachment; filename=\"presences_"), True)

    xls = c.get("/attendance/export", params={
        "format": "excel", "person_type": "both",
        "date_from": from_, "date_to": to}, headers=adm)
    ck("Export Excel OK", xls.status_code, 200)
    ck("Export Excel content-type", xls.headers["content-type"], XLSX_MIME)
    ck("Export Excel corps non vide", len(xls.content) > 500, True)

    # Filtre enfants + département : la ligne enfant est présente.
    chd = c.get("/attendance/export", params={
        "format": "pdf", "person_type": "children",
        "date_from": from_, "date_to": to, "department_id": dep["id"]}, headers=adm)
    ck("Export enfants+département OK", chd.status_code, 200)

    # Période inversée → 422.
    inv = c.get("/attendance/export", params={
        "format": "pdf", "person_type": "both",
        "date_from": to, "date_to": from_}, headers=adm)
    ck("Période inversée rejetée", inv.status_code, 422)

def test_attendance_export_single_person(client):
    """Export restreint à UNE personne précise (child_id / staff_id)."""
    c = client
    adm, dep, sec, child, staff = _setup(c)
    today = date.today()
    from_ = (today - timedelta(days=7)).isoformat()
    to = today.isoformat()
    base = {"format": "pdf", "person_type": "both",
            "date_from": from_, "date_to": to}

    one_child = c.get("/attendance/export", params={**base, "child_id": child["id"]},
                      headers=adm)
    ck("Export enfant précis OK", one_child.status_code, 200)
    ck("Export enfant précis non vide", len(one_child.content) > 500, True)

    one_staff = c.get("/attendance/export", params={**base, "staff_id": staff["id"]},
                      headers=adm)
    ck("Export personnel précis OK", one_staff.status_code, 200)

    both_ids = c.get("/attendance/export", params={
        **base, "child_id": child["id"], "staff_id": staff["id"]}, headers=adm)
    ck("child_id + staff_id → 422", both_ids.status_code, 422)

    unknown = c.get("/attendance/export", params={
        **base, "child_id": "00000000-0000-0000-0000-000000000000"}, headers=adm)
    ck("Enfant inconnu → 404", unknown.status_code, 404)

    # Enfant d'un AUTRE établissement → 404 (isolation), jamais 403.
    adm_other, _d, _s, _ch, _st = _setup(c, code="AUTRE")
    cross = c.get("/attendance/export", params={**base, "child_id": child["id"]},
                  headers=adm_other)
    ck("Enfant hors établissement → 404", cross.status_code, 404)
