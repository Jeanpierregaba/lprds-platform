"""Matricule staff : <CODE ÉTABLISSEMENT>-<3 caractères alphanumériques>."""

import secrets

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User

_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
_SUFFIX_LENGTH = 3
_MAX_ATTEMPTS = 20


def build_matricule(establishment_code: str) -> str:
    suffix = "".join(secrets.choice(_ALPHABET) for _ in range(_SUFFIX_LENGTH))
    return f"{establishment_code}-{suffix}"


async def generate_unique_staff_matricule(
    establishment_code: str,
    db: AsyncSession,
) -> str:
    """
    36³ = 46 656 combinaisons par établissement — bien moins que pour les enfants
    (5 caractères), donc plus de tentatives avant d'abandonner. La contrainte
    UNIQUE sur users.matricule reste le garde-fou final.
    """
    for _ in range(_MAX_ATTEMPTS):
        matricule = build_matricule(establishment_code)
        taken = await db.scalar(select(User.id).where(User.matricule == matricule))
        if not taken:
            return matricule

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=(
            "Impossible de générer un matricule unique après "
            f"{_MAX_ATTEMPTS} tentatives"
        ),
    )
