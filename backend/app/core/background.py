"""Travail qu'une requête LANCE sans l'attendre.

Un envoi d'email ou un push est un aller-retour réseau vers un tiers. Tenu par
la requête, il en fixe la durée : à 60 s de plafond SMTP par message (le défaut
d'`aiosmtplib`), une validation de rapport pouvait dépasser d'une minute ce que
le navigateur accepte d'attendre — et ce que le reverse proxy laisse passer.

Le patron est toujours le même, et l'ordre compte : ce qui exige la base est lu
PENDANT la requête, où la session existe ; il ne reste ensuite que des valeurs,
qu'une tâche déroule après la réponse.

⚠️ Conséquence assumée : la requête ne connaît plus l'issue de ce qu'elle
n'attend pas. Elle ne peut rapporter que ce qu'elle a PROGRAMMÉ. C'est
acceptable pour un canal best-effort (le rapport reste consultable sur le
portail si l'email échoue) et inacceptable pour un canal de délivrance critique
— un mot de passe temporaire n'existe que dans son email, donc il bloque la
réponse, et c'est une règle du projet.
"""

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger(__name__)

#: ⚠️ `asyncio` ne retient qu'une référence FAIBLE sur une tâche : sans cet
#: ensemble, le ramasse-miettes peut l'emporter en plein vol et personne ne
#: recevrait rien, sans la moindre trace.
_tasks: set[asyncio.Task] = set()


def spawn(coro: Coroutine[Any, Any, Any], *, label: str) -> None:
    """Lance `coro` après la réponse, sans que la requête l'attende.

    `label` ne sert qu'au journal : une tâche de fond qui échoue n'a aucun
    écran où se plaindre, donc son seul témoin est cette ligne.
    """
    task = asyncio.create_task(coro)
    _tasks.add(task)

    def _done(finished: asyncio.Task) -> None:
        _tasks.discard(finished)
        if finished.cancelled():
            logger.warning("Tâche de fond annulée : %s", label)
            return
        exc = finished.exception()
        if exc is not None:
            logger.error("Tâche de fond en échec : %s", label, exc_info=exc)

    task.add_done_callback(_done)
