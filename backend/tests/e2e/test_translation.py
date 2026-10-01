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
    # Repère pris APRÈS le montage : celui-ci crée une étiquette, dont le nom
    # est désormais traduit lui aussi (cf. vocabulaires libres). Ce qu'on
    # mesure ici, c'est l'ARTICLE.
    after_setup = fake_translator.translated_count

    # Un brouillon n'est pas traduit : il bouge encore, chaque frappe
    # déclencherait un appel pour rien.
    draft = c.get(f"/blog/articles/{article_id}", headers=adm).json()
    ck("brouillon non traduit", draft["translation_status"], "pending")
    ck("aucun appel sur un brouillon", fake_translator.translated_count, after_setup)

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


# ── Correction manuelle des menus ───────────────────────────────
def test_menu_correction_is_kept_and_reused_next_week(client, fake_translator):
    """LE contrôle du chantier : une correction de menu vaut pour la suite.

    Sans propagation en mémoire, corriger « riz au gras » cette semaine serait
    un coup d'épée dans l'eau — la semaine suivante relirait l'entrée posée par
    la machine et réafficherait la même erreur. C'est ce qui distingue une
    correction d'une simple retouche d'affichage.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dept = c.post("/departments", json={"name": "Crèche"}, headers=adm).json()
    week = f"?department_id={dept['id']}"

    c.post("/menus", json={
        "week_start": _monday(), "department_id": dept["id"],
        "monday": {"dejeuner": "Riz au gras", "dessert": "Ananas"},
    }, headers=adm)

    # L'écran de relecture montre les deux langues, et la branche anglaise
    # TELLE QU'ELLE EST STOCKÉE (pas de repli français qui masquerait un trou).
    screen = c.get(f"/menus/{_monday()}/translation{week}", headers=adm).json()
    ck("français affiché", screen["french"]["monday"]["dejeuner"], "Riz au gras")
    ck("anglais automatique", screen["english"]["monday"]["dejeuner"], "[EN] Riz au gras")
    ck("rien de corrigé encore", screen["manual_slots"], [])

    corrected = c.patch(f"/menus/{_monday()}/translation{week}", json={
        "monday": {"dejeuner": "Jollof-style rice", "dessert": "[EN] Ananas"},
    }, headers=adm)
    ck("correction acceptée", corrected.status_code, 200)
    ck("créneau marqué corrigé", "monday.dejeuner" in corrected.json()["manual_slots"], True)

    c.patch("/auth/me/locale", json={"locale": "en"}, headers=adm)
    en = c.get(f"/menus/{_monday()}{week}", headers=adm).json()
    ck("correction servie aux lecteurs", en["monday"]["dejeuner"], "Jollof-style rice")
    c.patch("/auth/me/locale", json={"locale": "fr"}, headers=adm)

    # Modifier UN AUTRE créneau ne doit pas emporter la correction, et ne doit
    # pas la renvoyer au modèle.
    before = fake_translator.translated_count
    c.patch(f"/menus/{_monday()}{week}", json={
        "monday": {"dejeuner": "Riz au gras", "dessert": "Ananas"},
        "tuesday": {"dejeuner": "Poulet braisé"},
    }, headers=adm)
    after = c.get(f"/menus/{_monday()}/translation{week}", headers=adm).json()
    ck("correction conservée", after["english"]["monday"]["dejeuner"], "Jollof-style rice")
    ck("toujours marquée corrigée", "monday.dejeuner" in after["manual_slots"], True)
    ck("un seul plat inédit au modèle", fake_translator.translated_count - before, 1)

    # ET LE POINT CENTRAL : la semaine suivante, le même plat français reprend
    # la correction — sans appel au modèle.
    before = fake_translator.translated_count
    c.post("/menus", json={
        "week_start": _monday(1), "department_id": dept["id"],
        "monday": {"dejeuner": "Riz au gras"},
    }, headers=adm)
    ck("aucun appel : la mémoire connaît le plat",
       fake_translator.translated_count, before)

    c.patch("/auth/me/locale", json={"locale": "en"}, headers=adm)
    next_week = c.get(f"/menus/{_monday(1)}{week}", headers=adm).json()
    ck("correction propagée à la semaine suivante",
       next_week["monday"]["dejeuner"], "Jollof-style rice")
    c.patch("/auth/me/locale", json={"locale": "fr"}, headers=adm)


def test_menu_correction_dropped_when_its_dish_changes(client, fake_translator):
    """Une correction ne survit qu'à son plat.

    Si le français du créneau change, la correction portait sur un AUTRE plat :
    la conserver afficherait la traduction d'un repas qui n'est plus servi —
    pire qu'un repli en français. Même raisonnement que `_salvage_english`.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dept = c.post("/departments", json={"name": "Crèche"}, headers=adm).json()
    week = f"?department_id={dept['id']}"

    c.post("/menus", json={
        "week_start": _monday(), "department_id": dept["id"],
        "monday": {"dejeuner": "Riz au gras"},
    }, headers=adm)
    c.patch(f"/menus/{_monday()}/translation{week}",
            json={"monday": {"dejeuner": "Jollof-style rice"}}, headers=adm)

    c.patch(f"/menus/{_monday()}{week}",
            json={"monday": {"dejeuner": "Spaghettis bolognaise"}}, headers=adm)
    after = c.get(f"/menus/{_monday()}/translation{week}", headers=adm).json()
    ck("plat remplacé retraduit par la machine",
       after["english"]["monday"]["dejeuner"], "[EN] Spaghettis bolognaise")
    ck("marquage de correction levé", after["manual_slots"], [])


