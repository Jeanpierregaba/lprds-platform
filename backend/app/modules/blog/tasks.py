"""
Tâche planifiée — reprise des articles dont la version anglaise manque.

La traduction est best-effort : un appel qui échoue ou dépasse le délai pose
`failed` et rend la main, pour ne jamais bloquer une publication. Restait un
trou : plus personne ne reprenait cet article. Le bouton « Retraduire » de
l'éditeur suppose que quelqu'un revienne le voir — or un incident de quelques
minutes chez le fournisseur laisse justement derrière lui des articles que
personne ne pense à rouvrir. Cette tâche balaie ce qui est resté en arrière.

Planifiée toutes les heures par le service `beat` du compose.

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
from app.modules.blog.models import (
    Article,
    ArticleStatus,
    BlogGalleryCategory,
    BlogTag,
    TranslationStatus,
)

logger = logging.getLogger(__name__)


@celery_app.task(name="app.modules.blog.tasks.retry_missing_translations")
def retry_missing_translations(limit: int = 50) -> dict:
    """Reprend les articles PUBLIÉS dont l'anglais manque encore, et les
    libellés (étiquettes, catégories de galerie) jamais traduits.

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

            # Vocabulaires libres — étiquettes d'article et catégories de
            # galerie. Ils n'ont pas de statut : « il manque la version
            # anglaise » se lit directement (`name_en IS NULL`).
            #
            # C'est aussi ce qui rattrape l'existant : les lignes créées avant
            # l'ajout de la colonne partent toutes de NULL, et le site vitrine
            # anglais afficherait sinon leurs libellés français jusqu'au
            # prochain renommage — c'est-à-dire, en pratique, indéfiniment.
            labels = 0
            for model in (BlogTag, BlogGalleryCategory):
                async with Session() as db:
                    pending = (
                        await db.execute(
                            select(model.id)
                            .where(model.name_en.is_(None))
                            .order_by(model.created_at.asc())
                            .limit(limit)
                        )
                    ).scalars().all()

                for entity_id in pending:
                    async with Session() as db:
                        entity = await db.get(model, entity_id)
                        if entity is None:
                            continue
                        entity.name_en = await blog_service.translate_label(entity.name, db)
                        await db.commit()
                        if entity.name_en:
                            labels += 1

            return {
                "translated": translated,
                "still_failing": still_failing,
                "labels": labels,
            }

    try:
        return asyncio.run(_run())
    except Exception:  # noqa: BLE001 — la tâche ne peut pas crasher le beat
        logger.exception("Échec de la reprise des traductions du blog")
        return {"translated": 0, "still_failing": 0, "labels": 0, "error": "unexpected"}
