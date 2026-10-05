"""
Script de seed — crée le PREMIER superadmin.
Usage : python -m app.core.seed   (joué à chaque démarrage par l'entrypoint)
"""
import asyncio
import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.models import User, UserRole  # registre central des modèles
from app.modules.auth.security import hash_password, verify_password

logger = logging.getLogger(__name__)

#: Mot de passe du gabarit — publié dans le dépôt, donc connu de tous.
DEFAULT_PASSWORD = "Geek-Ot@ku#2002"


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        # ⚠️ Idempotent sur l'EXISTENCE D'UN SUPERADMIN, pas sur son email.
        #
        # Le test portait sur `User.email == <constante>`, et l'entrypoint
        # rejoue ce script à CHAQUE démarrage : renommer le compte en base
        # créait donc un SECOND superadmin au redémarrage suivant, et changer
        # la constante en créait un autre encore. Le compte le plus privilégié
        # de la plateforme se dupliquait silencieusement à chaque tentative de
        # correction — ce qui rendait tout renommage piégé par construction.
        #
        # Le rôle de ce script est d'amorcer une installation VIERGE. Dès
        # qu'un superadmin existe, quel que soit son email, il n'a plus rien à
        # faire.
        existing = await db.scalar(
            select(User).where(User.role == UserRole.SUPERADMIN).limit(1)
        )
        if existing:
            print(f"→ Superadmin déjà présent : {existing.email}")
            _warn_if_default_password(existing)
            return

        superadmin = User(
            email=settings.superadmin_email,
            hashed_password=hash_password(settings.superadmin_password),
            role=UserRole.SUPERADMIN,
            first_name="Super",
            last_name="Admin",
        )
        db.add(superadmin)
        await db.commit()
        print(f"✓ Superadmin créé : {superadmin.email}")
        _warn_if_default_password(superadmin)


def _warn_if_default_password(user: User) -> None:
    """Crie si le compte le plus privilégié garde le mot de passe du dépôt.

    ⚠️ Ce mot de passe est écrit dans le gabarit et dans la documentation :
    quiconque a lu le dépôt peut ouvrir une session superadmin. Le contrôle
    vit ICI parce que seul le seed a déjà une session ouverte au démarrage —
    l'ajouter au `lifespan` coûterait une requête à chaque lancement.

    Un avertissement, jamais un refus : verrouiller l'accès au démarrage
    transformerait un risque en panne certaine.
    """
    if verify_password(DEFAULT_PASSWORD, user.hashed_password):
        message = (
            f"Le superadmin {user.email} utilise encore le mot de passe du "
            "dépôt, qui est PUBLIC. Changez-le depuis l'interface."
        )
        print(f"⚠️  {message}")
        logger.warning(message)


if __name__ == "__main__":
    asyncio.run(seed())