def test_menu_translation_screen_is_reserved_to_writers(client, fake_translator):
    """Écran d'édition, pas de consultation : `menus:write` exigé.

    Qui lit le menu le lit déjà dans sa langue par les routes normales — seul
    celui qui écrit a besoin de voir les deux versions côte à côte.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dept = c.post("/departments", json={"name": "Crèche"}, headers=adm).json()
    week = f"?department_id={dept['id']}"
    c.post("/menus", json={
        "week_start": _monday(), "department_id": dept["id"],
        "monday": {"dejeuner": "Riz au gras"},
    }, headers=adm)

    c.post("/staff", json={
        "first_name": "Ada", "last_name": "Lovelace", "nickname": "Ada",
        "phone": "+229", "email": "educ@a.fr", "password": "Staff2026",
        "staff_type": "educateur",
    }, headers=adm)
    staff = login(c, "educ@a.fr", "Staff2026")
    c.post("/auth/password-change", json={
        "current_password": "Staff2026", "new_password": "Staff2026New",
    }, headers=staff)
    staff = login(c, "educ@a.fr", "Staff2026New")

    ck("lecture refusée sans menus:write",
       c.get(f"/menus/{_monday()}/translation{week}", headers=staff).status_code, 403)
    ck("écriture refusée sans menus:write",
       c.patch(f"/menus/{_monday()}/translation{week}",
               json={"monday": {"dejeuner": "x"}}, headers=staff).status_code, 403)


def test_menu_correction_allowed_on_a_past_week(client, fake_translator):
    """Seule écriture du module admise sur une semaine passée.

    La règle « on ne réécrit jamais l'historique » protège ce qui a été SERVI ;
    une traduction ne dit rien de plus sur le repas. L'interdire rendrait
    incorrigible une erreur repérée le vendredi — la fonction n'aurait plus
    d'objet.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dept = c.post("/departments", json={"name": "Crèche"}, headers=adm).json()
    week = f"?department_id={dept['id']}"

    # Semaine passée : impossible à créer par l'API, on la pose puis on la
    # recule en base serait plus lourd — on vérifie donc les deux faces sur la
    # semaine courante pour l'écriture normale, et sur une semaine passée pour
    # la seule route de traduction.
    ck("saisie du menu refusée dans le passé",
       c.post("/menus", json={
           "week_start": _monday(-1), "department_id": dept["id"],
           "monday": {"dejeuner": "Riz au gras"},
       }, headers=adm).status_code, 422)

    c.post("/menus", json={
        "week_start": _monday(), "department_id": dept["id"],
        "monday": {"dejeuner": "Riz au gras"},
    }, headers=adm)
    ck("correction acceptée sur la semaine en cours",
       c.patch(f"/menus/{_monday()}/translation{week}",
               json={"monday": {"dejeuner": "Jollof-style rice"}},
               headers=adm).status_code, 200)
    # Une semaine passée sans menu renvoie 404 (rien à corriger), jamais le
    # 422 « semaine passée » que renvoient les autres écritures.
    ck("pas de garde « semaine passée » sur cette route",
       c.patch(f"/menus/{_monday(-1)}/translation{week}",
               json={"monday": {"dejeuner": "x"}}, headers=adm).status_code, 404)
