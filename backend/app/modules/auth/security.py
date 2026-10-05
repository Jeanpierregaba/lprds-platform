from datetime import datetime, timedelta, timezone
from typing import Literal
import secrets
import bcrypt
import jwt
from fastapi import HTTPException, status
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.i18n import t
from app.core.redis import redis_client

# ── Mots de passe ───────────────────────────────────────────────
def hash_password(password: str) -> str:
    """Hache un mot de passe avec bcrypt (coût 12)."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()

def verify_password(plain: str, hashed: str) -> bool:
    """Vérifie un mot de passe en temps constant (protection timing attack)."""
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def generate_temp_password(length: int = 12) -> str:
    """
    Génère un mot de passe temporaire lisible.
    Format : 4 mots de 3 chars séparés par - ex: Ax3-Kp7-Zm2-Qr9
    """
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    groups = [
        "".join(secrets.choice(chars) for _ in range(3))
        for _ in range(4)
    ]
    return "-".join(groups)

# ── JWT ─────────────────────────────────────────────────────────
TokenType = Literal["access", "refresh"]

def create_token(
    user_id: str,
    role: str,
    token_type: TokenType,
) -> str:
    """Crée un JWT signé avec le SECRET_KEY."""
    if token_type == "access":
        expire_delta = timedelta(minutes=settings.access_token_expire_minutes)
    else:
        expire_delta = timedelta(days=settings.refresh_token_expire_days)

    now = datetime.now(timezone.utc)
    payload = {
        "sub":  user_id,
        "role": role,
        "type": token_type,
        "iat":  now,
        "exp":  now + expire_delta,
        "jti":  secrets.token_hex(16), # ID unique par token
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)

def decode_token(token: str) -> dict:
    """
    Décode et valide un JWT.
    Lève jwt.InvalidTokenError si expiré ou invalide.
    """
    return jwt.decode(
        token,
        settings.secret_key,
        algorithms=[settings.algorithm],
    )

# ── Révocation de tokens (blacklist de jti dans Redis) ─────────
_REVOKED_PREFIX = "revoked_jti:"


async def revoke_token(payload: dict) -> None:
    """
    Révoque un token via son jti, jusqu'à son expiration naturelle.
    Passé cette date le JWT est de toute façon refusé : inutile de garder
    l'entrée plus longtemps, d'où le TTL aligné sur exp.
    """
    jti = payload.get("jti")
    exp = payload.get("exp")
    if not jti or not exp:
        return

    ttl = int(exp - datetime.now(timezone.utc).timestamp())
    if ttl <= 0:
        return  # déjà expiré

    try:
        await redis_client.setex(f"{_REVOKED_PREFIX}{jti}", ttl, "1")
    except RedisError as exc:
        raise _redis_unavailable() from exc


async def is_token_revoked(payload: dict) -> bool:
    jti = payload.get("jti")
    if not jti:
        # Token émis avant l'introduction du jti : non révocable
        return False
    try:
        return bool(await redis_client.exists(f"{_REVOKED_PREFIX}{jti}"))
    except RedisError as exc:
        # Fail-closed : sans Redis on ne peut pas prouver qu'un token n'a pas
        # été révoqué. Refuser vaut mieux qu'accepter un token révoqué.
        raise _redis_unavailable() from exc


def _redis_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=t("errors.auth.service_unavailable"),
    )

# ── Token de reset mot de passe (signé, non JWT) ───────────────
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

_signer = URLSafeTimedSerializer(settings.secret_key, salt="pwd-reset")


def generate_reset_token(email: str) -> str:
    """Génère un token signé pour le reset de mot de passe."""
    return _signer.dumps(email)

def verify_reset_token(token: str) -> str | None:
    """
    Valide le token et retourne l'email, ou None si invalide/expiré.
    """
    try:
        email = _signer.loads(
            token,
            max_age=settings.reset_token_expire_minutes * 60,
        )
        return str(email)
    except (BadSignature, SignatureExpired):
        return None
