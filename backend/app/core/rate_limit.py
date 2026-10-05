"""
Limiteur de tentatives basé sur Redis (INCR + EXPIRE, fenêtre fixe) — pas de
dépendance externe (slowapi, etc.), le projet a déjà Redis comme dépendance
centrale (révocation de tokens, cf. auth/security.py).

Usage typique : throttling d'un endpoint sensible aux attaques par force
brute (ex: /auth/login), compté par une clé combinant IP + identifiant, et
réinitialisé uniquement sur succès — un utilisateur qui tape le bon mot de
passe du premier coup n'est jamais ralenti, seules les tentatives échouées
consomment le quota.
"""

from fastapi import HTTPException, status

from app.core.redis import redis_client
from app.core.i18n import t


async def check_and_increment(key: str, *, max_attempts: int, window_seconds: int) -> None:
    current = await redis_client.incr(key)
    if current == 1:
        # Première tentative de la fenêtre : (re)pose le TTL. Fait après
        # l'INCR (jamais avant) pour éviter une fenêtre sans expiration si le
        # process meurt entre les deux appels.
        await redis_client.expire(key, window_seconds)

    if current > max_attempts:
        ttl = await redis_client.ttl(key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=t("errors.auth.rate_limited", seconds=max(ttl, 1)),
        )


async def reset(key: str) -> None:
    await redis_client.delete(key)
