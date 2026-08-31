"""Vérifie que l'infrastructure de test (schéma dédié, migrations, serveur
live, reset entre tests) fonctionne avant de porter les suites complètes."""
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, login


def test_health_endpoints(root_client):
    live = root_client.get("/health/live")
    assert live.status_code == 200
    ready = root_client.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"]["database"] == "ok"
    assert ready.json()["checks"]["redis"] == "ok"


def test_superadmin_login(client):
    login(client, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)


def test_database_is_reset_between_tests(client):
    """Si le test précédent a laissé des données, ce test le détecterait :
    aucune donnée hors superadmin ne doit survivre au reset."""
    h = login(client, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    r = client.get("/establishments", headers=h)
    assert r.status_code == 200
    assert r.json()["total"] == 0
