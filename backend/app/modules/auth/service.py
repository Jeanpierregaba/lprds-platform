import logging
import uuid
from fastapi import HTTPException, status
from jwt.exceptions import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.core import rate_limit
from app.core.config import settings
from app.core.i18n import coerce_locale, t
from app.modules.auth.models import User, UserRole
from app.modules.auth.schemas import (
    LoginRequest, TokenResponse,
    UserCreateRequest, UserResponse,
    PasswordResetRequest, PasswordResetConfirm,
    PasswordChangeRequest,
)
from app.modules.auth.security import (
    hash_password, verify_password,
    create_token, decode_token,
    generate_temp_password,
    generate_reset_token, verify_reset_token,
    revoke_token, is_token_revoked,
)
from app.modules.auth.email import (
    send_welcome_email, send_reset_email, EmailDeliveryError,
)

# ── Login ───────────────────────────────────────────────────────
async def login(
    payload: LoginRequest,
    db: AsyncSession,
    client_ip: str,
) -> TokenResponse:
    # Anti brute-force : compté par (IP, email), avant toute vérification de
    # mot de passe — sinon la vérification bcrypt elle-même (volontairement
    # coûteuse) reste exploitable comme oracle de timing/charge.
    rl_key = f"login_attempts:{client_ip}:{payload.email.lower()}"
    await rate_limit.check_and_increment(
        rl_key,
        max_attempts=settings.login_rate_limit_max_attempts,
        window_seconds=settings.login_rate_limit_window_seconds,
    )

    user = await _get_user_by_email(payload.email, db)

    if not user or not verify_password(payload.password, user.hashed_password):
        # Message identique → pas d'énumération d'emails
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=t("errors.auth.invalid_credentials"),
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.auth.account_disabled"),
        )

    # Connexion réussie : on remet le compteur à zéro, jamais consommé par
    # les allers-retours légitimes d'un utilisateur qui tape juste du premier
    # coup.
    await rate_limit.reset(rl_key)

    # Mise à jour de la date de dernière connexion
    from datetime import datetime, timezone
    user.last_login_at = datetime.now(timezone.utc)
    await db.flush()

    user_id = str(user.id)
    return TokenResponse(
        access_token=create_token(user_id, user.role, "access"),
        refresh_token=create_token(user_id, user.role, "refresh"),
    )

# ── Refresh token ────────────────────────────────────────────────
async def refresh_tokens(
    refresh_token: str,
    db: AsyncSession,
) -> TokenResponse:
    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=t("errors.auth.invalid_refresh"),
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=t("errors.auth.wrong_token_type"),
        )

    if await is_token_revoked(payload):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=t("errors.auth.invalid_refresh"),
        )

    user = await _get_user_by_id(payload["sub"], db)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=t("errors.auth.user_not_found_or_inactive"),
        )

    # Rotation : le refresh consommé est révoqué, il ne peut plus resservir
    await revoke_token(payload)

    user_id = str(user.id)
    return TokenResponse(
        access_token=create_token(user_id, user.role, "access"),
        refresh_token=create_token(user_id, user.role, "refresh"),
    )

# ── Logout ──────────────────────────────────────────────────────
async def logout(access_token: str, refresh_token: str | None = None) -> None:
    """Révoque le token d'accès courant et, s'il est fourni, le refresh token."""
    await _revoke_if_valid(access_token)
    if refresh_token:
        await _revoke_if_valid(refresh_token)


async def _revoke_if_valid(token: str) -> None:
    try:
        payload = decode_token(token)
    except InvalidTokenError:
        return  # déjà expiré ou invalide : rien à révoquer
    await revoke_token(payload)

