"""
QR codes du module présences — chiffrement du contenu + génération d'image.

Les QR sont imprimés sur des cartes/badges et présentés physiquement au scan
(arrivée, départ). Le contenu est CHIFFRÉ (pas seulement signé) : un tiers qui
scannerait le badge avec une application quelconque ne doit rien pouvoir en
tirer. Le payload n'encode d'ailleurs jamais le matricule — seulement un
identifiant interne opaque, inutilisable sans accès à l'API authentifiée.
"""

import base64
import hashlib
import json
import uuid
from io import BytesIO

import qrcode
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.i18n import t
from app.modules.attendance.models import PersonType


def _fernet_for(secret: str) -> Fernet:
    # Fernet exige une clé de 32 octets encodée en base64 urlsafe. On la dérive
    # de SECRET_KEY (sha256) pour ne pas introduire de nouvelle variable d'env.
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def _candidate_fernets() -> list[Fernet]:
    """Clé courante d'abord, précédente ensuite (période de grâce) — une
    rotation de SECRET_KEY n'invalide plus tous les badges d'un coup : les
    anciens jetons restent lisibles tant que QR_KEY_PREVIOUS est renseignée."""
    fernets = [_fernet_for(settings.secret_key)]
    previous = (settings.qr_key_previous or "").strip()
    if previous and previous != settings.secret_key:
        fernets.append(_fernet_for(previous))
    return fernets


# Version du format de jeton, préfixée en clair (`v1:<fernet>`) — les anciens
# jetons sans préfixe restent acceptés. Une future rotation de format
# ajoutera une version sans casser la lecture des badges existants.
QR_KEY_VERSION = "v1"


def encrypt_qr_payload(person_type: PersonType, person_id: uuid.UUID) -> str:
    """Jeton opaque, sans expiration (le badge doit rester valide au long cours)."""
    data = json.dumps({"t": str(person_type), "id": str(person_id)}).encode()
    return f"{QR_KEY_VERSION}:{_fernet_for(settings.secret_key).encrypt(data).decode()}"


def decrypt_qr_payload(token: str) -> tuple[PersonType, uuid.UUID]:
    raw = token.split(":", 1)[-1] if ":" in token else token
    for fernet in _candidate_fernets():
        try:
            data = fernet.decrypt(raw.encode())
            payload = json.loads(data)
            return PersonType(payload["t"]), uuid.UUID(payload["id"])
        except (InvalidToken, ValueError, KeyError, json.JSONDecodeError):
            continue
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=t("errors.attendance.invalid_qr"),
    )


def render_qr_image(payload: str) -> str:
    """PNG encodé en data URI base64 — prêt à être affiché ou imprimé tel quel."""
    img = qrcode.make(payload)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{encoded}"
