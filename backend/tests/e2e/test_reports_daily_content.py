"""E2E rapports : contenu structuré du quotidien, pré-remplissage horaires
depuis les scans de présence, pièces jointes photo/vidéo, vocabulaire."""
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

FULL_CONTENT = {
    "health_status": "bien",
    "temperature_arrival": 36.8,
    "temperature_departure": 37.0,
    "health_notes": "Rien à signaler",
    "breakfast": "bien_mange",
    "lunch": "peu_mange",
    "snack": "bien_mange",
    "nap": True,
    "nap_duration_minutes": 90,
    "bath": True,
    "poop": True,
    "moods": ["joyeux", "calme", "joyeux"],  # doublon volontaire
    "activities": ["Peinture", "Jeux de construction", "Lecture d'histoires"],
    "behaviors": ["pleasant_day", "good_interaction", "pleasant_day"],  # doublon
    "highlight": "A dit ses premiers mots en chanson !",
}


def test_reports_daily_content(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    did = dep["id"]
    sec = c.post("/sections", json={"department_id": did, "name": "PS"}, headers=adm).json()
    sid = sec["id"]
    c.post(f"/reports/settings/departments/{did}/types/quotidien", headers=adm)
    c.post(f"/reports/settings/departments/{did}/types/annuel", headers=adm)

    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": "Tata",
           "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)
    h = login(c, "educ@a.fr", "Staff2026")
    c.post("/auth/password-change", json={"current_password": "Staff2026",
           "new_password": "StaffNew2026"}, headers=h)
    educ_id = c.get("/staff?search=educ@a.fr", headers=adm).json()["items"][0]["id"]
    role = c.post("/rbac/roles", json={"name": "Rédactrice",
          "permissions": ["reports:read", "reports:write", "attendance:scan"]},
          headers=adm).json()
    c.post(f"/rbac/staff/{educ_id}/roles/{role['id']}", headers=adm)
    educ = login(c, "educ@a.fr", "StaffNew2026")

    group = c.post("/groups", json={"section_id": sid, "educatrice_id": educ_id},
                   headers=adm).json()
    child = c.post("/children", json={"last_name": "Alpha", "first_names": "E",
                   "birth_date": "2023-01-01", "admission_date": "2025-01-01",
                   "residence_address": "x", "department_id": did, "section_id": sid,
                   "guardians": [{"last_name": "Alpha", "first_names": "P",
                   "phone": "+229"}]}, headers=adm).json()
    cid = child["id"]
    c.post(f"/groups/{group['id']}/children/{cid}", headers=adm)

    c.post("/parents", json={"first_name": "Anaïs", "last_name": "Kossou",
           "nickname": "Maman Anaïs", "phone": "+229 97", "email": "parent@a.fr",
           "password": "Parent2026", "child_ids": [cid]}, headers=adm)
    pl = login(c, "parent@a.fr", "Parent2026")
    c.post("/auth/password-change", json={"current_password": "Parent2026",
           "new_password": "ParentNew2026"}, headers=pl)
    par = login(c, "parent@a.fr", "ParentNew2026")

    # ── Vocabulaire ──
    vocab = c.get("/reports/vocabulary", headers=educ).json()
    ck("8 catégories de vocabulaire (dont bi_mensuel/annuel)", sorted(vocab.keys()),
       sorted(["behavior_tag", "health_status", "meal_amount", "mood",
               "class_behavior", "peer_relation", "emotion_management",
               "acquisition_level"]))
    ck("3 statuts de santé", len(vocab["health_status"]), 3)
    ck("3 niveaux de repas", len(vocab["meal_amount"]), 3)
    ck("6 humeurs", len(vocab["mood"]), 6)
    ck("15 tags de comportement", len(vocab["behavior_tag"]), 15)
    ck("Libellé emoji correct", vocab["mood"]["joyeux"], "😊 Joyeux")

    # ── Pré-remplissage des horaires depuis le scan de présence ──
    qr_child = c.get(f"/attendance/qrcode/child/{cid}", headers=adm).json()["qr_payload"]
    c.post("/attendance/scan", json={"qr_payload": qr_child, "event_type": "arrival"},
          headers=educ)
    c.post("/attendance/scan", json={"qr_payload": qr_child, "event_type": "departure"},
          headers=educ)

    content_no_times = {**FULL_CONTENT}
    r = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
               "content": content_no_times}, headers=educ)
    ck("Création sans horaires → pré-remplis automatiquement", r.status_code, 201)
    rep = r.json()
    rid = rep["id"]
    ck("  arrival_time pré-rempli", rep["content"]["arrival_time"] is not None, True)
    ck("  departure_time pré-rempli", rep["content"]["departure_time"] is not None, True)
    ck("  moods dédupliqués", rep["content"]["moods"], ["joyeux", "calme"])
    ck("  behaviors dédupliqués", rep["content"]["behaviors"],
       ["pleasant_day", "good_interaction"])
    ck("  summary absent (optionnel pour quotidien)", rep["summary"], None)

    # ── Override manuel des horaires (priorité au client) ──
    r2 = c.post("/reports", json={"child_id": cid, "report_type": "quotidien",
                "reference_date": "2026-07-20",
                "content": {**FULL_CONTENT, "arrival_time": "07:15:00",
                            "departure_time": "17:45:00"}}, headers=educ)
    ck("Horaires fournis respectés (pas écrasés)", r2.status_code, 201)
    ck("  arrival_time = valeur fournie", r2.json()["content"]["arrival_time"], "07:15:00")

    # ── Validations de cohérence ──
    ck("Champ requis manquant (health_status) → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "quotidien", "reference_date": "2026-07-19",
       "content": {k: v for k, v in FULL_CONTENT.items() if k != "health_status"}},
       headers=educ).status_code, 422)
    ck("nap=true sans durée → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "quotidien", "reference_date": "2026-07-18",
       "content": {**FULL_CONTENT, "nap_duration_minutes": None}},
       headers=educ).status_code, 422)
    ck("nap=false avec durée → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "quotidien", "reference_date": "2026-07-17",
       "content": {**FULL_CONTENT, "nap": False, "nap_duration_minutes": 60}},
       headers=educ).status_code, 422)
    ck("Température hors plage (99°C) → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "quotidien", "reference_date": "2026-07-16",
       "content": {**FULL_CONTENT, "temperature_arrival": 99}},
       headers=educ).status_code, 422)
    ck("moods vide → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "quotidien", "reference_date": "2026-07-15",
       "content": {**FULL_CONTENT, "moods": []}}, headers=educ).status_code, 422)
    ck("Type/valeur d'enum invalide → 422", c.post("/reports", json={
       "child_id": cid, "report_type": "quotidien", "reference_date": "2026-07-14",
       "content": {**FULL_CONTENT, "health_status": "en_pleine_forme"}},
       headers=educ).status_code, 422)

    # ── Type annuel : contenu structuré (bulletin), cf. test_reports_annuel.py ──
    ck("Annuel sans content → 422 (content structuré désormais requis)", c.post(
       "/reports", json={"child_id": cid, "report_type": "annuel",
       "reference_date": "2026-01-01"}, headers=educ).status_code, 422)

    # ── Modification (revalidation du contenu) ──
    bad_update = c.patch(f"/reports/{rid}", json={
        "content": {**rep["content"], "health_status": "invalide"}}, headers=educ)
    ck("Modification introduisant une erreur → 422", bad_update.status_code, 422)
    good_update = c.patch(f"/reports/{rid}", json={
        "content": {**rep["content"], "health_notes": "RAS, journée calme."}}, headers=educ)
    ck("Modification valide acceptée", good_update.status_code, 200)
    ck("Activités vides → 422", c.patch(f"/reports/{rid}", json={
        "content": {**rep["content"], "activities": []}}, headers=educ).status_code, 422)
    ck("Activités blanches → 422", c.patch(f"/reports/{rid}", json={
        "content": {**rep["content"], "activities": ["   "]}}, headers=educ).status_code, 422)
    r = c.patch(f"/reports/{rid}", json={
        "content": {**rep["content"], "activities": ["  Collage  ", "Peinture"]}},
        headers=educ)
    ck("Activités multiples acceptées", r.status_code, 200)
    ck("  espaces rognés", r.json()["content"]["activities"], ["Collage", "Peinture"])

    # ── Pièces jointes (photos / vidéos) ──
    r = c.post(f"/reports/{rid}/attachments",
               files={"file": ("photo.png", PNG, "image/png")}, headers=educ)
    ck("Upload photo", r.status_code, 201)
    r = c.post(f"/reports/{rid}/attachments",
               files={"file": ("video.mp4", b"\x00\x00\x00\x18ftypmp42fake", "video/mp4")},
               headers=educ)
    ck("Upload vidéo", r.status_code, 201)
    vid_att_id = r.json()["id"]

    ck("Type non autorisé (pdf) → 422", c.post(f"/reports/{rid}/attachments",
       files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
       headers=educ).status_code, 422)
    # ⚠️ Ce cas affirmait « 51 Mo de remplissage annoncé image/png → 413 ».
    # Le type est maintenant lu dans les octets : 51 Mo de « x » n'est PAS une
    # image, donc c'est un 422 (« ni une image ni une vidéo ») et non un refus
    # de taille. Un gros fichier bidon ne peut plus tenir lieu de grosse photo.
    # La politique de taille elle-même — image recompressée, vidéo refusée —
    # est tenue par `test_media_uploads.py`, sur de vrais médias.
    big = b"x" * (51 * 1024 * 1024)
    ck("51 Mo de remplissage déguisé en PNG → 422", c.post(f"/reports/{rid}/attachments",
       files={"file": ("gros.png", big, "image/png")},
       headers=educ).status_code, 422)

    detail = c.get(f"/reports/{rid}", headers=educ).json()
    ck("2 pièces jointes listées sur le rapport", len(detail["attachments"]), 2)

    dl = c.get(f"/reports/{rid}/attachments/{vid_att_id}", headers=educ)
    ck("Téléchargement (éducatrice)", dl.status_code, 200)
    ck("  contenu vidéo correct", dl.content, b"\x00\x00\x00\x18ftypmp42fake")

    ck("Parent ne voit pas les PJ avant validation → 404", c.get(
        f"/reports/mine/{rid}/attachments/{vid_att_id}", headers=par).status_code, 404)

    c.post(f"/reports/{rid}/submit", headers=educ)
    c.post(f"/reports/{rid}/validate", headers=adm)
    dl_par = c.get(f"/reports/mine/{rid}/attachments/{vid_att_id}", headers=par)
    ck("Parent télécharge après validation", dl_par.status_code, 200)
    par_detail = c.get(f"/reports/mine/{rid}", headers=par).json()
    ck("Parent voit les 2 PJ dans le détail", len(par_detail["attachments"]), 2)
