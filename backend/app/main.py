import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine
from app.core.i18n import resolve_accept_language, set_request_locale
from app.core.models import Base  # noqa: F401 — registre central : cet import
# enregistre TOUS les modèles avant la première résolution de mapper. `Base`
# n'est pas lu ici, et le retirer casserait les relations au runtime.
from app.core.redis import close_redis, redis_client
from app.api.v1.router import api_router


logger = logging.getLogger(__name__)


def _warn_dormant_features() -> None:
    """Annonce au démarrage les fonctionnalités ÉTEINTES faute de configuration.

    ⚠️ Deux variables seulement sont obligatoires (`DATABASE_URL`,
    `SECRET_KEY`) ; les quarante-six autres ont un défaut. Le backend démarre
    donc parfaitement avec une fonctionnalité entière hors service, et ne le
    dit nulle part.

    Ce n'est pas théorique : les clés VAPID n'ont jamais été posées en
    production, donc **aucune notification push n'est jamais partie** — ni
    « rapport validé », ni « nouveau message ». L'envoi étant best-effort,
    l'échec est journalisé au fond du module et n'atteint jamais un écran.
    Personne ne pouvait le savoir sans interroger l'API à la main.

    Même raisonnement que l'avertissement `pillow-heif` de `media.py` : une
    dégradation choisie se dit, une dégradation subie se découvre trop tard.
    Un avertissement, jamais une erreur — ces fonctionnalités sont facultatives
    et refuser de démarrer serait une bien pire panne.
    """
    if not (settings.vapid_private_key and settings.vapid_public_key):
        logger.warning(
            "VAPID non configuré : AUCUNE notification push ne partira "
            "(rapports, messagerie, diffusions). Générer les clés avec "
            "`python scripts/generate_vapid_keys.py`, puis les poser dans "
            "backend/.env."
        )
    if not settings.translation_active:
        detail = (
            "TRANSLATION_ENABLED est faux"
            if not settings.translation_enabled
            else f"moteur « {settings.translation_provider} » sans clé ni URL"
        )
        logger.warning(
            "Traduction automatique inactive (%s) : blog, menus, rapports et "
            "diffusions resteront en français pour les lecteurs anglophones.",
            detail,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Le schéma est géré exclusivement par Alembic (alembic upgrade head).
    # Pas de create_all ici : deux sources de vérité divergeraient.
    _warn_dormant_features()
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

@app.middleware("http")
async def resolve_locale(request, call_next):
    """Pose la langue de la requête à partir de l'en-tête `Accept-Language`.

    C'est le repli : dès qu'un utilisateur est authentifié,
    `get_current_user` la remplace par `users.locale`, son choix explicite.
    Les endpoints publics (site vitrine, blog) n'ont que cet en-tête.
    """
    set_request_locale(resolve_accept_language(request.headers.get("accept-language")))
    return await call_next(request)


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