# ── Création de compte ───────────────────────────────────────────
async def create_user(
    payload: UserCreateRequest,
    creator: User,
    db: AsyncSession,
) -> UserResponse:
    # Règles d'autorisation
    _check_creation_permissions(creator, payload.role)

    # Email unique
    existing = await _get_user_by_email(payload.email, db)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.common.email_exists"),
        )

    temp_password = generate_temp_password()

    # Résolution de l'établissement selon le rôle créé et le créateur
    if payload.role == UserRole.SUPERADMIN:
        # Un superadmin n'est rattaché à aucun établissement
        establishment_id = None
    elif creator.role == UserRole.ADMIN:
        # Un admin ne peut créer que dans son propre établissement —
        # on ignore tout establishment_id fourni dans le payload
        if creator.establishment_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=t("errors.common.no_establishment"),
            )
        establishment_id = creator.establishment_id
    else:
        # Superadmin créant un admin/staff/parent : établissement libre
        establishment_id = payload.establishment_id

    # Quota d'admins par établissement — import local pour éviter un cycle
    # d'imports entre les modules auth et establishments.
    if payload.role == UserRole.ADMIN and establishment_id is not None:
        from app.modules.establishments.service import ensure_admin_quota

        await ensure_admin_quota(establishment_id, db)

    user = User(
        email=payload.email,
        hashed_password=hash_password(temp_password),
        role=payload.role,
        first_name=payload.first_name,
        last_name=payload.last_name,
        nickname=payload.nickname,
        phone=payload.phone,
        establishment_id=establishment_id,
    )
    db.add(user)
    await db.flush()  # génère l'ID sans commit

    # Email de bienvenue (sauf superadmin)
    if payload.role != UserRole.SUPERADMIN:
        estab_name = ""
        if user.establishment:
            estab_name = user.establishment.name
        try:
            await send_welcome_email(
                email=user.email,
                first_name=user.first_name,
                nickname=user.nickname,
                role=user.role,
                locale=coerce_locale(user.locale),
                temp_password=temp_password,
                establishment_name=estab_name,
            )
        except EmailDeliveryError as exc:
            # Le mot de passe temporaire n'existe que dans cet email : sans lui
            # le compte serait inutilisable. On échoue donc explicitement, et la
            # transaction est annulée par get_db (aucun compte orphelin).
            logger.exception("Échec d'envoi du mail de bienvenue à %s", user.email)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=t("errors.common.email_unavailable_account"),
            ) from exc

    return UserResponse.model_validate(user)

# ── Reset de mot de passe (public) ──────────────────────────────
async def request_password_reset(
    payload: PasswordResetRequest,
    db: AsyncSession,
    client_ip: str,
) -> None:
    # Deux bornes, décomptées AVANT la lecture en base — cf. le commentaire de
    # `password_reset_rate_limit_*` dans app/core/config.py. Les décompter
    # après, ou n'en poser qu'une sur l'email trouvé, ferait du 429 un signal
    # d'existence du compte et rouvrirait l'énumération que le 204 invariant
    # ferme.
    email_key = payload.email.strip().lower()
    await rate_limit.check_and_increment(
        f"pwreset_email:{email_key}",
        max_attempts=settings.password_reset_rate_limit_per_email,
        window_seconds=settings.password_reset_rate_limit_window_seconds,
    )
    await rate_limit.check_and_increment(
        f"pwreset_ip:{client_ip}",
        max_attempts=settings.password_reset_rate_limit_per_ip,
        window_seconds=settings.password_reset_rate_limit_window_seconds,
    )

    user = await _get_user_by_email(payload.email, db)
    # On répond toujours OK — pas d'énumération d'emails
    if user and user.is_active:
        token = generate_reset_token(user.email)
        try:
            await send_reset_email(
                email=user.email,
                first_name=user.first_name,
                locale=coerce_locale(user.locale),
                reset_token=token,
            )
        except EmailDeliveryError:
            # Surtout pas d'erreur remontée ici : un 503 sur email connu contre
            # un 204 sur email inconnu permettrait d'énumérer les comptes.
            # L'échec est journalisé côté serveur, la réponse reste identique.
            logger.exception("Échec d'envoi du mail de reset à %s", user.email)

async def confirm_password_reset(
    payload: PasswordResetConfirm,
    db: AsyncSession,
) -> None:
    email = verify_reset_token(payload.token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=t("errors.auth.invalid_link"),
        )
    user = await _get_user_by_email(email, db)
    if not user:
        raise HTTPException(status_code=404, detail=t("errors.auth.user_not_found"))

    user.hashed_password = hash_password(payload.new_password)
    await db.flush()


# ── Changement de mot de passe (connecté) ───────────────────────
async def change_password(
    payload: PasswordChangeRequest,
    current_user: User,
    db: AsyncSession,
) -> None:
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=t("errors.auth.wrong_current_password"),
        )
    current_user.hashed_password = hash_password(payload.new_password)
    await db.flush()


async def set_user_locale(db: AsyncSession, user: User, locale: str) -> User:
    """Enregistre la langue d'interface du compte.

    La valeur est déjà contrainte à "fr"/"en" par le schéma Pydantic — aucune
    validation à refaire ici. Pas de `db.refresh()` : l'appelant ne lit aucune
    relation chargée par une FK, seulement des colonnes scalaires déjà en
    mémoire (cf. claude.md § Performance).
    """
    user.locale = locale
    await db.flush()
    return user



# ── Relance d'invitation ────────────────────────────────────────

