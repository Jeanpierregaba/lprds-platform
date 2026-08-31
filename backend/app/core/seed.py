"""
Script de seed — crée le premier superadmin.
Usage : python -m app.core.seed
"""
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.models import User, UserRole  # registre central des modèles
from app.modules.auth.security import hash_password


SUPERADMIN_EMAIL = "tech@lespetitsrayonsdesoleil.fr"


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        # Idempotent : le script doit pouvoir être relancé sans planter
        existing = await db.scalar(
            select(User).where(User.email == SUPERADMIN_EMAIL)
        )
        if existing:
            print(f"→ Superadmin déjà présent : {SUPERADMIN_EMAIL}")
            return

        superadmin = User(
            email=SUPERADMIN_EMAIL,
            hashed_password=hash_password("Geek-Ot@ku#2002"),
            role=UserRole.SUPERADMIN,
            first_name="Super",
            last_name="Admin",
            must_change_pwd=False,
        )
        db.add(superadmin)
        await db.commit()
        print(f"✓ Superadmin créé : {superadmin.email}")


if __name__ == "__main__":
    asyncio.run(seed())
