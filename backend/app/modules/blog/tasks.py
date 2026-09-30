"""
Tâche planifiée — reprise des articles dont la version anglaise manque.

La traduction est best-effort : un appel qui échoue ou dépasse le délai pose
`failed` et rend la main, pour ne jamais bloquer une publication. Restait un
trou : plus personne ne reprenait cet article. Le bouton « Retraduire » de
l'éditeur suppose que quelqu'un revienne le voir — or un incident de quelques
minutes chez le fournisseur laisse justement derrière lui des articles que
personne ne pense à rouvrir. Cette tâche balaie ce qui est resté en arrière.

⚠️ Worker non déployé dans cette version — comme `library/tasks.py`, la tâche
est prête à être branchée (`celery -A app.core.celery_app worker --beat`).

Compromis assumé : aucune limite au nombre de tentatives par article. Un
article qui échouerait à chaque passage serait donc réessayé indéfiniment.
Plafonner les tentatives rouvrirait exactement le trou qu'on vient de
combler — un article abandonné en silence, sans que personne en soit informé.
Le coût reste borné par `limit` × la fréquence du beat, deux réglages
explicites.
"""

import asyncio
import logging

from sqlalchemy import or_, select

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import task_sessions
from app.modules.blog import service as blog_service
from app.modules.blog.models import Article, ArticleStatus, TranslationStatus

logger = logging.getLogger(__name__)


@celery_app.task(name="app.modules.blog.tasks.retry_missing_translations")
def retry_missing_translations(limit: int = 50) -> dict:
    """Reprend les articles PUBLIÉS dont l'anglais manque encore.

    Les brouillons sont volontairement exclus : ils ne sont visibles de
    personne hors de l'établissement, et beaucoup ne seront jamais publiés —
    les traduire reviendrait à payer pour du texte que le site ne montrera
    jamais. La traduction d'un brouillon se déclenche à sa publication.
    """

    async def _run() -> dict:
        if not settings.translation_active:
            # Cas nominal en dev et en test : on ne journalise pas en erreur,
            # et surtout on ne touche à rien (chaque tentative poserait
            # `failed` sur des articles parfaitement sains).
            return {"skipped": "translation_disabled"}

        async with task_sessions() as Session:
            async with Session() as db:
                article_ids = (
                    await db.execute(
                        select(Article.id)
                        .where(
                            Article.is_active.is_(True),
                            Article.status == str(ArticleStatus.PUBLISHED),
                            or_(
                                Article.translation_status == str(TranslationStatus.PENDING),
                                Article.translation_status == str(TranslationStatus.FAILED),
                            ),
                        )
                        # Les plus anciens d'abord : avec une limite par
                        # passage, servir les plus récents ferait indéfiniment
                        # attendre un article coincé derrière un flux de
                        # publications.
                        .order_by(Article.updated_at.asc())
                        .limit(limit)
                    )
                ).scalars().all()

            translated = 0
            still_failing = 0
            for article_id in article_ids:
                # Une session (donc une transaction) PAR article : un échec ne
                # doit pas annuler les traductions déjà obtenues ce passage-ci.
                async with Session() as db:
                    article = await db.get(Article, article_id)
                    if article is None:
                        continue
                    await blog_service.translate_article(article, db)
                    await db.commit()
                    if article.translation_status == str(TranslationStatus.AUTO):
                        translated += 1
                    else:
                        still_failing += 1

            return {"translated": translated, "still_failing": still_failing}

    try:
        return asyncio.run(_run())
    except Exception:  # noqa: BLE001 — la tâche ne peut pas crasher le beat
        logger.exception("Échec de la reprise des traductions d'articles")
        return {"translated": 0, "still_failing": 0, "error": "unexpected"}
