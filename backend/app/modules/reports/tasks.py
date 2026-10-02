"""
Tâche planifiée — reprise des rapports dont la version anglaise manque.

Troisième pendant de `blog/tasks.py` et `menus/tasks.py`, et le plus
important des trois pour un parent : un rapport est le texte le plus personnel
de la plateforme, celui qu'une famille lit chaque jour.

L'état se lit dans `translation_pending`, drapeau DÉRIVÉ recalculé à chaque
tentative par `_translate_report`. Les menus s'en passent (leur fenêtre utile
tient en quelques lignes) ; ici le volume est tout autre, et le balayage doit
rester exact ET bon marché. Un `content_en IS NULL` n'aurait pas été exact : il
rate les rapports PARTIELLEMENT traduits, ceux qu'une panne en cours de
modification laisse derrière elle.

C'est aussi ce qui rattrape l'existant : les rapports antérieurs à la colonne
`content_en` partent tous de NULL, et un rapport ne se réécrit pas — sans ce
balayage, ils resteraient en français indéfiniment.

⚠️ Worker non déployé dans cette version — cf. `library/tasks.py`.
"""

import asyncio
import logging

from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import task_sessions
from app.modules.reports import service as reports_service
from app.modules.reports.models import Report, ReportStatus

logger = logging.getLogger(__name__)


@celery_app.task(name="app.modules.reports.tasks.retry_missing_translations")
def retry_missing_translations(limit: int = 50) -> dict:
    """Reprend les rapports VALIDÉS dont l'anglais manque encore.

    Les brouillons et les rapports soumis sont exclus : seul un rapport validé
    est visible du parent (cf. claude.md), et un brouillon bouge encore —
    chaque enregistrement relancerait une traduction pour rien.
    """

    async def _run() -> dict:
        if not settings.translation_active:
            return {"skipped": "translation_disabled"}

        async with task_sessions() as Session:
            async with Session() as db:
                candidates = (
                    await db.execute(
                        select(Report.id)
                        .where(
                            Report.status == str(ReportStatus.VALIDATED),
                            Report.translation_pending.is_(True),
                        )
                        # Les plus anciens d'abord : avec une limite par
                        # passage, servir les plus récents ferait attendre
                        # indéfiniment un rapport coincé derrière le flux.
                        .order_by(Report.created_at.asc())
                        .limit(limit)
                    )
                ).scalars().all()

            translated = 0
            still_missing = 0
            for report_id in candidates:
                # Une transaction par rapport : un échec ne doit pas emporter
                # les traductions déjà obtenues dans ce passage.
                async with Session() as db:
                    report = await db.get(Report, report_id)
                    if report is None:
                        continue
                    await reports_service.retranslate_report(report, db)
                    await db.commit()
                    if reports_service.needs_translation(report):
                        still_missing += 1
                    else:
                        translated += 1

            return {"translated": translated, "still_missing": still_missing}

    try:
        return asyncio.run(_run())
    except Exception:  # noqa: BLE001 — la tâche ne peut pas crasher le beat
        logger.exception("Échec de la reprise des traductions de rapports")
        return {"translated": 0, "still_missing": 0, "error": "unexpected"}
