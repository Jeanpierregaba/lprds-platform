"""
Aides partagées par les tests E2E — mêmes conventions que les scripts manuels
utilisés pendant tout le développement du projet (cf. claude.md), portées ici
telles quelles pour que chaque suite reste lisible sans réinventer son propre
mini-framework.
"""

SUPERADMIN_EMAIL = "tech@lespetitsrayonsdesoleil.fr"
SUPERADMIN_PASSWORD = "Geek-Ot@ku#2002"

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
    "53de0000000c4944415478da6360000002000155bfe1590000000049454e44ae426082"
)


def ck(label, got, exp):
    """Assertion nommée — échoue avec le libellé du scénario en clair plutôt
    qu'un simple 'assert got == exp' anonyme, pour que pytest -v affiche
    immédiatement QUEL contrôle métier a échoué."""
    assert got == exp, f"{label} : obtenu {got!r}, attendu {exp!r}"


def login(c, email, pwd):
    r = c.post("/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def onboard(c, su, code, admin_email):
    """Crée un établissement + son admin, change le mot de passe temporaire,
    retourne les headers de l'admin prêt à l'emploi."""
    r = c.post("/establishments", json={
        "code": code, "name": f"C{code}", "address": "a", "email": f"c@{code.lower()}.fr",
        "phone": "+229", "admin": {"email": admin_email, "first_name": "Ad",
        "last_name": code, "password": "Creche2026"},
    }, headers=su)
    assert r.status_code == 201, f"onboard {code}: {r.status_code} {r.text[:200]}"
    h = login(c, admin_email, "Creche2026")
    c.post("/auth/password-change", json={"current_password": "Creche2026",
           "new_password": "Nouveau2026"}, headers=h)
    return login(c, admin_email, "Nouveau2026")
