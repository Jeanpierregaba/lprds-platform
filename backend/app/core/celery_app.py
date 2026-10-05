"""Application Celery du backend — tâches planifiées (beat).

Le worker et le beat tournent comme deux services du compose (`worker` et
`beat`), séparés à dessein : le beat n'est qu'un ORDONNANCEUR, il ne doit
exister qu'en un exemplaire. Lancer `worker --beat` ferait repartir un
ordonnanceur avec chaque worker, et doubler le nombre de workers doublerait
chaque rappel envoyé aux parents.

Les tâches restent déclenchables à la main (`POST /library/reminders/run`,
bouton « Retraduire ») : le planificateur rattrape, il ne remplace pas.
"""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "lprds",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.modules.library.tasks",
        "app.modules.blog.tasks",
        "app.modules.menus.tasks",
        "app.modules.reports.tasks",
    ],
)

celery_app.conf.timezone = "UTC"
celery_app.conf.beat_schedule = {
    # Chaque matin à 07:00 UTC — les rappels de retour de livres.
    #
    # ⚠️ C'était un intervalle de 24 h, et le commentaire annonçait déjà 07:00 :
    # un intervalle part du DÉMARRAGE du beat, donc les rappels seraient tombés
    # à l'heure du dernier déploiement — 3 h du matin chez le parent si la mise
    # en production avait eu lieu à 3 h. Invisible tant que rien ne tournait.
    # `crontab` dit une heure, pas un délai.
    "library-due-reminders-daily": {
        "task": "app.modules.library.tasks.send_due_reminders_all",
        "schedule": crontab(hour=7, minute=0),
    },
    # Rattrapage des traductions laissées en arrière par un incident passager
    # (API injoignable, délai dépassé). Horaire, pas quotidien : une actualité
    # publiée le matin doit être lisible en anglais dans la journée, pas le
    # lendemain. Les deux tâches ne font rien si la traduction est désactivée,
    # et la mémoire absorbe ce qui a déjà été traduit — un passage à vide ne
    # coûte donc qu'une requête SQL.
    #
    # Les quatre sont décalées de quelques minutes plutôt que lancées ensemble :
    # elles tapent le même fournisseur de traduction, et un lot simultané est le
    # moyen le plus sûr de se faire limiter en débit par celui-ci.
    "blog-retry-translations-hourly": {
        "task": "app.modules.blog.tasks.retry_missing_translations",
        "schedule": crontab(minute=5),
    },
    "menus-retry-translations-hourly": {
        "task": "app.modules.menus.tasks.retry_missing_translations",
        "schedule": crontab(minute=20),
    },
    "reports-retry-translations-hourly": {
        "task": "app.modules.reports.tasks.retry_missing_translations",
        "schedule": crontab(minute=35),
    },
    "library-retry-translations-hourly": {
        "task": "app.modules.library.tasks.retry_missing_translations",
        "schedule": crontab(minute=50),
    },
}

# En conteneur, le worker démarre souvent avant que Redis accepte des
# connexions. Celery réessaie aujourd'hui par défaut, mais plus en 6.0 — sans
# ce réglage, un worker lancé une seconde trop tôt sortirait en erreur au lieu
# d'attendre, et `restart: unless-stopped` masquerait le problème en boucle.
celery_app.conf.broker_connection_retry_on_startup = True

# Un worker qui meurt en plein envoi ne doit pas faire disparaître la tâche :
# elle retourne à la file et repart au redémarrage. C'est tenable ici parce que
# TOUTES les tâches sont idempotentes par construction — anti-doublon
# journalier des rappels (`last_reminded_on`), mémoire de traduction, et
# balayages qui ne sélectionnent que ce qui manque encore.
celery_app.conf.task_acks_late = True
celery_app.conf.worker_prefetch_multiplier = 1

# Un balayage qui part en vrille (fournisseur qui ne répond plus, lot immense)
# ne doit pas occuper le worker indéfiniment ni bloquer les rappels du matin.
celery_app.conf.task_soft_time_limit = 10 * 60
celery_app.conf.task_time_limit = 12 * 60