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

⚠️ Elles menaient ensuite à l'ÉCRAN, pas à l'ÉLÉMENT. L'identifiant du rapport
ou de la conversation voyageait pourtant déjà dans la charge utile, inutilisé :
un parent tapotait « rapport validé » et arrivait sur la LISTE de ses rapports,
à lui de retrouver lequel. Pire, les deux écrans de messagerie ouvrent par
défaut l'onglet des diffusions : une notification de message privé menait donc à
l'onglet d'à côté. Les helpers ci-dessous nomment la destination précise.

⚠️ **Pas de préfixe de langue dans ces liens**, et c'est volontaire. Avec
`localePrefix: 'as-needed'`, le français n'en porte pas ; un destinataire dont
le compte est en anglais est redirigé vers `/en/...` par le middleware, qui lit
sa langue dans le cookie de session. Préfixer ici obligerait à connaître la
langue au moment de l'envoi ET à refaire la résolution côté backend.
"""

from urllib.parse import urlencode

from app.core.config import settings

# Chemins NUS, tels qu'ils existent dans `frontend/src/app/[locale]/`.
LOGIN = "/auth/login"
NEW_PASSWORD = "/auth/new-password"
PARENT_REPORTS = "/dashboard/parent/reports"
PARENT_MESSAGING = "/dashboard/parent/messaging"
PARENT_LIBRARY = "/dashboard/parent/library"
ADMIN_MESSAGING = "/dashboard/admin/messaging"

#: Route DYNAMIQUE — le segment entre accolades correspond à un dossier `[id]`
#: côté frontend. Séparée des chemins nus parce que la garde la résout
#: différemment (cf. `tests/e2e/test_email_links.py`).
PARENT_REPORT = "/dashboard/parent/reports/{report_id}"

#: Tous les chemins NUS ci-dessus — la liste que la garde parcourt.
ALL_PATHS = (
    LOGIN, NEW_PASSWORD,
    PARENT_REPORTS, PARENT_MESSAGING, PARENT_LIBRARY,
    ADMIN_MESSAGING,
)

#: Les routes à segment dynamique, vérifiées à part par la même garde.
ALL_DYNAMIC_PATHS = (PARENT_REPORT,)

# ⚠️ Les deux écrans de messagerie ouvrent l'onglet des DIFFUSIONS par défaut.
# Une notification de message privé doit donc nommer son onglet, sinon elle
# mène juste à côté de ce qu'elle annonce. Les valeurs sont celles des
# `TabPanel` du frontend — côté parent l'onglet s'appelle `conversation`
# (il n'en a qu'une), côté admin `conversations` (il les a toutes).
TAB_ANNOUNCEMENTS = "announcements"
TAB_PARENT_CONVERSATION = "conversation"
TAB_ADMIN_CONVERSATIONS = "conversations"


def parent_announcement_query(announcement_id: object) -> dict[str, str]:
    """Paramètres menant à UNE diffusion précise du portail parent.

    Une diffusion n'a pas de page à elle : elle vit dans la liste de l'onglet
    des diffusions, qui peut en compter des dizaines. Le paramètre
    `announcement` dit LAQUELLE — l'écran la déplie et l'amène sous les yeux.

    ⚠️ Un seul constructeur pour l'email ET le push, qui ne diffèrent que par
    l'hôte (`url` contre `url_path`). Deux copies finiraient par mener à deux
    endroits, et seul l'un des deux serait vérifié.
    """
    return {"tab": TAB_ANNOUNCEMENTS, "announcement": str(announcement_id)}


def parent_conversation_query() -> dict[str, str]:
    """Paramètres menant à la conversation du portail parent.

    Le parent n'en a qu'UNE : rien à désigner, mais l'onglet reste à nommer —
    cet écran ouvre les diffusions par défaut, donc sans ce paramètre la
    notification mène juste à côté du message qu'elle annonce.
    """
    return {"tab": TAB_PARENT_CONVERSATION}


def admin_conversation_query(conversation_id: object) -> dict[str, str]:
    """Paramètres menant à UNE conversation précise de l'espace admin.

    L'admin en a plusieurs : il faut en plus dire LAQUELLE, sinon il doit la
    retrouver dans une liste triée par activité.

    ⚠️ Un seul constructeur pour l'email ET le push, comme pour les diffusions.
    Les deux ne diffèrent que par l'hôte (`url` contre `url_path`) ; deux copies
    finiraient par mener à deux endroits, et seul l'un des deux serait vérifié.
    """
    return {
        "tab": TAB_ADMIN_CONVERSATIONS,
        "conversation": str(conversation_id),
    }


def parent_report(report_id: object) -> str:
    """Chemin du rapport PRÉCIS dans le portail parent."""
    return PARENT_REPORT.format(report_id=report_id)


def url_path(path: str, **query: str) -> str:
    """Chemin + paramètres, SANS hôte — destination d'une notification push.

    ⚠️ Volontairement relatif. Le service worker résout cette valeur contre sa
    PROPRE origine et refuse tout ce qui en sortirait : le contenu d'un push ne
    doit jamais pouvoir ouvrir un site tiers. Un chemin ne peut pas désigner un
    autre site, une URL absolue si — elle ferait reposer cette garantie sur la
    seule justesse de `FRONTEND_URL`.
    """
    if not query:
        return path
    return f"{path}?{urlencode(query)}"


def url(path: str, **query: str) -> str:
    """URL absolue vers le frontend, pour un EMAIL (qui n'a pas d'origine)."""
    return f"{settings.frontend_url.rstrip('/')}{url_path(path, **query)}"
