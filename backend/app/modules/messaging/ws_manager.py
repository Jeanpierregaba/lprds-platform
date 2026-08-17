"""
Diffusion temps réel via Redis pub/sub.

Architecture volontaire : les écritures passent TOUJOURS par les endpoints REST
(validées, permissionnées, testables normalement) ; le WebSocket ne fait QUE
relayer, sans aucune logique métier. Après une écriture réussie, le service
publie l'événement — avec son contenu complet, pas juste un signal "va
recharger" — sur un canal Redis ; chaque connexion WebSocket, sur n'importe
quel worker, relaie ce qu'elle reçoit sur les canaux auxquels elle est
abonnée. Fonctionne correctement avec plusieurs workers (contrairement à un
registre de connexions purement en mémoire) puisque le relais passe par Redis,
pas par un état local au process.

Publier le contenu complet (pas un pointeur à re-fetch) contourne aussi la
question d'ordonnancement commit/publish : même si la publication arrivait
avant la fin de la transaction HTTP, le client n'a pas besoin d'interroger la
base pour afficher l'événement.
"""

import asyncio
import contextlib
import json
import logging

from fastapi import WebSocket

from app.core.redis import redis_client

logger = logging.getLogger(__name__)


async def publish_event(channel: str, payload: dict) -> None:
    """
    Best-effort : contrairement à l'email (canal de délivrance critique sans
    filet), un échec de publication ne doit JAMAIS faire échouer l'action REST
    qui l'a déclenchée — le message est déjà persisté, il sera vu au prochain
    chargement de la conversation même sans le push temps réel.
    """
    try:
        await redis_client.publish(channel, json.dumps(payload, default=str))
    except Exception:
        logger.exception("Échec de publication temps réel sur %s", channel)


async def relay_channels(websocket: WebSocket, channels: list[str]) -> None:
    """Relaie tout ce qui est publié sur `channels` vers ce websocket."""
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(*channels)
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            await websocket.send_text(message["data"])
    finally:
        with contextlib.suppress(Exception):
            await pubsub.unsubscribe(*channels)
        with contextlib.suppress(Exception):
            await pubsub.aclose()


async def run_relay_until_disconnect(websocket: WebSocket, channels: list[str]) -> None:
    """
    Lance le relais en tâche de fond et bloque jusqu'à déconnexion du client
    (détectée en lisant les frames entrantes — leur contenu est ignoré, ce
    canal ne sert qu'à la détection de coupure).
    """
    from starlette.websockets import WebSocketDisconnect

    relay_task = asyncio.create_task(relay_channels(websocket, channels))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await relay_task