# ── Reprise planifiée des traductions ───────────────────────────
def test_retry_task_recovers_a_failed_article(client, fake_translator):
    """Le trou que cette tâche comble : après une panne passagère, plus
    personne ne reprenait l'article. Le bouton « Retraduire » suppose que
    quelqu'un revienne le voir."""
    from app.modules.blog import tasks as blog_tasks

    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    article_id = _setup_blog(c, adm)

    fake_translator.fail = True
    c.post(f"/blog/articles/{article_id}/publish", headers=adm)
    ck("article publié mais non traduit",
       c.get(f"/blog/articles/{article_id}", headers=adm).json()["translation_status"],
       "failed")

    fake_translator.fail = False
    result = blog_tasks.retry_missing_translations()
    ck("un article repris", result["translated"], 1)

    fixed = c.get(f"/blog/articles/{article_id}", headers=adm).json()
    ck("traduction rattrapée sans geste humain", fixed["translation_status"], "auto")
    ck("titre anglais rétabli", fixed["title_en"], "[EN] La kermesse de printemps")

    # Idempotence : un second passage ne retrouve plus rien à faire.
    ck("rien à reprendre au passage suivant",
       blog_tasks.retry_missing_translations()["translated"], 0)


def test_retry_task_backfills_labels_never_translated(client, fake_translator):
    """Le rattrapage de l'existant.

    Les étiquettes et catégories créées AVANT la colonne `name_en` partent
    toutes de NULL : sans ce balayage, le site vitrine anglais afficherait
    leurs libellés français jusqu'au prochain renommage — autant dire
    indéfiniment, un libellé se renommant rarement.
    """
    from app.modules.blog import tasks as blog_tasks

    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    # Panne au moment de la création : c'est l'état où se trouvent les lignes
    # antérieures à la colonne.
    fake_translator.fail = True
    tag = c.post("/blog/tags", json={"name": "Activités"}, headers=adm).json()
    category = c.post("/blog/gallery/categories", json={"name": "Repas"}, headers=adm).json()
    ck("étiquette sans anglais", tag["name_en"], None)
    ck("catégorie sans anglais", category["name_en"], None)

    fake_translator.fail = False
    ck("deux libellés rattrapés", blog_tasks.retry_missing_translations()["labels"], 2)

    en = {i["name"] for i in c.get("/public/blog/LPRDS/tags?locale=en").json()["items"]}
    ck("pastille d'étiquette en anglais", en, {"[EN] Activités"})
    cats = {i["name"] for i in c.get("/public/blog/LPRDS/gallery/categories?locale=en").json()["items"]}
    ck("pastille de catégorie en anglais", cats, {"[EN] Repas"})

    ck("rien à reprendre au passage suivant",
       blog_tasks.retry_missing_translations()["labels"], 0)


def test_retry_task_ignores_drafts(client, fake_translator):
    """Un brouillon n'est visible de personne hors de l'établissement, et
    beaucoup ne seront jamais publiés — les traduire serait payer pour du
    texte que le site ne montrera jamais."""
    from app.modules.blog import tasks as blog_tasks

    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    article_id = _setup_blog(c, adm)
    # Cf. test_article_translated_on_publish : le montage traduit l'étiquette.
    after_setup = fake_translator.translated_count

    ck("brouillon en attente",
       c.get(f"/blog/articles/{article_id}", headers=adm).json()["translation_status"],
       "pending")
    ck("tâche sans effet sur un brouillon",
       blog_tasks.retry_missing_translations()["translated"], 0)
    ck("aucun appel au modèle", fake_translator.translated_count, after_setup)


