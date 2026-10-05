"""Le seed du superadmin ne doit jamais DUPLIQUER le compte.

⚠️ Il s'identifiait par EMAIL (`User.email == <constante>`), et l'entrypoint le
rejoue à CHAQUE démarrage du backend. Renommer le compte en base créait donc un
SECOND superadmin au redémarrage suivant, et changer la constante en créait un
autre encore : le compte le plus privilégié de la plateforme se dupliquait
silencieusement à chaque tentative de correction, ce qui rendait tout renommage
piégé par construction.

Son rôle est d'amorcer une installation VIERGE : dès qu'un superadmin existe,
quel que soit son email, il n'a plus rien à faire.
"""

import asyncio
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.seed import seed
from tests.helpers import ck

SCHEMA = settings.db_schema


async def _superadmins() -> list[str]:
    """Emails des superadmins, lus hors ORM pour ne rien supposer du mapper."""
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            rows = await conn.execute(
                text(f"SELECT email FROM \"{SCHEMA}\".users WHERE role = 'superadmin'")
            )
            return sorted(r[0] for r in rows)
    finally:
        await engine.dispose()


async def _rename(nouvel_email: str) -> None:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            await conn.execute(
                text(f"UPDATE \"{SCHEMA}\".users SET email = :e WHERE role = 'superadmin'"),
                {"e": nouvel_email},
            )
            await conn.commit()
    finally:
        await engine.dispose()


def test_seed_ne_duplique_pas_un_superadmin_renomme():
    async def scenario():
        # Le harnais a déjà posé le superadmin du gabarit.
        depart = await _superadmins()
        ck("au départ : un seul superadmin", len(depart), 1)

        # Relance nominale — déjà vraie avant la correction.
        await seed()
        ck("relance sans changement : toujours un seul", len(await _superadmins()), 1)

        # LE CAS QUI PIÉGEAIT : le compte est renommé en base (c'est ce que fait
        # le runbook), puis le backend redémarre et rejoue le seed.
        renomme = f"tech-{uuid.uuid4().hex[:6]}@lespetitsrayonsdesoleil.net"
        await _rename(renomme)
        await seed()

        apres = await _superadmins()
        ck("après renommage puis redémarrage : toujours UN seul", len(apres), 1)
        ck("et c'est bien le compte renommé", apres, [renomme])

    asyncio.run(scenario())
