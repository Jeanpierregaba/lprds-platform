"""
Infrastructure des tests E2E — un vrai serveur uvicorn (thread dédié) servant
la même app FastAPI que la prod, tapé en HTTP par un client httpx synchrone :
exactement la méthode utilisée manuellement pendant tout le développement de
ce projet (cf. claude.md), simplement rejouée automatiquement par pytest.

Isolation : les tests tournent dans un SCHÉMA Postgres dédié (`db_schema`,
cf. app/core/config.py) de la MÊME base que le dev — pas une base séparée,
faute de droit CREATEDB disponible dans cet environnement. Le schéma est créé
au démarrage de la session, migré via Alembic, vidé + reseedé avant CHAQUE
test, et supprimé en fin de session. La base de dev n'est JAMAIS touchée : la
seule opération destructive (TRUNCATE) s'exécute dans une connexion dont le
search_path pointe exclusivement vers le schéma de test.

Idem côté Redis : les tests basculent sur un INDEX de base Redis dédié
(15, jamais le 0 utilisé en dev — révocation de tokens, anti brute-force
login) et le FLUSHDB avant chaque test. Sans cette isolation, un compteur de
rate-limit ou un token révoqué posé par un test polluerait soit la session
dev, soit le test suivant (les clés Redis ne sont pas scopées par schéma
comme les tables Postgres).
"""

import os
import socket
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import httpx
import pytest
from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env")

# Doit être défini AVANT tout import de app.* (Settings est un singleton
# construit à l'import de app.core.config) — un nom fixe suffit : un seul
# run pytest à la fois par environnement de dev, pas besoin d'aléatoire.
os.environ["DB_SCHEMA"] = "pytest"
# Jamais de vrai envoi SMTP pendant les tests, même si le .env local a de
# vraies identifiants (sandbox Mailtrap) — pas de dépendance réseau externe
# flaky dans la suite.
os.environ["MAIL_SUPPRESS_SEND"] = "true"
# DEBUG=true active l'echo SQLAlchemy (tout le SQL exécuté) — bruit inutile
# pour la sortie des tests, où seules les assertions comptent.
os.environ["DEBUG"] = "false"


def _test_redis_url() -> str:
    base = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    parts = urlsplit(base)
    return urlunsplit(parts._replace(path="/15"))


# Index Redis dédié aux tests (jamais le 0, utilisé en dev) — cf. docstring.
os.environ["REDIS_URL"] = _test_redis_url()

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.config import settings  # noqa: E402

TEST_SCHEMA = settings.db_schema
assert TEST_SCHEMA, "DB_SCHEMA doit être défini avant l'import de app.core.config"


def _schema_engine():
    """Moteur jetable, jamais partagé entre deux appels — évite tout risque
    de connexion asyncpg recyclée d'une boucle asyncio fermée à une autre
    (chaque fixture appelle asyncio.run() indépendamment)."""
    return create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": f"{TEST_SCHEMA},public"}},
    )


async def _create_schema() -> None:
    # CREATE SCHEMA lui-même doit passer par une connexion neutre (search_path
    # par défaut) : le schéma n'existe pas encore, on ne peut pas s'y projeter.
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{TEST_SCHEMA}"'))
            await conn.commit()
    finally:
        await engine.dispose()


async def _drop_schema() -> None:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE'))
            await conn.commit()
    finally:
        await engine.dispose()


async def _reset_data() -> None:
    """Repart d'une base vierge (seed superadmin uniquement) avant chaque
    test — même discipline que les scripts E2E manuels de ce projet."""
    import uuid

    from app.modules.auth.security import hash_password

    # Noms de table qualifiés explicitement par le schéma de test (plutôt que
    # de compter sur le search_path) : filet de sécurité absolu contre toute
    # résolution accidentelle vers "public" (le schéma du dev) — cf. incident
    # où des enregistrements réels ont été écrasés par les données de test.
    engine = _schema_engine()
    try:
        async with engine.connect() as conn:
            await conn.execute(text(f'TRUNCATE TABLE "{TEST_SCHEMA}".establishments CASCADE'))
            await conn.execute(
                text(
                    f'INSERT INTO "{TEST_SCHEMA}".users '
                    "(id, email, hashed_password, role, first_name, last_name, "
                    " is_active, must_change_pwd) "
                    "VALUES (:id, :email, :hashed, 'superadmin', "
                    " 'Super', 'Admin', true, false) "
                    "ON CONFLICT (email) DO NOTHING"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "email": "tech@lespetitsrayonsdesoleil.fr",
                    "hashed": hash_password("Geek-Ot@ku#2002"),
                },
            )
            await conn.commit()
    finally:
        await engine.dispose()

    await _flush_redis()


async def _flush_redis() -> None:
    """Vide l'index Redis dédié aux tests (15, jamais le 0 du dev) — sans
    ça, un compteur de rate-limit ou un token révoqué posé par un test
    contaminerait le suivant (les clés Redis ne sont pas scopées par test
    comme les tables Postgres le sont par schéma)."""
    import redis.asyncio as aioredis

    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await client.flushdb()
    finally:
        await client.aclose()


def _run(coro_factory) -> None:
    import asyncio

    asyncio.run(coro_factory())


@pytest.fixture(scope="session", autouse=True)
def _migrated_test_schema():
    if TEST_SCHEMA in {"public", ""}:
        raise RuntimeError(
            f"DB_SCHEMA={TEST_SCHEMA!r} refusé — la suite de tests ne doit "
            "jamais tourner dans le schéma public (celui du dev)."
        )
    _run(_create_schema)

    alembic_cfg = Config(str(_REPO_ROOT / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")

    yield

    _run(_drop_schema)


@pytest.fixture(autouse=True)
def _clean_database(_migrated_test_schema):
    _run(_reset_data)
    yield


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def live_server(_migrated_test_schema):
    """Démarre l'app FastAPI dans un vrai uvicorn (thread dédié, une seule
    fois pour toute la session) — les tests tapent dessus en HTTP."""
    import uvicorn

    from app.main import app

    port = _free_port()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    base = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            httpx.get(f"{base}/health/live", timeout=0.5)
            break
        except httpx.TransportError:
            time.sleep(0.1)
    else:
        raise RuntimeError("Le serveur de test n'a pas démarré à temps")

    yield base  # racine, sans /api/v1 — cf. fixtures client/root_client ci-dessous

    server.should_exit = True
    thread.join(timeout=5)


@pytest.fixture
def client(live_server):
    """Client scopé /api/v1 — utilisé par l'immense majorité des tests."""
    with httpx.Client(base_url=f"{live_server}/api/v1", timeout=30) as c:
        yield c


@pytest.fixture
def root_client(live_server):
    """Client à la racine (hors /api/v1) — pour /health/* uniquement."""
    with httpx.Client(base_url=live_server, timeout=30) as c:
        yield c
