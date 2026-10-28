"""
Tâche planifiée — rappels quotidiens des retours de livres.

Pour chaque établissement, reporte à `service.send_due_reminders`. Idempotente
par construction : le service ne rappelle chaque prêt éligible qu'une fois par
jour (`last_reminded_on`, anti-doublon).

Planifiée chaque matin à 07:00 UTC par le service `beat` du compose, en
parallèle du déclenchement manuel depuis l'admin — le planificateur rattrape,
il ne remplace pas.
"""

import asyncio
import logging

from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import task_sessions
from app.modules.library.models import Book
from app.modules.establishments.models import Establishment
from app.modules.library import service as library_service

logger = logging.getLogger(__name__)


@celery_app.task(name="app.modules.library.tasks.send_due_reminders_all")
def send_due_reminders_all() -> dict:
    """Entrypoint Celery (synchrone) : chaque établissement dans sa propre
    session async, via asyncio.run — Celery n'exécute pas de code async."""

    async def _run() -> dict:
        async with task_sessions() as Session:
            async with Session() as db:
                establishment_ids = (
                    await db.execute(
                        select(Establishment.id).where(Establishment.is_active.is_(True))
                    )
                ).scalars().all()
            total_parents = 0
            total_lendings = 0
            for establishment_id in establishment_ids:
                async with Session() as db:
                    result = await library_service.send_due_reminders(establishment_id, db)
                    # ⚠️ Hors cycle HTTP : il n'y a pas de `get_db` pour
                    # commiter en sortie, et `task_sessions()` ne le fait pas
                    # non plus. Sans ce commit, le `flush` du service est
                    # annulé à la fermeture de la session : l'anti-doublon
                    # `last_reminded_on` n'est jamais persisté et le message
                    # injecté dans la conversation du parent disparaît — donc
                    # un second rappel à chaque passage du beat, alors que
                    # c'est l'idempotence qui rend ce rattrapage inoffensif.
                    await db.commit()
                total_parents += result.reminded_parents
                total_lendings += result.reminded_lendings
            return {"reminded_parents": total_parents, "reminded_lendings": total_lendings}

    try:
        return asyncio.run(_run())
    except Exception:  # noqa: BLE001 — la tâche ne peut pas crasher le beat
        logger.exception("Échec des rappels quotidiens de bibliothèque")
        return {"reminded_parents": 0, "reminded_lendings": 0, "error": "unexpected"}


@celery_app.task(name="app.modules.library.tasks.retry_missing_translations")
def retry_missing_translations(limit: int = 50) -> dict:
    """Reprend les descriptions de livres dont l'anglais manque encore.

    Les livres n'ont pas de colonne de statut : « il manque la version
    anglaise » se lit directement (`description IS NOT NULL AND description_en
    IS NULL`). C'est aussi ce qui rattrape l'existant — les lignes créées avant
    la colonne partent toutes de NULL, et sans ce balayage un parent anglophone
    lirait leur description en français jusqu'à ce qu'un admin pense à rouvrir
    la fiche, c'est-à-dire en pratique jamais.

    Les livres DÉSACTIVÉS sont exclus : ils ne s'affichent dans aucun portail.
    """

    async def _run() -> dict:
        if not settings.translation_active:
            # Cas nominal en dev et en test — on ne touche à rien.
            return {"skipped": "translation_disabled"}

        async with task_sessions() as Session:
            async with Session() as db:
                book_ids = (
                    await db.execute(
                        select(Book.id)
                        .where(
                            Book.is_active.is_(True),
                            Book.description.is_not(None),
                            Book.description_en.is_(None),
                        )
                        # Les plus anciens d'abord, comme pour le blog : avec
                        # une limite par passage, servir les plus récents
                        # ferait attendre indéfiniment une fiche coincée
                        # derrière un flux de nouveautés.
                        .order_by(Book.created_at.asc())
                        .limit(limit)
                    )
                ).scalars().all()

            translated = 0
            for book_id in book_ids:
                # Une transaction PAR livre : un échec ne doit pas annuler les
                # traductions déjà obtenues ce passage-ci.
                async with Session() as db:
                    book = await db.get(Book, book_id)
                    if book is None or not book.description:
                        continue
                    book.description_en = await library_service.translate_description(
                        book.description, db
                    )
                    await db.commit()
                    if book.description_en:
                        translated += 1

            return {"translated": translated, "pending": len(book_ids) - translated}

    try:
        return asyncio.run(_run())
    except Exception:  # noqa: BLE001 — la tâche ne peut pas crasher le beat
        logger.exception("Échec de la reprise des traductions de bibliothèque")
        return {"translated": 0, "pending": 0, "error": "unexpected"}
