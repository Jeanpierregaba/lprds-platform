"""
Tâche planifiée — échéance des exemptions de présence.

⚠️ **Elle ne désactive rien.** Une exemption cesse de s'appliquer d'elle-même
dès que le jour sort de sa période : le statut de présence est calculé à la
volée, donc il n'y a aucun drapeau à basculer. Basculer `is_active=False` à
l'échéance ferait deux dégâts — l'exemption resterait en force jusqu'au
prochain passage du beat (donc une journée entière, et indéfiniment si le
worker est à terre), et surtout l'EXPORT, qui recalcule le passé, ferait
réapparaître la période écoulée en « absent ». Une tâche de fond réécrirait
l'historique.

Ce que la tâche fait, et c'est tout : constater les périodes achevées et le
DIRE à l'admin, une seule fois (`expired_notified_at`). Idempotente par
construction, comme les rappels de bibliothèque.

Planifiée chaque matin à 06:00 UTC par le service `beat` — avant les rappels
de bibliothèque de 07:00, pour que l'admin lise l'information au début de sa
journée, pas après avoir vu les absences du tableau de bord.
"""

import asyncio
import logging

from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.database import task_sessions
from app.modules.attendance import service as attendance_service
from app.modules.establishments.models import Establishment

logger = logging.getLogger(__name__)


@celery_app.task(name="app.modules.attendance.tasks.notify_expired_exemptions_all")
def notify_expired_exemptions_all() -> dict:
    """Entrypoint Celery (synchrone) — un établissement par session async.

    ⚠️ Jamais le moteur global : une tâche s'exécute dans un `asyncio.run()`
    qui ferme sa boucle, et une connexion asyncpg appartient à la boucle qui
    l'a créée. Le deuxième passage du beat piocherait une connexion rattachée
    à une boucle fermée — le premier passage marcherait, les suivants non.
    """

    async def _run() -> dict:
        async with task_sessions() as Session:
            async with Session() as db:
                establishment_ids = (
                    await db.execute(
                        select(Establishment.id).where(Establishment.is_active.is_(True))
                    )
                ).scalars().all()
            total = 0
            for establishment_id in establishment_ids:
                async with Session() as db:
                    total += await attendance_service.notify_expired_exemptions(
                        establishment_id, db
                    )
                    # ⚠️ Un COMMIT explicite : hors d'une requête HTTP il n'y a
                    # pas de `get_db` pour le faire en sortie. Sans lui,
                    # `expired_notified_at` ne survit pas à la session et
                    # l'admin relirait chaque matin que l'exemption de mardi
                    # dernier est terminée — l'anti-doublon existerait sans
                    # rien protéger.
                    await db.commit()
            return {"notified_exemptions": total}

    try:
        return asyncio.run(_run())
    except Exception:  # noqa: BLE001 — la tâche ne peut pas faire tomber le beat
        logger.exception("Échec de la notification d'échéance des exemptions")
        return {"notified_exemptions": 0, "error": "unexpected"}
