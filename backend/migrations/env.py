import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

from app.core.config import settings
from app.core.models import Base  # importe tous les modèles (registre central)

config = context.config
config.set_main_option("sqlalchemy.url", str(settings.database_url))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    # version_table_schema : sans ça, Alembic cherche "alembic_version" sans
    # préfixe de schéma. Dans le schéma de test (vide, tout juste créé), ce
    # nom non qualifié retombe via le search_path sur "public.alembic_version"
    # (déjà à "head" côté dev) — Alembic conclut alors "rien à migrer" et ne
    # crée AUCUNE table dans le schéma de test, qui reste vide. Toute requête
    # non qualifiée retombe ensuite silencieusement sur "public", et les tests
    # finissent par lire/écrire la vraie base de dev. En forçant explicitement
    # le schéma de la table de version, Alembic la cherche (et la crée) au bon
    # endroit, constate "rien migré" à raison, et migre pour de vrai.
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=settings.db_schema,
        include_schemas=bool(settings.db_schema),
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # db_schema n'est jamais défini en dev/prod (cf. config.py) — connect_args
    # reste vide, comportement inchangé. Utilisé uniquement par les tests pour
    # isoler alembic_version + les tables migrées dans un schéma dédié.
    connect_args = (
        {"server_settings": {"search_path": f"{settings.db_schema},public"}}
        if settings.db_schema
        else {}
    )
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
