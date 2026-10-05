"""
Tâche planifiée — reprise des menus dont la version anglaise manque.

Pendant exact de `blog/tasks.py`, avec une différence de fond : un menu ne
porte aucun statut de traduction. Son contenu est un arbre JSONB, et « il
manque une traduction » se lit directement dedans — un créneau rempli en
français sans équivalent anglais. C'est plus robuste qu'un statut : un menu
complété jour après jour repasse naturellement par ici pour les seuls
créneaux ajoutés depuis.

Planifiée toutes les heures par le service `beat` du compose.
"""

import asyncio
import logging
from datetime import date, timedelta

from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import task_sessions
from app.modules.menus.models import WeeklyMenu
from app.modules.menus.service import needs_translation, retranslate_content

logger = logging.getLogger(__name__)


@celery_app.task(name="app.modules.menus.tasks.retry_missing_translations")
def retry_missing_translations(limit: int = 50) -> dict:
    """Reprend les menus de la semaine en cours et des semaines à venir.

    Fenêtre volontairement courte : ce sont les seules semaines qu'un parent
    puisse lire (`GET /menus/current`, et `GET /menus/{week_start}` renvoie
    403 sur une semaine passée à qui n'a pas le droit d'historique). Traduire
    l'arriéré complet coûterait des appels pour des pages que seuls des
    gestionnaires consultent — et eux lisent le français.
    """

    async def _run() -> dict:
        if not settings.translation_active:
            return {"skipped": "translation_disabled"}

        today = date.today()
        current_monday = today - timedelta(days=today.weekday())

        async with task_sessions() as Session:
            async with Session() as db:
                menus = (
                    await db.execute(
                        select(WeeklyMenu)
                        .where(WeeklyMenu.week_start >= current_monday)
                        .order_by(WeeklyMenu.week_start.asc())
                    )
                ).scalars().all()
                candidates = [m.id for m in menus if needs_translation(m.content)][:limit]

            translated = 0
            still_missing = 0
            for menu_id in candidates:
                # Une transaction par menu, comme pour les articles : un échec
                # ne doit pas emporter les semaines déjà traduites.
                async with Session() as db:
                    menu = await db.get(WeeklyMenu, menu_id)
                    if menu is None:
                        continue
                    menu.content = await retranslate_content(menu.content, db)
                    await db.commit()
                    if needs_translation(menu.content):
                        still_missing += 1
                    else:
                        translated += 1

            return {"translated": translated, "still_missing": still_missing}

    try:
        return asyncio.run(_run())
    except Exception:  # noqa: BLE001 — la tâche ne peut pas crasher le beat
        logger.exception("Échec de la reprise des traductions de menus")
        return {"translated": 0, "still_missing": 0, "error": "unexpected"}
