from contextlib import asynccontextmanager
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine
from app.core.models import Base  # importe tous les modèles (registre central)
from app.core.redis import close_redis, redis_client
from app.api.v1.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Le schéma est géré exclusivement par Alembic (alembic upgrade head).
    # Pas de create_all ici : deux sources de vérité divergeraient.
    yield
    await engine.dispose()
    await close_redis()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health/live", tags=["health"])
async def liveness():
    """Le process répond — ne dit rien de ses dépendances (cf. /health/ready)."""
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
async def readiness():
    """
    Vérifie les dépendances réellement nécessaires pour servir une requête
    (DB + Redis) — jamais un simple stub, sinon un load balancer/orchestrateur
    continuerait de router du trafic vers une instance dont la base ou Redis
    est injoignable.
    """
    checks: dict[str, str] = {}

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"

    try:
        await redis_client.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    healthy = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "ready" if healthy else "not_ready", "checks": checks},
    )
