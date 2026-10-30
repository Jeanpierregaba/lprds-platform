"""Client Redis partagé (révocation de tokens, cache)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import redis.asyncio as aioredis

from app.core.config import settings


def _new_pool() -> aioredis.ConnectionPool:
    return aioredis.ConnectionPool.from_url(settings.redis_url, decode_responses=True)


redis_client: aioredis.Redis = aioredis.Redis(connection_pool=_new_pool())


@asynccontextmanager
async def task_pool() -> AsyncIterator[None]:
    """Prête au client un pool Redis valable pour LA boucle de cette tâche.

    Même piège que le moteur SQLAlchemy global, et même profil de panne (cf.
    `task_sessions`) : une connexion Redis asyncio appartient à la boucle qui
    l'a ouverte, alors qu'une tâche s'exécute par `asyncio.run()`, donc dans
    une boucle NEUVE à chaque passage. Le premier passage garnit le pool, le
    second y pioche une connexion rattachée à une boucle désormais fermée et
    lève « got Future attached to a different loop ».

    Ce n'était pas théorique : les rappels de bibliothèque injectent un
    message dans la conversation du parent, donc publient sur Redis. Dès le
    SECOND passage dans la vie d'un worker, cette publication échouait — et
    comme le temps réel est best-effort, `ws_manager` l'attrapait et la
    journalisait : le rappel partait quand même, mais le parent connecté ne
    voyait plus rien arriver en direct, et ce pour toujours. Le genre de
    panne qu'aucun écran ne montre.

    ⚠️ Il faut borner les DEUX côtés, et c'est le second qui a été trouvé en
    second : un pool neuf à l'entrée ne suffit pas, car en sortie la tâche
    rendrait au pool PARTAGÉ les connexions ouvertes dans sa boucle, que le
    prochain venu paierait à son tour (« unable to perform operation on …
    the handler is closed », levé côté serveur dans la vérification de
    révocation de jeton). La tâche referme donc son pool dans sa propre
    boucle — le seul endroit où ces connexions peuvent encore se fermer
    proprement — puis repose celui qu'elle avait trouvé.

    On remplace le POOL et non le client : tous les consommateurs font
    `from app.core.redis import redis_client`, donc importent l'objet par
    valeur — réassigner le module ne les atteindrait pas.
    """
    borrowed = redis_client.connection_pool
    mine = _new_pool()
    redis_client.connection_pool = mine
    try:
        yield
    finally:
        try:
            await mine.disconnect()
        finally:
            redis_client.connection_pool = borrowed


async def close_redis() -> None:
    await redis_client.aclose()