def test_retry_task_fills_menu_gaps_without_touching_corrections(client, fake_translator):
    from app.modules.menus import tasks as menu_tasks

    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dept = c.post("/departments", json={"name": "Crèche"}, headers=adm).json()
    week = f"?department_id={dept['id']}"

    c.post("/menus", json={
        "week_start": _monday(), "department_id": dept["id"],
        "monday": {"dejeuner": "Riz au gras"},
    }, headers=adm)
    c.patch(f"/menus/{_monday()}/translation{week}",
            json={"monday": {"dejeuner": "Jollof-style rice"}}, headers=adm)

    # Panne pendant l'ajout d'un plat : le nouveau créneau reste sans anglais.
    fake_translator.fail = True
    c.patch(f"/menus/{_monday()}{week}", json={
        "monday": {"dejeuner": "Riz au gras", "dessert": "Mangue"},
    }, headers=adm)
    gap = c.get(f"/menus/{_monday()}/translation{week}", headers=adm).json()
    ck("trou bien présent", gap["english"]["monday"]["dessert"], None)

    fake_translator.fail = False
    ck("un menu repris", menu_tasks.retry_missing_translations()["translated"], 1)

    healed = c.get(f"/menus/{_monday()}/translation{week}", headers=adm).json()
    ck("trou comblé", healed["english"]["monday"]["dessert"], "[EN] Mangue")
    ck("correction humaine intacte",
       healed["english"]["monday"]["dejeuner"], "Jollof-style rice")
    ck("toujours marquée corrigée", healed["manual_slots"], ["monday.dejeuner"])
    ck("rien à reprendre ensuite",
       menu_tasks.retry_missing_translations()["translated"], 0)


def test_retry_tasks_do_nothing_when_translation_is_disabled(client):
    """Sans `fake_translator` : mode par défaut du projet.

    Le garde compte double — il évite l'appel payant, mais surtout il évite de
    poser `failed` sur des articles parfaitement sains dans une installation
    qui n'a jamais activé la traduction.
    """
    from app.modules.blog import tasks as blog_tasks
    from app.modules.menus import tasks as menu_tasks

    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    article_id = _setup_blog(c, adm)
    c.post(f"/blog/articles/{article_id}/publish", headers=adm)

    ck("blog : tâche neutralisée",
       blog_tasks.retry_missing_translations(), {"skipped": "translation_disabled"})
    ck("menus : tâche neutralisée",
       menu_tasks.retry_missing_translations(), {"skipped": "translation_disabled"})


