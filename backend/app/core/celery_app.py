"""Application Celery du backend — tâches planifiées (beat).

⚠️ Le worker n'est PAS déployé dans cette version : la tâche quotidienne de
rappels de la bibliothèque est prête (prévue dans `library/tasks.py`), mais
c'est le déclenchement manuel (`POST /api/v1/library/reminders/run`) qui fait
office de passage en production tant que Celery n'est pas lancé.
"""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "lprds",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.modules.library.tasks",
        "app.modules.blog.tasks",
        "app.modules.menus.tasks",
    ],
)

celery_app.conf.timezone = "UTC"
celery_app.conf.beat_schedule = {
    # Chaque matin à 07:00 UTC — les rappels de retour de livres
    "library-due-reminders-daily": {
        "task": "app.modules.library.tasks.send_due_reminders_all",
        "schedule": 60.0 * 60 * 24,  # toutes les 24h (beat), simple et déterministe
    },
    # Rattrapage des traductions laissées en arrière par un incident passager
    # (API injoignable, délai dépassé). Horaire, pas quotidien : une actualité
    # publiée le matin doit être lisible en anglais dans la journée, pas le
    # lendemain. Les deux tâches ne font rien si la traduction est désactivée,
    # et la mémoire absorbe ce qui a déjà été traduit — un passage à vide ne
    # coûte donc qu'une requête SQL.
    "blog-retry-translations-hourly": {
        "task": "app.modules.blog.tasks.retry_missing_translations",
        "schedule": 60.0 * 60,
    },
    "menus-retry-translations-hourly": {
        "task": "app.modules.menus.tasks.retry_missing_translations",
        "schedule": 60.0 * 60,
    },
}