from functools import lru_cache
from typing import Literal

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
    # Rotation des badges QR présences : renseigner ici l'ANCIENNE valeur de
    # SECRET_KEY le temps de réimprimer les badges — les anciens jetons
    # restent lisibles (période de grâce), les nouveaux utilisent la clé
    # courante. Vide = aucun support d'ancienne clé.
    qr_key_previous: str | None = None

    # Reset mot de passe
    reset_token_expire_minutes: int = 60
    frontend_url: str = "http://localhost:3000"

    # Notifications push Web (PWA Phase 2) — clés VAPID. Générer le couple via :
    #   docker compose exec backend python scripts/generate_vapid_keys.py
    # ⚠️ La commande vivait ICI en commentaire, et elle était FAUSSE
    # (`print(v)` affiche la représentation de l'objet). Jamais exécutée,
    # donc jamais démentie : les clés n'ont jamais été posées en
    # production et les notifications push n'y ont jamais fonctionné,
    # sans la moindre erreur visible — l'envoi est best-effort.
    # (ou py_vapid CLI). La clé publique est exposée aux clients via
    # GET /api/v1/notifications/vapid-public-key pour la souscription.
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_subject: str = "mailto:hello@lespetitsrayonsdesoleil.net"

    # Anti brute-force sur /auth/login — cf. app/core/rate_limit.py.
    # Compté par (IP, email), remis à zéro sur connexion réussie.
    login_rate_limit_max_attempts: int = 5
    login_rate_limit_window_seconds: int = 300

    # CORS — origines supplémentaires, séparées par des virgules.
    # frontend_url est toujours autorisée (cf. cors_origins).
    cors_extra_origins: str = ""

    @property
    def cors_origins(self) -> list[str]:
        configured = [
            self.frontend_url,
            *(o.strip() for o in self.cors_extra_origins.split(",") if o.strip()),
        ]
        seen: set[str] = set()
        origins: list[str] = []
        for origin in configured:
            for variant in self._origin_variants(origin):
                if variant and variant not in seen:
                    seen.add(variant)
                    origins.append(variant)
        return origins

    @staticmethod
    def _origin_variants(origin: str) -> list[str]:
        """Normalise une origine et ajoute son homologue www / sans-www.

        Le site est servi sur les deux (lespetitsrayonsdesoleil.net ET
        www.lespetitsrayonsdesoleil.net) ; un visiteur arrivé par l'un des
        deux peut donc faire un appel cross-origin depuis l'autre. Sans ce
        double enregistrement, le login échoue en CORS selon la forme de
        l'URL utilisée (cas réel observé en production sur Safari).
        """
        normalized = origin.strip().rstrip("/").lower()
        if not normalized:
            return []
        variants = {normalized}
        if "://" in normalized:
            scheme, host = normalized.split("://", 1)
            if host.startswith("www."):
                variants.add(f"{scheme}://{host[4:]}")
            else:
                variants.add(f"{scheme}://www.{host}")
        return sorted(variants)

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

    # Pièces jointes (module messagerie). Les messages privés acceptent les
    # images ET les vidéos ; les diffusions restent images + PDF. La vidéo a
    # son propre plafond (10 Mo par défaut = inutilisable pour une vidéo de
    # téléphone, d'où 50 Mo comme les rapports).
    # ⚠️ Il n'y a plus de LISTE BLANCHE de types pour ces trois modules.
    # Elles filtraient le MIME DÉCLARÉ par le navigateur — précisément ce qui
    # refusait une photo valide selon l'appareil qui l'envoyait. Le type est
    # désormais lu dans les octets (`app/core/media.py`), et la règle est
    # « une vraie image, une vraie vidéo, un vrai PDF là où il est admis ».
    #
    # Les trois champs sont CONSERVÉS mais ignorés, et sans leur propriété
    # `_set` : plus rien ne peut les lire par mégarde. Les supprimer aurait
    # empêché l'application de démarrer sur toute installation dont le `.env`
    # les porte encore (Pydantic refuse les clés inconnues) — casser un
    # déploiement pour retirer trois lignes mortes serait un mauvais échange.
    # Ils ont disparu de `.env.example` : une nouvelle installation n'en verra
    # jamais la trace, une ancienne peut les effacer quand elle veut.
    messaging_allowed_attachment_types: str = ""
    reports_allowed_attachment_types: str = ""
    blog_allowed_attachment_types: str = ""
    messaging_max_attachment_mb: int = 10
    messaging_max_video_mb: int = 50

    # Pièces jointes (module rapports) — plafond plus élevé que la messagerie
    # car les rapports acceptent aussi la vidéo.
    reports_max_attachment_mb: int = 50

    # Pièces jointes (module blog) — médias de la galerie d'un article
    # (image/vidéo, même plafond que les rapports). L'image à la une utilise
    # ce même ensemble filtré aux seuls types "image/*" (cf. blog/service.py).
    blog_max_attachment_mb: int = 50

    # Pièces jointes (module enfants) — documents du dossier d'inscription
    # (pièce d'identité, certificat médical, autorisations...). Images et PDF :
    # la vidéo n'a pas de sens pour un dossier.
    #
    # ⚠️ `CHILDREN_ALLOWED_ATTACHMENT_TYPES` ne gouverne plus rien, comme ses
    # trois sœurs : c'était la liste la plus stricte du projet (MIME exacts,
    # sans sur-ensemble `image/*`), donc celle qui refusait le plus — une photo
    # d'iPhone passait à la trappe même correctement nommée. Le champ reste
    # déclaré mais vide : le supprimer empêcherait de démarrer sur un `.env`
    # qui le porte encore.
    children_max_attachment_mb: int = 10
    children_allowed_attachment_types: str = ""

    # ── Traduction automatique du contenu saisi (blog, menus) ────
    # Désactivée par défaut, comme MAIL_SUPPRESS_SEND côté email : un dev qui
    # clone le repo ne doit pas appeler une API payante sans l'avoir décidé,
    # et la suite de tests ne doit dépendre ni du réseau ni d'une clé.
    translation_enabled: bool = False

    # Moteur de traduction : `anthropic` (Claude Haiku, payant, meilleure
    # qualité) ou `libretranslate` (open source, auto-hébergeable, gratuit).
    # Les deux respectent le même contrat ; changer de moteur ne demande que
    # cette variable.
    translation_provider: Literal["anthropic", "libretranslate"] = "anthropic"

    anthropic_api_key: str = ""
    translation_model: str = "claude-haiku-4-5"

    # Instance LibreTranslate — typiquement `http://libretranslate:5000` dans
    # le docker-compose du projet. Une instance auto-hébergée n'exige aucune
    # clé ; `libretranslate_api_key` ne sert qu'aux instances publiques.
    libretranslate_url: str = ""
    libretranslate_api_key: str = ""

    # Plafond au-delà duquel on n'attend plus la traduction dans la requête
    # HTTP : le statut reste `pending` et l'utilisateur relance depuis l'UI.
    translation_timeout_seconds: float = 20.0

    @property
    def translation_active(self) -> bool:
        """Traduction réellement appelable — le drapeau ET ce qu'exige le moteur.

        Sans ce couple, un `TRANSLATION_ENABLED=true` laissé dans un .env sans
        clé ferait échouer chaque publication d'article en `failed` au lieu de
        se comporter comme « traduction non configurée ».

        Chaque moteur a sa propre condition : une clé pour Anthropic, une URL
        d'instance pour LibreTranslate. Les confondre ferait croire la
        traduction active alors qu'elle ne peut pas aboutir.
        """
        if not self.translation_enabled:
            return False
        if self.translation_provider == "libretranslate":
            return bool(self.libretranslate_url)
        return bool(self.anthropic_api_key)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
