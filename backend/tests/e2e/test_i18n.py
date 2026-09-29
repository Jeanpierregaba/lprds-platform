"""
Socle d'internationalisation — catalogues, résolution de langue, préférence du
compte.

Le contrôle le plus important de ce fichier est `test_catalogs_have_same_keys` :
une clé oubliée en anglais ne casse rien à l'exécution (le repli sur le
français s'applique), elle produit simplement une phrase française isolée au
milieu d'une interface anglaise — exactement ce que ce chantier cherche à
éliminer, et exactement le genre de défaut qu'aucun test fonctionnel ne
rattrape.
"""

import pytest

from app.core.i18n import Locale, coerce_locale, resolve_accept_language, t
from app.locales import CATALOGS
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login


# ── Catalogues ──────────────────────────────────────────────────
def test_catalogs_have_same_keys():
    fr = set(CATALOGS[Locale.FR])
    en = set(CATALOGS[Locale.EN])

    ck("clés présentes en FR mais absentes en EN", sorted(fr - en), [])
    ck("clés présentes en EN mais absentes en FR", sorted(en - fr), [])


def test_no_empty_translation():
    for locale, catalog in CATALOGS.items():
        empty = sorted(key for key, value in catalog.items() if not value.strip())
        ck(f"chaînes vides dans le catalogue {locale}", empty, [])


def test_placeholders_match_across_locales():
    """Les paramètres interpolés doivent être identiques d'une langue à l'autre.

    Un `{seconds}` oublié dans la version anglaise ne lèverait pas d'erreur —
    `t()` renvoie la chaîne non interpolée — mais afficherait un message
    incomplet à l'utilisateur.
    """
    import re

    fields = re.compile(r"\{(\w+)\}")
    for key, fr_value in CATALOGS[Locale.FR].items():
        en_value = CATALOGS[Locale.EN].get(key, "")
        ck(
            f"paramètres de '{key}'",
            sorted(fields.findall(en_value)),
            sorted(fields.findall(fr_value)),
        )


# ── Résolution de la langue ─────────────────────────────────────
@pytest.mark.parametrize(
    "header,expected",
    [
        ("fr-FR,fr;q=0.9,en;q=0.8", Locale.FR),
        ("fr", Locale.FR),
        ("fr-CA", Locale.FR),
        ("en-US,en;q=0.9", Locale.EN),
        # Toute langue autre que le français donne de l'anglais — c'est la
        # règle produit, et c'est l'INVERSE d'un repli classique sur la locale
        # par défaut. Ces deux cas sont la raison d'être du résolveur maison.
        ("es-ES,es;q=0.9", Locale.EN),
        ("de-DE", Locale.EN),
        ("ar", Locale.EN),
        # La préférence la mieux notée décide : un navigateur anglophone qui
        # accepte le français en second doit rester en anglais.
        ("en,fr;q=0.5", Locale.EN),
        ("fr;q=0.9,en;q=0.4", Locale.FR),
        (None, Locale.EN),
        ("", Locale.EN),
        ("*", Locale.EN),
    ],
)
def test_resolve_accept_language(header, expected):
    ck(f"Accept-Language {header!r}", resolve_accept_language(header), expected)


@pytest.mark.parametrize(
    "value,expected",
    [
        ("fr", Locale.FR), ("en", Locale.EN), ("EN", Locale.EN),
        ("en-US", Locale.EN), ("fr_CA", Locale.FR),
        # Valeur inconnue ou absente → français : langue de toutes les données
        # antérieures à la colonne users.locale.
        ("zz", Locale.FR), (None, Locale.FR), ("", Locale.FR),
    ],
)
def test_coerce_locale(value, expected):
    ck(f"coerce_locale({value!r})", coerce_locale(value), expected)


def test_translation_falls_back_without_crashing():
    ck("clé connue en EN", t("errors.common.not_found", Locale.EN), "Not found")
    # Une clé absente renvoie la clé elle-même : l'affichage se dégrade, la
    # requête HTTP aboutit quand même.
    ck("clé inconnue", t("errors.nope.nope", Locale.EN), "errors.nope.nope")
    # Interpolation impossible : la chaîne brute plutôt qu'une 500.
    assert "{seconds}" in t("errors.auth.rate_limited", Locale.FR)


# ── Préférence de langue du compte ──────────────────────────────
def test_locale_persisted_on_account(client):
    su = login(client, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

    ck("langue par défaut", client.get("/auth/me", headers=su).json()["locale"], "fr")

    r = client.patch("/auth/me/locale", json={"locale": "en"}, headers=su)
    ck("bascule en anglais", r.status_code, 200)
    ck("réponse à jour", r.json()["locale"], "en")
    ck("relecture", client.get("/auth/me", headers=su).json()["locale"], "en")

    # Une langue non traduite est refusée par le schéma, avant le service :
    # la colonne ne peut jamais contenir autre chose que "fr" ou "en".
    ck(
        "langue non prise en charge",
        client.patch("/auth/me/locale", json={"locale": "es"}, headers=su).status_code,
        422,
    )

    ck(
        "retour au français",
        client.patch("/auth/me/locale", json={"locale": "fr"}, headers=su).status_code,
        200,
    )


def test_locale_endpoint_requires_authentication(client):
    ck(
        "sans jeton",
        client.patch("/auth/me/locale", json={"locale": "en"}).status_code,
        403,
    )
