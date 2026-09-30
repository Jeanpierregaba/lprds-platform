"""
E2E traduction automatique du contenu saisi (blog + menus).

**Aucun appel réseau** : `app.core.translation._call_model` est remplacé par un
faux traducteur déterministe, et son compteur d'appels sert à prouver la
mémoire de traduction. Appeler la vraie API en test la rendrait payante, lente
et dépendante du réseau — et surtout non déterministe, donc inassertable.

Le serveur de test tourne dans un thread du MÊME processus (cf. conftest.py),
donc substituer la fonction au niveau du module suffit : la requête HTTP
traverse bien le faux traducteur.

Ce que ce fichier verrouille, au-delà du chemin nominal :
  • une traduction corrigée à la main n'est JAMAIS réécrite par la machine ;
  • un échec de traduction ne bloque jamais une publication (repli FR) ;
  • un plat déjà vu ne repart pas au modèle (mémoire de traduction) ;
  • désactivée, la traduction laisse la plateforme parfaitement fonctionnelle.
"""

from datetime import date, timedelta

import pytest

from app.core import translation
from app.core.config import settings
from tests.helpers import PNG, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


class _FakeTranslator:
    """Traducteur déterministe : « texte » → « [EN] texte ».

    Le marqueur rend l'assertion lisible ET prouve la provenance : un champ
    sans `[EN]` n'a pas été traduit, ce qui est exactement ce qu'on veut
    distinguer d'un repli français.
    """

    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.fail = False

    def __call__(self, items: list[str]) -> list[str]:
        if self.fail:
            raise RuntimeError("panne simulée du service de traduction")
        self.calls.append(list(items))
        return [f"[EN] {item}" for item in items]

    @property
    def translated_count(self) -> int:
        """Nombre de textes réellement envoyés au modèle, tous appels confondus."""
        return sum(len(batch) for batch in self.calls)


@pytest.fixture
def fake_translator(monkeypatch):
    """Active la traduction en la branchant sur le faux traducteur.

    `translation_active` est une propriété dérivée du drapeau et de la clé :
    on pose les deux, pour emprunter le même chemin qu'en production plutôt
    que de court-circuiter la garde elle-même.
    """
    fake = _FakeTranslator()
    monkeypatch.setattr(translation, "_call_model", fake)
    monkeypatch.setattr(settings, "translation_enabled", True)
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key-not-used")
    return fake


def _setup_blog(c, adm):
    """Étiquette + article publiable (image à la une incluse)."""
    tag = c.post("/blog/tags", json={"name": "Événement"}, headers=adm).json()
    article = c.post("/blog/articles", json={
        "title": "La kermesse de printemps",
        "content": "Les enfants ont préparé des chansons.",
        "tag_id": tag["id"],
    }, headers=adm).json()
    c.post(f"/blog/articles/{article['id']}/cover",
           files={"file": ("c.png", PNG, "image/png")}, headers=adm)
    return article["id"]


# ── Blog ────────────────────────────────────────────────────────
def test_article_translated_on_publish(client, fake_translator):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    article_id = _setup_blog(c, adm)

    # Un brouillon n'est pas traduit : il bouge encore, chaque frappe
    # déclencherait un appel pour rien.
    draft = c.get(f"/blog/articles/{article_id}", headers=adm).json()
    ck("brouillon non traduit", draft["translation_status"], "pending")
    ck("aucun appel sur un brouillon", fake_translator.translated_count, 0)

    published = c.post(f"/blog/articles/{article_id}/publish", headers=adm).json()
    ck("traduit à la publication", published["translation_status"], "auto")
    ck("titre anglais", published["title_en"], "[EN] La kermesse de printemps")
    ck("contenu anglais", published["content_en"],
       "[EN] Les enfants ont préparé des chansons.")
    ck("titre français intact", published["title"], "La kermesse de printemps")


def test_public_site_serves_requested_language(client, fake_translator):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    article_id = _setup_blog(c, adm)
    c.post(f"/blog/articles/{article_id}/publish", headers=adm)

    # Le site vitrine n'est pas authentifié : aucun en-tête, `?locale=` fait foi.
    fr = c.get("/public/blog/LPRDS/articles?locale=fr").json()["items"][0]
    ck("[FR] titre français", fr["title"], "La kermesse de printemps")
    ck("[FR] langue servie", fr["locale"], "fr")

    en = c.get("/public/blog/LPRDS/articles?locale=en").json()["items"][0]
    ck("[EN] titre anglais", en["title"], "[EN] La kermesse de printemps")
    ck("[EN] langue servie", en["locale"], "en")

    detail = c.get(f"/public/blog/LPRDS/articles/{article_id}?locale=en").json()
    ck("détail anglais", detail["content"], "[EN] Les enfants ont préparé des chansons.")
    ck("détail langue servie", detail["locale"], "en")
    # Une valeur inconnue ne casse pas une page vitrine : repli, pas 422.
    bad = c.get("/public/blog/LPRDS/articles?locale=klingon")
    ck("locale inconnue tolérée", bad.status_code, 200)
    ck("locale inconnue → français", bad.json()["items"][0]["locale"], "fr")