# ── Vocabulaires libres : étiquettes et catégories ──────────────
def test_free_form_vocabularies_are_translated_for_the_public_site(client, fake_translator):
    """Étiquettes d'article et catégories de galerie — le trou le plus voyant.

    Ces deux vocabulaires sont créés librement par l'établissement et
    s'affichent sur le SITE VITRINE : les pastilles de filtre de /actualites et
    /galerie restaient en français au milieu d'une page anglaise.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    tag = c.post("/blog/tags", json={"name": "Événement"}, headers=adm).json()
    ck("étiquette traduite à la création", tag["name_en"], "[EN] Événement")
    ck("français intact", tag["name"], "Événement")

    category = c.post("/blog/gallery/categories", json={"name": "Repas"}, headers=adm).json()
    ck("catégorie traduite à la création", category["name_en"], "[EN] Repas")

    # Le site vitrine sert le libellé DANS la langue demandée, prêt à afficher.
    fr = c.get("/public/blog/LPRDS/tags?locale=fr").json()["items"][0]
    ck("[FR] pastille française", fr["name"], "Événement")
    en = c.get("/public/blog/LPRDS/tags?locale=en").json()["items"][0]
    ck("[EN] pastille anglaise", en["name"], "[EN] Événement")

    cat_en = c.get("/public/blog/LPRDS/gallery/categories?locale=en").json()["items"][0]
    ck("[EN] catégorie anglaise", cat_en["name"], "[EN] Repas")
    cat_fr = c.get("/public/blog/LPRDS/gallery/categories?locale=fr").json()["items"][0]
    ck("[FR] catégorie française", cat_fr["name"], "Repas")

    # L'étiquette portée par un article suit la même langue que l'article.
    article = c.post("/blog/articles", json={
        "title": "La kermesse", "content": "Les enfants ont chanté.", "tag_id": tag["id"],
    }, headers=adm).json()
    c.post(f"/blog/articles/{article['id']}/cover",
           files={"file": ("c.png", PNG, "image/png")}, headers=adm)
    c.post(f"/blog/articles/{article['id']}/publish", headers=adm)

    listed = c.get("/public/blog/LPRDS/articles?locale=en").json()["items"][0]
    ck("[EN] étiquette de l'article en liste", listed["tag"]["name"], "[EN] Événement")
    detail = c.get(f"/public/blog/LPRDS/articles/{article['id']}?locale=en").json()
    ck("[EN] étiquette de l'article au détail", detail["tag"]["name"], "[EN] Événement")

    # Vue de GESTION : le rédacteur édite le français, et voit l'anglais à part.
    managed = c.get("/blog/tags", headers=adm).json()["items"][0]
    ck("gestion : nom français", managed["name"], "Événement")
    ck("gestion : anglais exposé pour correction", managed["name_en"], "[EN] Événement")


def test_vocabulary_correction_sticks_and_spreads(client, fake_translator):
    """Une correction de libellé est gravée en mémoire, comme pour les menus.

    C'est ce qui remplace ici le statut `manual` des articles : pour un nom de
    deux mots qui revient d'un établissement à l'autre, la mémoire de
    traduction est le bon support — la correction vaut pour la suite, partout.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm_a = onboard(c, su, "AAA", "admin@a.fr")
    adm_b = onboard(c, su, "BBB", "admin@b.fr")

    tag = c.post("/blog/tags", json={"name": "Sortie scolaire"}, headers=adm_a).json()
    ck("traduction automatique", tag["name_en"], "[EN] Sortie scolaire")

    corrected = c.patch(f"/blog/tags/{tag['id']}", json={
        "name": "Sortie scolaire", "name_en": "School trip",
    }, headers=adm_a).json()
    ck("correction enregistrée", corrected["name_en"], "School trip")

    # LE contrôle : le même libellé, créé ailleurs, reprend la correction —
    # sans repasser par le modèle.
    before = fake_translator.translated_count
    other = c.post("/blog/tags", json={"name": "Sortie scolaire"}, headers=adm_b).json()
    ck("correction reprise dans un autre établissement", other["name_en"], "School trip")
    ck("aucun appel au modèle", fake_translator.translated_count, before)


