from fastapi import APIRouter, Depends, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginRequest, TokenResponse, RefreshRequest, LogoutRequest,
    UserCreateRequest, UserResponse,
    PasswordResetRequest, PasswordResetConfirm,
    PasswordChangeRequest,
)
from app.modules.auth.dependencies import get_current_user, require_roles
from app.modules.auth.models import User, UserRole

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    # request.client.host : IP directe. Derrière un reverse proxy (nginx,
    # load balancer), remplacer par le premier maillon de confiance de
    # X-Forwarded-For — non applicable au déploiement Docker actuel
    # (backend exposé directement, cf. docker-compose.yml).
    client_ip = request.client.host if request.client else "unknown"
    return await service.login(payload, db, client_ip)

@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    return await service.refresh_tokens(payload.refresh_token, db)

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: LogoutRequest,
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
) -> None:
    """Révoque le token d'accès courant et le refresh token fourni."""
    await service.logout(credentials.credentials, payload.refresh_token)


@router.get("/me", response_model=UserResponse)
async def me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return UserResponse.model_validate(current_user)

@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    payload: UserCreateRequest,
    db: AsyncSession = Depends(get_db),
    creator: User = Depends(
        require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)
    ),
) -> UserResponse:
    return await service.create_user(payload, creator, db)

@router.post("/password-reset", status_code=status.HTTP_204_NO_CONTENT)
async def request_reset(
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.request_password_reset(payload, db)

@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_reset(
    payload: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.confirm_password_reset(payload, db)


@router.post("/password-change", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    await service.change_password(payload, current_user, db)
