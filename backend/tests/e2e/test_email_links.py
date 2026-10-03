"""Les liens envoyés par email mènent-ils quelque part ?

Un établissement a signalé que « le bouton du mail tombe sur une 404 ». C'était
exact : l'email « rapport disponible » — un par parent à chaque rapport validé,
donc le plus envoyé de la plateforme — pointait vers `/parent/reports` au lieu
de `/dashboard/parent/reports`.

⚠️ Le défaut avait vécu longtemps parce qu'il était MASQUÉ. Tant que le
middleware redirigeait toute URL inconnue vers l'écran de connexion, le parent
atterrissait sur le login, se connectait, et arrivait sur son espace : agaçant,
mais fonctionnel en apparence. Le jour où ce middleware a cessé de rediriger une
URL inconnue — pour rendre la 404 qu'elle mérite — le lien s'est mis à afficher
une page d'erreur. Corriger un défaut en a donc RÉVÉLÉ un autre, plus ancien.

D'où cette garde. Elle compare les chemins de `app/core/links.py` à
l'arborescence RÉELLE du frontend : aucune relecture humaine ne tiendra ça dans
la durée, et un lien mort ne se voit pas depuis le backend.
"""
from pathlib import Path

import pytest

from app.core import links
from tests.helpers import ck

#: Racine du frontend dans le dépôt — `backend/tests/e2e/` → remonter de trois.
FRONTEND_ROUTES = Path(__file__).resolve().parents[3] / "frontend/src/app/[locale]"


@pytest.mark.skipif(
    not FRONTEND_ROUTES.is_dir(),
    reason="frontend absent (backend déployé seul) — rien à comparer",
)
def test_every_email_link_points_to_a_real_route():
    """Chaque chemin de `links.py` existe comme page du frontend.

    On vérifie l'ARBORESCENCE et non une liste recopiée : une liste recopiée
    serait exactement le genre de miroir qui diverge sans que personne ne le
    voie — c'est déjà ce qui est arrivé au lien lui-même.
    """
    for path in links.ALL_PATHS:
        page = FRONTEND_ROUTES / path.lstrip("/") / "page.tsx"
        ck(f"{path} existe comme route", page.is_file(), True)


@pytest.mark.skipif(not FRONTEND_ROUTES.is_dir(), reason="frontend absent")
def test_the_broken_link_would_be_caught():
    """La garde doit ÉCHOUER sur le chemin qui a causé le signalement.

    Sans ce contrôle, on ne saurait pas si le test ci-dessus vérifie vraiment
    quelque chose : un chemin inexistant doit être reconnu comme tel.
    """
    casse = FRONTEND_ROUTES / "parent/reports" / "page.tsx"
    ck("/parent/reports n'existe pas (le lien d'origine)", casse.is_file(), False)
    bon = FRONTEND_ROUTES / "dashboard/parent/reports" / "page.tsx"
    ck("/dashboard/parent/reports existe (la correction)", bon.is_file(), True)


def test_links_carry_no_locale_prefix():
    """⚠️ Volontairement SANS préfixe de langue.

    Avec `localePrefix: 'as-needed'`, le français n'en porte pas ; un
    destinataire dont le compte est en anglais est redirigé vers `/en/...` par
    le middleware, qui lit sa langue dans le cookie de session. Préfixer ici
    obligerait à connaître la langue à l'envoi ET à refaire la résolution côté
    backend — deux implémentations d'une règle déjà subtile.
    """
    for path in links.ALL_PATHS:
        ck(f"{path} sans préfixe", path.startswith("/en/"), False)


def test_url_builder_handles_the_token_query():
    """Le lien de réinitialisation porte son jeton — le seul à avoir un query."""
    out = links.url(links.NEW_PASSWORD, token="abc 123/&")
    ck("chemin conservé", links.NEW_PASSWORD in out, True)
    # Encodé, sinon un jeton contenant « & » ou « / » casserait l'URL.
    ck("jeton encodé", "abc+123%2F%26" in out, True)
