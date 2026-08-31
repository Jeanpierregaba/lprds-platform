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
from app.modules.attendance.models import PersonType


def _fernet() -> Fernet:
    # Fernet exige une clé de 32 octets encodée en base64 urlsafe. On la dérive
    # de SECRET_KEY (sha256) pour ne pas introduire de nouvelle variable d'env.
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode()).digest())
    return Fernet(key)


def encrypt_qr_payload(person_type: PersonType, person_id: uuid.UUID) -> str:
    """Jeton opaque, sans expiration (le badge doit rester valide au long cours)."""
    data = json.dumps({"t": str(person_type), "id": str(person_id)}).encode()
    return _fernet().encrypt(data).decode()


def decrypt_qr_payload(token: str) -> tuple[PersonType, uuid.UUID]:
    try:
        data = _fernet().decrypt(token.encode())
        payload = json.loads(data)
        return PersonType(payload["t"]), uuid.UUID(payload["id"])
    except (InvalidToken, ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Code QR invalide",
        ) from exc


def render_qr_image(payload: str) -> str:
    """PNG encodé en data URI base64 — prêt à être affiché ou imprimé tel quel."""
    img = qrcode.make(payload)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{encoded}"
