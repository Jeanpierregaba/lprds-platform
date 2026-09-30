"""
Traduction automatique du contenu saisi (blog, menus) via l'API Claude.

Le reste de la plateforme est traduit par catalogues figés (`app/locales/`) :
des chaînes écrites une fois, relues, versionnées. Ce module traite le cas
inverse — du texte rédigé par l'établissement, inconnu à l'avance, qu'on ne
peut pas demander à un rédacteur de saisir deux fois.

Trois principes, tous délibérés :

1. **Best-effort, jamais bloquant.** Un échec de traduction n'empêche jamais
   de publier un article ni d'enregistrer un menu — le contenu français est
   la source de vérité, la version anglaise est un plus. C'est la même
   politique que la messagerie ou les emails de rapport, à l'opposé du mot de
   passe temporaire (qui bloque parce qu'il EST le seul canal de délivrance).

2. **Résultat stocké, jamais calculé à la lecture.** Le site vitrine doit
   rester instantané et indexable, la traduction doit être corrigeable à la
   main, et une panne de l'API ne doit pas faire tomber le site.

3. **Mémoire de traduction.** Les menus répètent les mêmes plats semaine après
   semaine : une entrée déjà traduite n'est jamais renvoyée au modèle. Ça
   réduit le coût à presque rien sur les menus, et garantit surtout qu'un même
   plat est toujours traduit pareil d'une semaine à l'autre — une cohérence
   qu'un appel indépendant par semaine ne donnerait pas.

Le modèle par défaut est Claude Haiku 4.5 (choix explicite de l'utilisateur) :
la tâche est courte, bien cadrée et volumineuse, elle n'appelle pas un modèle
de raisonnement. Le modèle reste configurable (`TRANSLATION_MODEL`).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.i18n import DEFAULT_LOCALE, Locale
from app.core.translation_models import TranslationMemory

logger = logging.getLogger(__name__)


class TranslationUnavailable(Exception):
    """La traduction n'a pas abouti — appelant libre de marquer `failed`.

    Volontairement une seule exception, sans distinguer « pas configurée » de
    « appel en échec » : aucun appelant ne réagit différemment (tous sont
    best-effort), et les distinguer inviterait à des branches jamais testées.
    """


# Le prompt système est fixe et court : il porte les seules règles que le
# métier a exprimées. Tout le contexte variable passe par le message
# utilisateur, jamais ici — un système stable est aussi ce qui se met en cache
# côté API si le volume le justifiait un jour.
_SYSTEM_PROMPT = """You translate content for the website of a French \
preschool and daycare called « Les Petits Rayons de Soleil » (LPRDS).

Rules:
- Translate from French to English (British spelling).
- Keep the warm, direct tone of a small school talking to families. Do not \
make the text more formal or more elaborate than the original.
- Never translate proper nouns: people's names, the school's name, section \
names (Étoile, Nuage, Soleil, Petite Section, Moyenne Section, Grande \
Section), or dish names that have no English equivalent — keep those as they \
are.
- Preserve the original formatting exactly: line breaks, blank lines, \
punctuation style, capitalisation of headings, and any markup.
- Translate only. Never add, remove, explain or summarise anything.
- If an item is already in English, return it unchanged.

