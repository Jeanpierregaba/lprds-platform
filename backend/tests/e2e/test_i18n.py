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


# ── Libellés servis par l'API ───────────────────────────────────
def test_report_vocabulary_is_fully_translated():
    """Chaque valeur du vocabulaire des rapports a son libellé dans les DEUX
    catalogues.

    C'est le seul vocabulaire resté côté backend (le PDF du bulletin annuel
    lit les mêmes chaînes, cf. `reports/pdf.py`) : ajouter une valeur à un
    enum de `reports/models.py` sans l'ajouter aux catalogues afficherait le
    code brut dans le formulaire ET dans le bulletin, sans la moindre erreur.
    """
    from app.modules.reports.service import VOCABULARY_GROUPS

    missing = sorted({
        f"reports.vocabulary.{group}.{code.value}"
        for group, enum in VOCABULARY_GROUPS.items()
        for code in enum
        for catalogue in (CATALOGS[Locale.FR], CATALOGS[Locale.EN])
        if f"reports.vocabulary.{group}.{code.value}" not in catalogue
    })
    ck("valeurs de vocabulaire sans libellé", missing, [])

    # Les deux langues disent bien des choses différentes : un copier-coller
    # du français dans en.py passerait tous les contrôles structurels.
    ck("libellé FR", t("reports.vocabulary.acquisition_level.a_consolider", "fr"),
       "À consolider")
    ck("libellé EN", t("reports.vocabulary.acquisition_level.a_consolider", "en"),
       "Needs consolidating")


def test_account_locale_wins_over_accept_language(client):
    """Deux sources de langue, une seule règle : le compte prime dès qu'on est
    authentifié. Vérifié en envoyant délibérément l'en-tête CONTRAIRE."""
    from tests.helpers import onboard

    su = login(client, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(client, su, "LPRDS", "admin@a.fr")

    vocab = client.get("/reports/vocabulary",
                       headers={**adm, "Accept-Language": "en-GB"}).json()
    ck("compte FR malgré Accept-Language: en",
       vocab["acquisition_level"]["a_consolider"], "À consolider")

    ck("bascule du compte en anglais",
       client.patch("/auth/me/locale", json={"locale": "en"},
                    headers=adm).status_code, 200)
    vocab = client.get("/reports/vocabulary",
                       headers={**adm, "Accept-Language": "fr-FR"}).json()
    ck("compte EN malgré Accept-Language: fr",
       vocab["acquisition_level"]["a_consolider"], "Needs consolidating")
    ck("les clés restent les codes stables",
       sorted(vocab["acquisition_level"]),
       ["a_consolider", "acquis", "en_cours_acquisition"])


def test_permissions_catalog_exposes_codes_only(client):
    """Contrairement au vocabulaire des rapports, les libellés de permissions
    n'alimentent aucun document : ils vivent côté frontend, et l'API ne parle
    donc plus aucune langue ici."""
    from tests.helpers import onboard

    su = login(client, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(client, su, "LPRDS", "admin@a.fr")

    perms = client.get("/rbac/permissions", headers=adm).json()
    ck("catalogue non vide", len(perms) > 0, True)
    ck("aucun libellé renvoyé", [p for p in perms if "label" in p], [])
    ck("chaque entrée porte son code", all(p.get("code") for p in perms), True)


# ── Documents générés ───────────────────────────────────────────
def test_period_label_follows_reader_not_database():
    """Le libellé de période est recalculé à la lecture.

    La colonne `reports.period_label` garde la version française de la
    création : si l'affichage la lisait, un parent anglophone verrait
    « 16–31 juillet 2026 » dans une interface anglaise.
    """
    from datetime import date

    from app.modules.reports.models import ReportType
    from app.modules.reports.service import period_label

    cases = [
        (ReportType.QUOTIDIEN, date(2026, 7, 20), date(2026, 7, 20),
         "20 juillet 2026", "20 July 2026"),
        (ReportType.BI_MENSUEL, date(2026, 7, 16), date(2026, 7, 31),
         "16–31 juillet 2026", "16–31 July 2026"),
        (ReportType.ANNUEL, date(2026, 1, 1), date(2026, 12, 31),
         "Année 2026", "Year 2026"),
    ]
    for report_type, start, end, fr, en in cases:
        ck(f"{report_type} en FR", period_label(report_type, start, end, "fr"), fr)
        ck(f"{report_type} en EN", period_label(report_type, start, end, "en"), en)


def test_attendance_export_renders_in_both_languages():
    """Les lignes d'export portent des codes ; PDF et Excel posent les libellés.

    Contrôlé sur le classeur Excel, dont le contenu est lisible sans analyser
    un PDF : le PDF partage exactement les mêmes clés et la même liste de
    colonnes (`_COLUMN_KEYS`).
    """
    import io
    from datetime import date, datetime

    import openpyxl

    from app.modules.attendance.export import (
        render_attendance_pdf,
        render_attendance_xlsx,
    )
    from app.modules.attendance.schemas import AttendanceExportRow

    rows = [
        AttendanceExportRow(
            person_type="child", name="Ana Kossou", matricule="LPRDS-A1B2C",
            date=date(2026, 9, 29), status="late",
            arrival_time=datetime(2026, 9, 29, 8, 40), departure_time=None,
            late_minutes=10, meal_taken=None,
        ),
        AttendanceExportRow(
            person_type="staff", name="Tata Victoire", matricule="LPRDS-D2Y",
            date=date(2026, 9, 29), status="exempt", arrival_time=None,
            departure_time=None, late_minutes=None, meal_taken=True,
        ),
    ]
    expected = {
        "fr": ("Présences", "Statut", "Enfant", "Retard", "Oui"),
        "en": ("Attendance", "Status", "Child", "Late", "Yes"),
    }
    for locale, (sheet, status_header, child, late, yes) in expected.items():
        content = render_attendance_xlsx(
            "Crèche LPRDS", date(2026, 9, 1), date(2026, 9, 30), rows, locale,
        )
        ws = openpyxl.load_workbook(io.BytesIO(content)).active
        ck(f"[{locale}] nom de la feuille", ws.title, sheet)
        ck(f"[{locale}] en-tête de statut", ws.cell(row=5, column=5).value, status_header)
        ck(f"[{locale}] type de personne", ws.cell(row=6, column=1).value, child)
        ck(f"[{locale}] statut traduit", ws.cell(row=6, column=5).value, late)
        ck(f"[{locale}] cantine traduite", ws.cell(row=7, column=9).value, yes)

        # Le PDF doit au moins se construire dans les deux langues : une clé
        # manquante y passerait sinon inaperçue jusqu'au téléchargement réel.
        pdf = render_attendance_pdf(
            "Crèche LPRDS", date(2026, 9, 1), date(2026, 9, 30), rows, locale,
        )
        ck(f"[{locale}] PDF produit", pdf.startswith(b"%PDF"), True)
