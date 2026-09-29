"""Génération des matricules enfants : <CODE ÉTABLISSEMENT>-<5 alphanum>."""

import secrets
from app.core.i18n import t

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.children.models import Child

# Majuscules + chiffres, conformément au format demandé (ex: LPRDS-M87D1)
_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
_SUFFIX_LENGTH = 5
_MAX_ATTEMPTS = 10


def build_matricule(establishment_code: str) -> str:
    suffix = "".join(secrets.choice(_ALPHABET) for _ in range(_SUFFIX_LENGTH))
    return f"{establishment_code}-{suffix}"


async def generate_unique_matricule(
    establishment_code: str,
    db: AsyncSession,
) -> str:
    """
    Tire un matricule au hasard et vérifie qu'il est libre.

    36^5 ≈ 60 millions de combinaisons par établissement : une collision est
    très improbable, mais on retente au lieu de la subir. La contrainte UNIQUE
    en base reste le garde-fou final en cas de course entre deux requêtes.
    """
    for _ in range(_MAX_ATTEMPTS):
        matricule = build_matricule(establishment_code)
        taken = await db.scalar(
            select(Child.id).where(Child.matricule == matricule)
        )
        if not taken:
            return matricule

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=t("errors.common.matricule_failed", attempts=_MAX_ATTEMPTS),
    )
