from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App
    app_name: str = "LPRDS Backend"
    app_env: str = "development"
    debug: bool = True

    # Base de données
    database_url: str
    database_pool_size: int = 10
    database_max_overflow: int = 20
    # Schéma Postgres à utiliser (search_path) — None = comportement par
    # défaut (public). Utilisé UNIQUEMENT par la suite de tests (cf.
    # tests/conftest.py) pour isoler les données de test dans un schéma dédié
    # de la même base, sans droit CREATEDB requis. Ne jamais définir en
    # dev/prod.
    db_schema: str | None = None

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # Reset mot de passe
    reset_token_expire_minutes: int = 60
    frontend_url: str = "http://localhost:3000"

    # Anti brute-force sur /auth/login — cf. app/core/rate_limit.py.
    # Compté par (IP, email), remis à zéro sur connexion réussie.
    login_rate_limit_max_attempts: int = 5
    login_rate_limit_window_seconds: int = 300

    # CORS — origines supplémentaires, séparées par des virgules.
    # frontend_url est toujours autorisée (cf. cors_origins).
    cors_extra_origins: str = ""

    @property
    def cors_origins(self) -> list[str]:
        extra = [o.strip() for o in self.cors_extra_origins.split(",") if o.strip()]
        return [self.frontend_url, *extra]

    # Email
    mail_username: str = ""
    mail_password: str = ""
    mail_from: str = "noreply@lprds.com"
    mail_from_name: str = "LPRDS"
    mail_port: int = 587
    mail_server: str = "sandbox.smtp.mailtrap.io"
    mail_starttls: bool = True
    mail_ssl_tls: bool = False
    # Dev/test : n'établit aucune connexion SMTP, les emails sont ignorés.
    # À laisser à False en production.
    mail_suppress_send: bool = False

    # Stockage fichiers
    storage_backend: str = "local"
    storage_local_path: str = "./media"

    # Pièces jointes (module messagerie)
    messaging_max_attachment_mb: int = 10
    messaging_allowed_attachment_types: str = (
        "image/jpeg,image/png,image/gif,image/webp,application/pdf"
    )

    @property
    def messaging_allowed_attachment_types_set(self) -> set[str]:
        return {
            t.strip()
            for t in self.messaging_allowed_attachment_types.split(",")
            if t.strip()
        }

    # Pièces jointes (module rapports) — plafond plus élevé que la messagerie
    # car les rapports acceptent aussi la vidéo.
    reports_max_attachment_mb: int = 50
    reports_allowed_attachment_types: str = (
        "image/jpeg,image/png,image/gif,image/webp,"
        "video/mp4,video/quicktime,video/webm"
    )

    @property
    def reports_allowed_attachment_types_set(self) -> set[str]:
        return {
            t.strip()
            for t in self.reports_allowed_attachment_types.split(",")
            if t.strip()
        }

    # Pièces jointes (module blog) — médias de la galerie d'un article
    # (image/vidéo, même plafond que les rapports). L'image à la une utilise
    # ce même ensemble filtré aux seuls types "image/*" (cf. blog/service.py).
    blog_max_attachment_mb: int = 50
    blog_allowed_attachment_types: str = (
        "image/jpeg,image/png,image/gif,image/webp,"
        "video/mp4,video/quicktime,video/webm"
    )

    @property
    def blog_allowed_attachment_types_set(self) -> set[str]:
        return {
            t.strip()
            for t in self.blog_allowed_attachment_types.split(",")
            if t.strip()
        }

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
