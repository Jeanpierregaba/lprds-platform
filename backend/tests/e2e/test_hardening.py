"""E2E durcissement backend : anti brute-force sur /auth/login, format
d'erreur uniforme (chaîne) sur les 422 métier — y compris ceux issus d'une
validation Pydantic manuelle (ex: contenu structuré des rapports)."""
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


def test_login_rate_limiting(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": "Educ",
           "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)

    # 5 tentatives ratées (max_attempts par défaut) — la 6e doit être bloquée
    # avant même la vérification du mot de passe.
    for _ in range(5):
        r = c.post("/auth/login", json={"email": "educ@a.fr", "password": "mauvais"})
        ck("Mauvais mot de passe → 401 (tant que sous le quota)", r.status_code, 401)

    # ⚠️ L'en-tête est explicite : /auth/login est un endpoint NON authentifié,
    # donc la langue ne peut venir que d'Accept-Language. Sans en-tête, la règle
    # produit renvoie l'anglais (cf. app/core/i18n.py) — ce qu'on vérifie juste
    # après, plutôt que de dépendre d'un défaut implicite.
    blocked = c.post("/auth/login", json={"email": "educ@a.fr", "password": "mauvais"},
                     headers={"Accept-Language": "fr-FR"})
    ck("6e tentative → 429 (quota dépassé)", blocked.status_code, 429)
    ck("  Retry-After implicite dans le message", "secondes" in blocked.json()["detail"], True)

    en = c.post("/auth/login", json={"email": "educ@a.fr", "password": "mauvais"},
                headers={"Accept-Language": "en-US"})
    ck("  même erreur en anglais", "seconds" in en.json()["detail"], True)

    # Même avec le BON mot de passe : toujours bloqué tant que la fenêtre
    # n'est pas expirée (le compteur ne se remet à zéro que sur succès AVANT
    # d'être bloqué, jamais après un 429).
    still_blocked = c.post("/auth/login", json={"email": "educ@a.fr", "password": "Staff2026"})
    ck("Bon mot de passe mais quota déjà dépassé → 429", still_blocked.status_code, 429)

    # Un autre compte, depuis le même client (même IP), n'est pas affecté —
    # le quota est bien par (IP, email), pas juste par IP.
    other = c.post("/auth/login", json={"email": "admin@a.fr", "password": "mauvais"})
    ck("Autre compte non affecté par le quota d'educ@a.fr", other.status_code, 401)


def test_login_success_resets_rate_limit_counter(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    c.post("/staff", json={"first_name": "E", "last_name": "T", "nickname": "Educ",
           "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
           "staff_type": "educateur"}, headers=adm)

    # 3 échecs (sous le quota), puis succès : le compteur repart à zéro.
    for _ in range(3):
        c.post("/auth/login", json={"email": "educ@a.fr", "password": "mauvais"})
    ok = c.post("/auth/login", json={"email": "educ@a.fr", "password": "Staff2026"})
    ck("Connexion réussie après quelques échecs", ok.status_code, 200)

    for _ in range(5):
        r = c.post("/auth/login", json={"email": "educ@a.fr", "password": "mauvais"})
        ck("Compteur repartait bien de zéro (pas encore bloqué)", r.status_code, 401)


def test_reports_content_error_is_a_plain_string(client):
    """Uniformité du format d'erreur : `detail` doit toujours être une chaîne
    sur un 422 métier, jamais une liste — même pour la validation manuelle du
    contenu structuré des rapports (le seul endpoit qui construisait
    auparavant `detail` à partir de `ValidationError.errors()`)."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    c.post(f"/reports/settings/departments/{dep['id']}/types/quotidien", headers=adm)
    child = c.post("/children", json={
        "last_name": "Alpha", "first_names": "Emma", "birth_date": "2023-01-01",
        "admission_date": "2025-01-01", "residence_address": "x",
        "department_id": dep["id"], "section_id": sec["id"],
        "guardians": [{"last_name": "Alpha", "first_names": "P", "phone": "+229"}],
    }, headers=adm).json()

    r = c.post("/reports", json={"child_id": child["id"], "report_type": "quotidien",
               "content": {"health_status": "en_pleine_forme"}}, headers=adm)
    ck("Contenu invalide → 422", r.status_code, 422)
    detail = r.json()["detail"]
    ck("`detail` est une chaîne (pas une liste)", isinstance(detail, str), True)
    ck("Le message reste exploitable (mentionne le champ en cause)",
       "health_status" in detail, True)