async def resend_invitation(
    user: User, db: AsyncSession, *, password: str | None = None
) -> None:
    """Renvoie l'email de bienvenue avec un mot de passe NEUF.

    Demandé par un établissement : des parents ne retrouvent pas l'email de
    création, ou affirment ne l'avoir jamais reçu.

    ⚠️ **Le mot de passe d'origine ne peut PAS être renvoyé.** Seule son
    empreinte bcrypt est conservée, et c'est une propriété voulue : si la
    plateforme pouvait le relire, une fuite de base livrerait tous les comptes
    parents en clair. La relance régénère donc un mot de passe conforme à la
    politique. Du point de vue du destinataire, c'est bien l'invitation qu'il
    n'avait pas : même adresse, même email, un mot de passe qui marche.

    ⚠️ **Un échec SMTP annule la régénération** (503 + rollback via `get_db`),
    exactement comme à la création. L'ordre inverse — changer le mot de passe
    puis ne pas réussir à l'annoncer — mettrait le destinataire DEHORS d'un
    compte auquel il avait peut-être encore accès. C'est le seul ordre sûr.

    ⚠️ Le geste vit ICI et non dans chaque module : parents et personnel
    partagent le flux (mot de passe temporaire + email de bienvenue), donc deux
    copies seraient deux occasions de corriger la politique d'échec à moitié.
    Chaque module reste responsable de sa propre résolution scopée (404
    inter-établissement) avant d'appeler.

    ⚠️ **Une temporisation par compte visé**
    (`invitation_resend_cooldown_seconds`) : le danger ici n'est pas l'abus —
    le geste exige `parents:write` / `staff:write` — mais le DOUBLE CLIC. La
    seconde relance régénère un mot de passe, donc PÉRIME le premier email,
    que le destinataire est peut-être en train de lire. Deux invitations dont
    la plus ancienne ne marche plus est le pire résultat possible pour un
    dépannage.
    """
    cooldown_key = f"invitation_resend:{user.id}"
    await rate_limit.check_and_increment(
        cooldown_key,
        max_attempts=1,
        window_seconds=settings.invitation_resend_cooldown_seconds,
        message_key="errors.auth.invitation_resend_too_soon",
    )

    # ⚠️ Un mot de passe FOURNI par l'admin n'est pas un confort : c'est la
    # seule façon pour lui de le transmettre AUTREMENT que par email. La
    # plateforme ne peut pas lui rendre celui qu'elle génère — il n'existe que
    # dans le message parti, et le retourner dans la réponse HTTP est
    # précisément ce que ce module refuse de faire. Or l'email est le canal qui
    # échoue (une adresse qu'un fournisseur écarte, une boîte abandonnée), et
    # c'est justement là qu'on a besoin de dicter les accès de vive voix ou de
    # les envoyer par messagerie.
    #
    # Rien d'autre ne change : même email de bienvenue, même politique d'échec,
    # même temporisation. Sans mot de passe fourni, le comportement d'origine
    # est inchangé — un généré, que personne ne relira.
    temp_password = password or generate_temp_password()
    user.hashed_password = hash_password(temp_password)
    await db.flush()

    try:
        await send_welcome_email(
            email=user.email,
            first_name=user.first_name,
            nickname=user.nickname,
            role=user.role,
            locale=coerce_locale(user.locale),
            temp_password=temp_password,
            establishment_name=user.establishment.name if user.establishment else "",
        )
    except EmailDeliveryError as exc:
        logger.exception("Échec de la relance d'invitation à %s", user.email)
        # Aucun email n'est parti et le mot de passe est annulé par le rollback :
        # la temporisation n'a plus rien à protéger, et laisser le verrou posé
        # interdirait de réessayer dès que le SMTP est revenu.
        await rate_limit.reset(cooldown_key)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=t("errors.common.email_unavailable_account"),
        ) from exc


# ── Helpers privés ───────────────────────────────────────────────
async def _get_user_by_email(email: str, db: AsyncSession) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def _get_user_by_id(user_id: str, db: AsyncSession) -> User | None:
    try:
        uid = uuid.UUID(user_id)
    except (ValueError, TypeError):
        return None  # sub malformé → traité comme utilisateur introuvable
    result = await db.execute(select(User).where(User.id == uid))
    return result.scalar_one_or_none()


def _check_creation_permissions(creator: User, target_role: UserRole) -> None:
    """Vérifie que le créateur a le droit de créer ce type de compte."""
    rules: dict[UserRole, set[UserRole]] = {
        UserRole.SUPERADMIN: {UserRole.SUPERADMIN, UserRole.ADMIN},
        UserRole.ADMIN:      {UserRole.STAFF, UserRole.PARENT},
    }
    allowed = rules.get(creator.role, set())
    if target_role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.auth.cannot_create_role", role=target_role),
        )