def test_manual_correction_is_never_overwritten(client, fake_translator):
    """La règle centrale du module : l'humain a le dernier mot."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    article_id = _setup_blog(c, adm)
    c.post(f"/blog/articles/{article_id}/publish", headers=adm)

    # Modifier le texte français retraduit, tant que le statut vaut `auto`.
    c.patch(f"/blog/articles/{article_id}",
            json={"content": "Les enfants ont dansé."}, headers=adm)
    after = c.get(f"/blog/articles/{article_id}", headers=adm).json()
    ck("retraduit après modification", after["content_en"], "[EN] Les enfants ont dansé.")
    ck("toujours automatique", after["translation_status"], "auto")

    corrected = c.patch(f"/blog/articles/{article_id}/translation", json={
        "title_en": "The spring fair",
        "content_en": "The children danced.",
    }, headers=adm).json()
    ck("statut manuel après correction", corrected["translation_status"], "manual")

    # LE contrôle du fichier : une nouvelle modification du français ne doit
    # PAS écraser la correction humaine.
    before_calls = fake_translator.translated_count
    c.patch(f"/blog/articles/{article_id}",
            json={"content": "Les enfants ont beaucoup dansé."}, headers=adm)
    kept = c.get(f"/blog/articles/{article_id}", headers=adm).json()
    ck("correction humaine conservée", kept["content_en"], "The children danced.")
    ck("statut resté manuel", kept["translation_status"], "manual")
    ck("aucun appel au modèle", fake_translator.translated_count, before_calls)
    ck("français bien mis à jour", kept["content"], "Les enfants ont beaucoup dansé.")

    # /retranslate est le SEUL chemin qui reprend la main sur une correction —
    # un geste explicite du rédacteur, jamais un effet de bord.
    relaunched = c.post(f"/blog/articles/{article_id}/retranslate", headers=adm).json()
    ck("retraduction explicite écrase", relaunched["content_en"],
       "[EN] Les enfants ont beaucoup dansé.")
    ck("repassé en automatique", relaunched["translation_status"], "auto")


def test_translation_failure_never_blocks_publication(client, fake_translator):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    article_id = _setup_blog(c, adm)

    fake_translator.fail = True
    published = c.post(f"/blog/articles/{article_id}/publish", headers=adm)
    ck("publication réussie malgré l'échec", published.status_code, 200)
    body = published.json()
    ck("article bien publié", body["status"], "published")
    ck("échec de traduction tracé", body["translation_status"], "failed")
    ck("aucune version anglaise", body["title_en"], None)

    # Le site vitrine reste consultable : repli français, langue annoncée.
    en = c.get("/public/blog/LPRDS/articles?locale=en").json()["items"][0]
    ck("repli français", en["title"], "La kermesse de printemps")
    ck("langue servie annoncée honnêtement", en["locale"], "fr")

    # Et la panne est réparable sans retoucher l'article.
    fake_translator.fail = False
    fixed = c.post(f"/blog/articles/{article_id}/retranslate", headers=adm).json()
    ck("retraduction après panne", fixed["translation_status"], "auto")
    ck("version anglaise rétablie", fixed["title_en"], "[EN] La kermesse de printemps")


def test_translation_disabled_leaves_platform_intact(client):
    """Sans `fake_translator` : traduction désactivée, comme en dev et en test.

    C'est le mode par défaut du projet — il ne doit rien casser, et surtout
    pas empêcher de publier.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    article_id = _setup_blog(c, adm)

    published = c.post(f"/blog/articles/{article_id}/publish", headers=adm)
    ck("publication normale", published.status_code, 200)
    ck("statut failed (non configurée)", published.json()["translation_status"], "failed")
    en = c.get("/public/blog/LPRDS/articles?locale=en").json()["items"][0]
    ck("site vitrine en français", en["locale"], "fr")


