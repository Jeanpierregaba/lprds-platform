from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from app.core.config import settings

# db_schema n'est jamais défini en dev/prod (cf. config.py) — connect_args
# reste vide, comportement strictement inchangé pour l'application réelle.
_connect_args = (
    {"server_settings": {"search_path": f"{settings.db_schema},public"}}
    if settings.db_schema
    else {}
)

# Sous tests (db_schema défini), pool de connexions réutilisées désactivé :
# une connexion asyncpg pré-établie (donc dont search_path a été négocié à
# l'ouverture) peut se retrouver recyclée depuis une autre boucle asyncio que
# celle qui l'a créée (conftest.py alterne plusieurs asyncio.run() distincts
# autour du même serveur de test) — ce recyclage cross-loop peut corrompre
# la session et, dans certains cas, faire retomber la résolution des noms de
# table non qualifiés sur le schéma "public" (celui du dev), écrasant de
# vraies données. NullPool force une connexion fraîche à chaque usage — pas
# de risque de perf ici (un seul client de test à la fois).
_poolclass = NullPool if settings.db_schema else None
_pool_kwargs = (
    {"poolclass": NullPool}
    if _poolclass
    else {"pool_size": settings.database_pool_size, "max_overflow": settings.database_max_overflow}
)

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=settings.debug,
    connect_args=_connect_args,
    **_pool_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
