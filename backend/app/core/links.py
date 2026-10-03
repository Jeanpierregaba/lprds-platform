"""
Liens vers le frontend, construits en un seul endroit.

⚠️ Six modules fabriquaient leur URL à la main (`f"{settings.frontend_url}/..."`),
et l'un d'eux s'est trompé : l'email « rapport disponible » pointait vers
`/parent/reports` au lieu de `/dashboard/parent/reports`. C'est l'email le plus
envoyé de la plateforme — un par parent à chaque rapport validé.

Le défaut a vécu longtemps parce qu'il était MASQUÉ : tant que le middleware
redirigeait toute URL inconnue vers l'écran de connexion, le parent atterrissait
sur le login, se connectait, et arrivait sur son espace. Agaçant, mais
fonctionnel en apparence. Le jour où ce même middleware a cessé de rediriger une
URL inconnue — pour rendre la 404 qu'elle mérite — le lien s'est mis à afficher
une page d'erreur, et le défaut est devenu visible d'un coup.

D'où ce module : les chemins sont nommés une fois, et
`tests/e2e/test_email_links.py` vérifie que chacun correspond à une route qui
existe vraiment dans le frontend.

Les **notifications push** y puisent aussi : elles n'emportaient aucune
destination, et le service worker ouvrait donc toujours l'accueil. Un parent
qui tapotait « rapport validé » arrivait sur sa page d'accueil et devait
retrouver le rapport à la main — un clic perdu à chaque notification.

⚠️ **Pas de préfixe de langue dans ces liens**, et c'est volontaire. Avec
`localePrefix: 'as-needed'`, le français n'en porte pas ; un destinataire dont
le compte est en anglais est redirigé vers `/en/...` par le middleware, qui lit
sa langue dans le cookie de session. Préfixer ici obligerait à connaître la
langue au moment de l'envoi ET à refaire la résolution côté backend.
"""

from app.core.config import settings

# Chemins NUS, tels qu'ils existent dans `frontend/src/app/[locale]/`.
LOGIN = "/auth/login"
NEW_PASSWORD = "/auth/new-password"
PARENT_REPORTS = "/dashboard/parent/reports"
PARENT_MESSAGING = "/dashboard/parent/messaging"
PARENT_LIBRARY = "/dashboard/parent/library"
ADMIN_MESSAGING = "/dashboard/admin/messaging"

#: Tous les chemins ci-dessus — la liste que la garde parcourt.
ALL_PATHS = (
    LOGIN, NEW_PASSWORD,
    PARENT_REPORTS, PARENT_MESSAGING, PARENT_LIBRARY,
    ADMIN_MESSAGING,
)


def url(path: str, **query: str) -> str:
    """URL absolue vers le frontend, pour un email ou une notification."""
    base = f"{settings.frontend_url.rstrip('/')}{path}"
    if not query:
        return base
    from urllib.parse import urlencode

    return f"{base}?{urlencode(query)}"
