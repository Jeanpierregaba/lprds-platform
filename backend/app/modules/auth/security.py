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


#: Alphabet sans caractère ambigu — ni O/0, ni l/1/I. Ce mot de passe est
#: RECOPIÉ À LA MAIN depuis un email, souvent sur un téléphone.
_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
_PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_PASSWORD_DIGITS = "23456789"
_PASSWORD_GROUPS = 4
_PASSWORD_GROUP_SIZE = 3


def generate_temp_password() -> str:
    """
    Mot de passe temporaire lisible, CONFORME à la politique de la plateforme.

    Format : 4 groupes de 3 caractères séparés par des tirets — Ax3-Kp7-Zm2-Qr9.

    ⚠️ La majuscule et le chiffre sont garantis PAR CONSTRUCTION, pas espérés du
    tirage. L'ancienne version piochait chaque caractère dans l'alphabet entier :
    mesuré sur 20 000 tirages, **15,4 % des mots de passe ne contenaient aucun
    chiffre** et 0,1 % aucune majuscule. Or `validate_password_strength` en exige
    un de chaque — un compte sur six recevait donc un mot de passe que la
    plateforme elle-même aurait refusé s'il avait voulu le CHOISIR. La connexion
    marchait (le login ne revalide pas la politique), donc rien ne le signalait.

    Le paramètre `length` a aussi disparu : il était déclaré, documenté, et
    totalement ignoré — la longueur venait des constantes ci-dessus.
    """
    taille = _PASSWORD_GROUPS * _PASSWORD_GROUP_SIZE
    # On impose d'abord les deux caractères requis, on complète, puis on mélange :
    # sans le mélange, la majuscule serait toujours en tête et le chiffre en
    # deuxième position — un motif qui s'apprend.
    caracteres = [
        secrets.choice(_PASSWORD_UPPER),
        secrets.choice(_PASSWORD_DIGITS),
    ]
    caracteres += [secrets.choice(_PASSWORD_ALPHABET) for _ in range(taille - 2)]
    # Mélange de Fisher-Yates avec `secrets` — `random.shuffle` n'est pas sûr
    # pour un secret, et `secrets` n'expose pas de shuffle.
    for i in range(len(caracteres) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        caracteres[i], caracteres[j] = caracteres[j], caracteres[i]

    return "-".join(
        "".join(caracteres[i : i + _PASSWORD_GROUP_SIZE])
        for i in range(0, taille, _PASSWORD_GROUP_SIZE)
    )

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