You will be given a numbered list of items. Return a translation for every \
item, in the same order, with the same count."""


class _TranslationBatch(BaseModel):
    """Sortie structurée attendue du modèle.

    Sans `output_config`, le modèle répondrait en texte libre et il faudrait
    deviner où commence et finit chaque élément — fragile dès qu'un contenu
    porte lui-même des retours à la ligne ou une numérotation, ce qui est le
    cas d'un article de blog.
    """

    translations: list[str] = Field(
        description="One translation per input item, same order, same count."
    )


def _fingerprint(text: str) -> str:
    """Clé de mémoire — le texte exact, normalisé sur les bords seulement.

    Pas de normalisation de casse ni de ponctuation : « Riz au gras » et
    « riz au gras » peuvent légitimement se traduire différemment selon leur
    place (titre vs milieu de phrase), et un faux partage serait invisible.
    """
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


async def _lookup_memory(
    db: AsyncSession, fingerprints: list[str], target: Locale
) -> dict[str, str]:
    if not fingerprints:
        return {}
    rows = await db.execute(
        select(TranslationMemory.source_hash, TranslationMemory.target_text).where(
            TranslationMemory.source_hash.in_(fingerprints),
            TranslationMemory.source_locale == str(DEFAULT_LOCALE),
            TranslationMemory.target_locale == str(target),
        )
    )
    return dict(rows.all())


async def _remember(
    db: AsyncSession, pairs: list[tuple[str, str, str]], target: Locale
) -> None:
    """Enregistre les couples fraîchement traduits.

    `ON CONFLICT DO NOTHING` plutôt qu'un test préalable : deux requêtes
    concurrentes peuvent traduire le même plat en même temps (deux menus
    enregistrés à la suite), et la course ne mérite pas une 500.
    """
    if not pairs:
        return
    await db.execute(
        pg_insert(TranslationMemory)
        .values([
            {
                "source_hash": fingerprint,
                "source_locale": str(DEFAULT_LOCALE),
                "target_locale": str(target),
                "source_text": source,
                "target_text": translated,
            }
            for fingerprint, source, translated in pairs
        ])
        .on_conflict_do_nothing(
            index_elements=["source_hash", "source_locale", "target_locale"]
        )
    )


def _call_model(items: list[str]) -> list[str]:
    """Appel bloquant au SDK Anthropic — toujours via `asyncio.to_thread`.

    Import local : le paquet `anthropic` ne doit être requis que si la
    traduction est réellement activée, et ce module est importé par le
    registre de modèles au démarrage de l'app.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    numbered = "\n".join(f"{i + 1}. {text}" for i, text in enumerate(items))
    response = client.messages.parse(
        model=settings.translation_model,
        max_tokens=16000,
        system=_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"Translate these {len(items)} items:\n\n{numbered}",
        }],
        output_format=_TranslationBatch,
    )
    parsed = response.parsed_output
    if parsed is None:
        raise TranslationUnavailable("réponse sans sortie structurée")
    if len(parsed.translations) != len(items):
        # Garde-fou dur : un décalage d'un seul élément associerait chaque
        # traduction au mauvais texte source, et cette erreur-là serait
        # recopiée en base par la mémoire de traduction.
        raise TranslationUnavailable(
            f"{len(parsed.translations)} traductions pour {len(items)} éléments"
        )
    return parsed.translations


async def translate_texts(
    texts: list[str], db: AsyncSession, target: Locale = Locale.EN
) -> list[str]:
    """Traduit une liste de textes, mémoire de traduction comprise.

    L'ordre et le nombre d'éléments en sortie correspondent exactement à
    l'entrée : les appelants (blog, menus) reconstruisent leur structure par
    position. Les chaînes vides traversent sans appel.

    Lève `TranslationUnavailable` si la traduction n'est pas configurée, a
    échoué, ou a dépassé le délai — jamais une erreur HTTP, c'est l'appelant
    qui décide quoi en faire.
    """
    if not settings.translation_active:
        raise TranslationUnavailable("traduction désactivée ou clé absente")

    # Dédoublonnage dans le lot lui-même : un même plat peut revenir plusieurs
    # fois dans une semaine, inutile de le facturer deux fois.
    pending: dict[str, str] = {}
    for text in texts:
        if text and text.strip():
            pending.setdefault(_fingerprint(text), text)

    if not pending:
        return list(texts)

    known = await _lookup_memory(db, list(pending), target)
    missing = {fp: src for fp, src in pending.items() if fp not in known}

    if missing:
        fingerprints = list(missing)
        sources = [missing[fp] for fp in fingerprints]
        try:
            translated = await asyncio.wait_for(
                asyncio.to_thread(_call_model, sources),
                timeout=settings.translation_timeout_seconds,
            )
        except TranslationUnavailable:
            raise
        except (TimeoutError, asyncio.TimeoutError) as exc:
            raise TranslationUnavailable("délai dépassé") from exc
        except Exception as exc:  # noqa: BLE001 — toute panne SDK/réseau
            logger.exception("Échec de l'appel de traduction")
            raise TranslationUnavailable(str(exc)) from exc

        fresh = list(zip(fingerprints, sources, translated))
        await _remember(db, fresh, target)
        known.update({fp: out for fp, _src, out in fresh})

    # Reconstruction par position : un texte vide reste vide, un texte connu
    # reprend sa traduction — jamais de décalage d'index.
    return [
        known.get(_fingerprint(text), text) if text and text.strip() else text
        for text in texts
    ]
