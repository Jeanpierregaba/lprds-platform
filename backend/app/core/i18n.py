"""
Internationalisation du backend — catalogues FR/EN et résolution de langue.

Pourquoi un mécanisme maison plutôt que gettext/babel : le besoin se résume à
des dictionnaires de chaînes indexés par clé, sans pluriels complexes ni
extraction depuis les sources. Un `.po`/`.mo` imposerait une étape de
compilation dans le Dockerfile et un outillage étranger au reste du projet,
pour un gain nul ici. Les catalogues sont de simples dicts Python
(`app/locales/`), au même titre que `PERMISSION_LABELS` côté RBAC.

Règle de repli, volontairement stricte et bruyante en développement :
clé absente de la locale demandée → on tente le français → à défaut on renvoie
la clé elle-même et on journalise un avertissement. Une chaîne manquante
dégrade l'affichage, elle ne casse jamais une réponse HTTP.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar
from datetime import date
from enum import StrEnum

logger = logging.getLogger(__name__)


class Locale(StrEnum):
    FR = "fr"
    EN = "en"


DEFAULT_LOCALE: Locale = Locale.FR


# ── Langue de la requête en cours ───────────────────────────────
# Les `HTTPException` sont levées au fond des services, loin du routeur qui
# connaît la requête. Propager la locale dans chaque signature aurait touché
# presque toutes les fonctions du backend pour un seul paramètre.
#
# Une ContextVar résout cela proprement : elle est isolée par tâche asyncio,
# donc deux requêtes concurrentes ne se marchent pas dessus, et sa valeur
# traverse les `await` sans être passée de main en main.
#
# Elle est posée deux fois par requête : d'abord depuis `Accept-Language`
# (middleware), puis affinée par `users.locale` dès que l'utilisateur est
# authentifié — c'est son choix explicite qui doit primer.
_request_locale: ContextVar[Locale] = ContextVar("request_locale", default=DEFAULT_LOCALE)


def set_request_locale(locale: Locale) -> None:
    _request_locale.set(locale)


def current_locale() -> Locale:
    return _request_locale.get()


def coerce_locale(value: str | None) -> Locale:
    """Normalise une valeur libre (colonne en base, paramètre) en `Locale`.

    Tolère la casse et les variantes régionales (`fr-CA`, `EN_US`). Toute
    valeur inconnue retombe sur le français — c'est la langue des données
    historiques, antérieures à la colonne `users.locale`.
    """
    if not value:
        return DEFAULT_LOCALE
    tag = value.strip().lower().replace("_", "-").split("-")[0]
    return Locale.EN if tag == "en" else Locale.FR


def resolve_accept_language(accept_language: str | None) -> Locale:
    """Traduit un en-tête `Accept-Language` en locale.

    ⚠️ Même règle produit que le frontend (`src/i18n/detect.ts`), et elle est
    l'inverse d'un repli classique : le français n'est servi QUE si c'est la
    préférence la mieux notée. Toute autre langue — anglais, espagnol, wolof —
    donne de l'anglais. Un navigateur anglophone qui accepte le français en
    second (« en, fr;q=0.5 ») doit rester en anglais.
    """
    if not accept_language:
        return Locale.EN

    entries: list[tuple[str, float]] = []
    for part in accept_language.split(","):
        tag, _, params = part.strip().partition(";")
        tag = tag.strip().lower()
        if not tag:
            continue
        quality = 1.0
        for param in params.split(";"):
            param = param.strip()
            if param.startswith("q="):
                try:
                    quality = float(param[2:])
                except ValueError:
                    quality = 0.0
        if quality > 0:
            entries.append((tag, quality))

    if not entries:
        return Locale.EN

    best_tag = max(entries, key=lambda entry: entry[1])[0]
    if best_tag == "fr" or best_tag.startswith("fr-"):
        return Locale.FR
    return Locale.EN


def _catalog(locale: Locale) -> dict[str, str]:
    # Import différé : `app/locales/*` importe uniquement la stdlib, mais ce
    # module est chargé très tôt (config, dépendances) — on évite d'imposer
    # l'ordre d'import des catalogues au reste du démarrage.
    from app.locales import CATALOGS

    return CATALOGS[locale]


def t(key: str, locale: Locale | str | None = None, /, **params: object) -> str:
    """Traduit `key`, en interpolant `params`.

        t("errors.children.not_found")                    # langue de la requête
        t("emails.welcome.greeting", user.locale, first_name=...)  # langue imposée

    Sans `locale`, la langue de la requête en cours est utilisée. On la passe
    explicitement pour tout ce qui sort du cycle requête/réponse — un email
    part vers UN destinataire, dans SA langue, qui n'est pas forcément celle
    de l'admin qui a déclenché l'envoi.

    Les paramètres sont interpolés avec `str.format`. Un paramètre manquant
    n'interrompt pas la requête : la chaîne est renvoyée non interpolée et
    l'incident est journalisé — mieux vaut un libellé imparfait qu'une 500.
    """
    if locale is None:
        resolved = current_locale()
    elif isinstance(locale, Locale):
        resolved = locale
    else:
        resolved = coerce_locale(locale)

    template = _catalog(resolved).get(key)
    if template is None and resolved is not DEFAULT_LOCALE:
        template = _catalog(DEFAULT_LOCALE).get(key)
        if template is not None:
            logger.warning("i18n: clé '%s' absente du catalogue '%s'", key, resolved)

    if template is None:
        logger.warning("i18n: clé '%s' absente de tous les catalogues", key)
        return key

    if not params:
        return template

    try:
        return template.format(**params)
    except (KeyError, IndexError):
        logger.warning("i18n: interpolation impossible pour '%s' (%s)", key, resolved)
        return template


def format_long_date(value: date, locale: Locale | str | None = None) -> str:
    """Date en toutes lettres — « mardi 29 septembre 2026 », « Tuesday 29 September 2026 ».

    Pas de `strftime("%A %d %B %Y")` : celui-ci dépend de la locale *système*
    du conteneur (souvent `C`, donc anglais quoi qu'on demande) et l'ordre des
    segments est figé dans le code. Ici l'ordre vient du catalogue
    (`date.long`), donc d'une langue, et reste modifiable sans toucher au code.
    """
    return t(
        "date.long",
        locale,
        weekday=t(f"date.weekday.{value.weekday()}", locale),
        day=value.day,
        month=t(f"date.month.{value.month}", locale),
        year=value.year,
    )
