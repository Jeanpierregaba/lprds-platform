"""
Catalogues de traduction du backend.

Un fichier par langue, dicts plats indexés par clé pointée
(`errors.child_not_found`, `emails.welcome_parent.subject`). Le français est la
langue de référence : toute clé doit y exister, l'anglais pouvant être complété
au fil de l'eau (repli automatique sur le français, cf. `app/core/i18n.py`).

Le test `tests/e2e/test_i18n.py` vérifie que les deux catalogues portent
exactement les mêmes clés — un oubli côté anglais s'y voit immédiatement,
plutôt qu'en production sous la forme d'une phrase française isolée au milieu
d'une interface anglaise.
"""

from app.core.i18n import Locale
from app.locales.en import MESSAGES as EN_MESSAGES
from app.locales.fr import MESSAGES as FR_MESSAGES

CATALOGS: dict[Locale, dict[str, str]] = {
    Locale.FR: FR_MESSAGES,
    Locale.EN: EN_MESSAGES,
}

__all__ = ["CATALOGS"]