# ── Menus ───────────────────────────────────────────────────────
def _monday(offset_weeks: int = 0) -> str:
    """Lundi de la semaine courante (+ décalage) — jamais une date figée :
    le module Menus compare à « aujourd'hui » côté serveur (cf. claude.md)."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    return (monday + timedelta(weeks=offset_weeks)).isoformat()


def test_menu_translated_and_memory_reused(client, fake_translator):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dept = c.post("/departments", json={"name": "Crèche"}, headers=adm).json()

    week1 = {
        "week_start": _monday(), "department_id": dept["id"],
        "monday": {"dejeuner": "Riz au gras", "dessert": "Ananas"},
        "tuesday": {"dejeuner": "Poulet braisé"},
    }
    created = c.post("/menus", json=week1, headers=adm)
    ck("menu créé", created.status_code, 201)
    ck("3 plats traduits", fake_translator.translated_count, 3)

    # Lecture : la langue vient du COMPTE (elle prime sur Accept-Language pour
    # un appel authentifié, cf. test_i18n.py).
    fr = c.get(f"/menus/{_monday()}?department_id={dept['id']}", headers=adm).json()
    ck("[FR] déjeuner", fr["monday"]["dejeuner"], "Riz au gras")

    c.patch("/auth/me/locale", json={"locale": "en"}, headers=adm)
    en = c.get(f"/menus/{_monday()}?department_id={dept['id']}", headers=adm).json()
    ck("[EN] déjeuner", en["monday"]["dejeuner"], "[EN] Riz au gras")
    ck("[EN] dessert", en["monday"]["dessert"], "[EN] Ananas")
    ck("[EN] mardi", en["tuesday"]["dejeuner"], "[EN] Poulet braisé")
    c.patch("/auth/me/locale", json={"locale": "fr"}, headers=adm)

    # LE contrôle de la mémoire de traduction : la semaine suivante reprend
    # deux plats à l'identique et n'en ajoute qu'un. Seul l'inédit doit partir
    # au modèle — c'est ce qui rend les menus quasi gratuits, et ce qui
    # garantit qu'un même plat est toujours traduit pareil.
    before = fake_translator.translated_count
    week2 = {
        "week_start": _monday(1), "department_id": dept["id"],
        "monday": {"dejeuner": "Riz au gras", "dessert": "Ananas"},
        "tuesday": {"dejeuner": "Igname pilée"},
    }
    ck("semaine 2 créée", c.post("/menus", json=week2, headers=adm).status_code, 201)
    ck("un seul plat inédit envoyé au modèle",
       fake_translator.translated_count - before, 1)
    ck("plat inédit bien celui-là", fake_translator.calls[-1], ["Igname pilée"])

    c.patch("/auth/me/locale", json={"locale": "en"}, headers=adm)
    en2 = c.get(f"/menus/{_monday(1)}?department_id={dept['id']}", headers=adm).json()
    ck("plat mémorisé traduit pareil", en2["monday"]["dejeuner"], "[EN] Riz au gras")
    ck("plat inédit traduit", en2["tuesday"]["dejeuner"], "[EN] Igname pilée")
    c.patch("/auth/me/locale", json={"locale": "fr"}, headers=adm)


def test_menu_partial_translation_falls_back_per_slot(client, fake_translator):
    """Repli par CRÉNEAU, pas par semaine.

    Un plat ajouté alors que la traduction est en panne ne doit pas faire
    basculer toute la semaine en français.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dept = c.post("/departments", json={"name": "Crèche"}, headers=adm).json()

    c.post("/menus", json={
        "week_start": _monday(), "department_id": dept["id"],
        "monday": {"dejeuner": "Riz au gras"},
    }, headers=adm)

    # Panne, puis ajout d'un plat : le PATCH remplace la semaine entière, la
    # branche anglaise n'est donc pas recalculée du tout.
    fake_translator.fail = True
    patched = c.patch(f"/menus/{_monday()}?department_id={dept['id']}", json={
        "monday": {"dejeuner": "Riz au gras", "dessert": "Mangue"},
    }, headers=adm)
    ck("enregistrement réussi malgré la panne", patched.status_code, 200)

    c.patch("/auth/me/locale", json={"locale": "en"}, headers=adm)
    en = c.get(f"/menus/{_monday()}?department_id={dept['id']}", headers=adm).json()
    ck("créneau sans traduction → français", en["monday"]["dessert"], "Mangue")
    ck("créneau traduit reste anglais", en["monday"]["dejeuner"], "[EN] Riz au gras")
    c.patch("/auth/me/locale", json={"locale": "fr"}, headers=adm)


def test_translation_memory_is_shared_and_auditable(client, fake_translator):
    """La mémoire est globale (pas scopée par établissement) et conserve la
    source — c'est un cache linguistique, pas une donnée métier."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm_a = onboard(c, su, "AAA", "admin@a.fr")
    adm_b = onboard(c, su, "BBB", "admin@b.fr")
    dept_a = c.post("/departments", json={"name": "Crèche"}, headers=adm_a).json()
    dept_b = c.post("/departments", json={"name": "Crèche"}, headers=adm_b).json()

    c.post("/menus", json={
        "week_start": _monday(), "department_id": dept_a["id"],
        "monday": {"dejeuner": "Riz au gras"},
    }, headers=adm_a)
    before = fake_translator.translated_count

    # Le même plat dans un AUTRE établissement : aucun appel supplémentaire.
    c.post("/menus", json={
        "week_start": _monday(), "department_id": dept_b["id"],
        "monday": {"dejeuner": "Riz au gras"},
    }, headers=adm_b)
    ck("mémoire partagée entre établissements",
       fake_translator.translated_count, before)
