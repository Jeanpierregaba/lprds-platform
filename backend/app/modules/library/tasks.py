"""
Tâche planifiée — rappels quotidiens des retours de livres.

Pour chaque établissement, reporte à `service.send_due_reminders`. Idempotente
par construction : le service ne rappelle chaque prêt éligible qu'une fois par
jour (`last_reminded_on`, anti-doublon).

⚠️ Worker non déployé dans cette version — la tâche existe pour être branchée
dès que Celery est lancé (`celery -A app.core.celery_app worker --beat`), en
parallèle du déclenchement manuel depuis l'admin.
"""

import asyncio
import logging

from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.database import task_sessions
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
                total_parents += result.reminded_parents
                total_lendings += result.reminded_lendings
            return {"reminded_parents": total_parents, "reminded_lendings": total_lendings}

    try:
        return asyncio.run(_run())
    except Exception:  # noqa: BLE001 — la tâche ne peut pas crasher le beat
        logger.exception("Échec des rappels quotidiens de bibliothèque")
        return {"reminded_parents": 0, "reminded_lendings": 0, "error": "unexpected"}