def test_vocabulary_translation_failure_never_blocks(client, fake_translator):
    """Best-effort : créer une étiquette ne dépend pas du service de traduction."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")

    fake_translator.fail = True
    created = c.post("/blog/tags", json={"name": "Spectacle"}, headers=adm)
    ck("création réussie malgré la panne", created.status_code, 201)
    ck("pas de version anglaise", created.json()["name_en"], None)

    # Le site vitrine reste lisible : repli français, pas de trou.
    en = c.get("/public/blog/LPRDS/tags?locale=en").json()["items"][0]
    ck("repli français sur la pastille", en["name"], "Spectacle")

    # Et le renommage rattrape, une fois le service revenu.
    fake_translator.fail = False
    tag_id = created.json()["id"]
    renamed = c.patch(f"/blog/tags/{tag_id}", json={"name": "Spectacle de fin d'année"},
                      headers=adm).json()
    ck("traduction rattrapée au renommage", renamed["name_en"], "[EN] Spectacle de fin d'année")


# ── Moteurs de traduction ───────────────────────────────────────
class _FakeHttpx:
    """Client httpx minimal — LibreTranslate sans réseau.

    On intercepte au niveau du client HTTP, et non de `_call_model`, parce que
    c'est précisément le code du moteur qu'on veut exercer : la forme du
    payload, la lecture de la réponse, et le traitement des cas tordus.
    """

    def __init__(self, responses):
        self.responses = list(responses)
        self.requests: list[dict] = []

    def __call__(self, *_args, **_kwargs):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def post(self, url, json):
        self.requests.append({"url": url, "json": json})
        return self.responses.pop(0)


class _FakeResponse:
    def __init__(self, payload, error: Exception | None = None):
        self.payload = payload
        self.error = error

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.payload


@pytest.fixture
def libretranslate(monkeypatch):
    """Bascule le moteur sur LibreTranslate, instance fictive."""
    monkeypatch.setattr(settings, "translation_enabled", True)
    monkeypatch.setattr(settings, "translation_provider", "libretranslate")
    monkeypatch.setattr(settings, "libretranslate_url", "http://libretranslate:5000/")
    monkeypatch.setattr(settings, "libretranslate_api_key", "")
    return settings


def test_libretranslate_engine_respects_the_shared_contract(libretranslate, monkeypatch):
    """Même contrat que Claude : même nombre, même ordre."""
    import httpx

    fake = _FakeHttpx([
        _FakeResponse({"translatedText": "Fatty rice"}),
        _FakeResponse({"translatedText": "Pineapple"}),
    ])
    monkeypatch.setattr(httpx, "Client", fake)

    got = translation._call_model(["Riz au gras", "Ananas"])
    ck("ordre et nombre préservés", got, ["Fatty rice", "Pineapple"])
    ck("un appel par élément", len(fake.requests), 2)

    first = fake.requests[0]
    ck("URL construite sans double slash", first["url"], "http://libretranslate:5000/translate")
    ck("source française", first["json"]["source"], "fr")
    ck("cible anglaise", first["json"]["target"], "en")
    ck("texte brut, pas du HTML", first["json"]["format"], "text")
    # Une instance auto-hébergée n'exige aucune clé : ne pas en envoyer une vide.
    ck("aucune clé envoyée sans clé configurée", "api_key" in first["json"], False)


def test_libretranslate_sends_the_key_only_when_configured(libretranslate, monkeypatch):
    import httpx

    monkeypatch.setattr(settings, "libretranslate_api_key", "clé-publique")
    fake = _FakeHttpx([_FakeResponse({"translatedText": "Show"})])
    monkeypatch.setattr(httpx, "Client", fake)

    translation._call_model(["Spectacle"])
    ck("clé transmise", fake.requests[0]["json"]["api_key"], "clé-publique")


def test_libretranslate_failures_degrade_like_the_other_engine(libretranslate, monkeypatch):
    """Un moteur en panne doit rendre `TranslationUnavailable`, jamais autre
    chose : c'est ce que tout l'amont (blog, menus, libellés) sait traiter."""
    import httpx

    # 1. L'instance répond en erreur HTTP.
    fake = _FakeHttpx([_FakeResponse({}, error=RuntimeError("502"))])
    monkeypatch.setattr(httpx, "Client", fake)
    with pytest.raises(RuntimeError):
        translation._call_model(["Riz au gras"])

    # 2. Réponse malformée ou vide : le moteur refuse plutôt que de propager
    #    une chaîne vide, qui écraserait silencieusement une traduction.
    for payload in ({"translatedText": ""}, {"translatedText": None}, {}):
        monkeypatch.setattr(httpx, "Client", _FakeHttpx([_FakeResponse(payload)]))
        with pytest.raises(translation.TranslationUnavailable):
            translation._call_model(["Riz au gras"])


def test_translation_active_depends_on_the_chosen_engine(monkeypatch):
    """Chaque moteur a sa propre condition d'activation.

    Les confondre ferait croire la traduction appelable alors qu'elle ne peut
    pas aboutir — et chaque publication partirait en `failed` au lieu de se
    comporter comme « non configurée ».
    """
    monkeypatch.setattr(settings, "translation_enabled", True)

    monkeypatch.setattr(settings, "translation_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "libretranslate_url", "http://libretranslate:5000")
    ck("anthropic sans clé → inactif", settings.translation_active, False)
    monkeypatch.setattr(settings, "anthropic_api_key", "clé")
    ck("anthropic avec clé → actif", settings.translation_active, True)

    monkeypatch.setattr(settings, "translation_provider", "libretranslate")
    monkeypatch.setattr(settings, "libretranslate_url", "")
    ck("libretranslate sans URL → inactif", settings.translation_active, False)
    monkeypatch.setattr(settings, "libretranslate_url", "http://libretranslate:5000")
    ck("libretranslate avec URL → actif", settings.translation_active, True)

    monkeypatch.setattr(settings, "translation_enabled", False)
    ck("drapeau éteint → inactif quel que soit le moteur", settings.translation_active, False)
