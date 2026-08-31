import uuid

from fastapi import APIRouter, Depends, File, Query, UploadFile, WebSocket, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.modules.auth.models import User, UserRole
from app.modules.messaging import service
from app.modules.messaging.dependencies import get_admin, get_admin_or_parent, get_parent
from app.modules.messaging.schemas import (
    AnnouncementCreateRequest,
    AnnouncementListResponse,
    AnnouncementResponse,
    AnnouncementUpdateRequest,
    AttachmentResponse,
    ConversationListResponse,
    ConversationResponse,
    MessageCreateRequest,
    MessageListResponse,
    MessageResponse,
)
from app.modules.messaging.ws_auth import WSAuthError, authenticate_ws
from app.modules.messaging.ws_manager import run_relay_until_disconnect

router = APIRouter(prefix="/messaging", tags=["messaging"])


# ── Diffusions (broadcast) ────────────────────────────────────────
@router.post(
    "/announcements",
    response_model=AnnouncementResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_announcement(
    payload: AnnouncementCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin),
) -> AnnouncementResponse:
    return await service.create_announcement(payload, admin.establishment_id, admin, db)


@router.get("/announcements", response_model=AnnouncementListResponse)
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_or_parent),
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> AnnouncementListResponse:
    return await service.list_announcements(
        current_user.establishment_id, current_user, db,
        include_inactive=include_inactive, skip=skip, limit=limit,
    )


@router.get("/announcements/{announcement_id}", response_model=AnnouncementResponse)
async def get_announcement(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_or_parent),
) -> AnnouncementResponse:
    return await service.get_announcement(
        announcement_id, current_user.establishment_id, current_user, db
    )


@router.patch("/announcements/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(
    announcement_id: uuid.UUID,
    payload: AnnouncementUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin),
) -> AnnouncementResponse:
    return await service.update_announcement(
        announcement_id, payload, admin.establishment_id, db
    )


@router.post(
    "/announcements/{announcement_id}/read", status_code=status.HTTP_204_NO_CONTENT
)
async def mark_announcement_read(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
) -> None:
    await service.mark_announcement_read(announcement_id, parent, db)


@router.post(
    "/announcements/{announcement_id}/attachments",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_announcement_attachment(
    announcement_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin),
) -> AttachmentResponse:
    return await service.add_announcement_attachment(
        announcement_id, admin.establishment_id, admin, file, db
    )


# ── Conversations : côté parent (toujours SA propre conversation) ─
@router.get("/conversations/me", response_model=ConversationResponse)
async def get_my_conversation(
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
) -> ConversationResponse:
    return await service.get_own_conversation_summary(parent, db)


@router.get("/conversations/me/messages", response_model=MessageListResponse)
async def list_my_messages(
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> MessageListResponse:
    conversation = await service.get_or_create_own_conversation(parent, db)
    return await service.list_messages(conversation, db, skip=skip, limit=limit)


@router.post(
    "/conversations/me/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_my_message(
    payload: MessageCreateRequest,
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
) -> MessageResponse:
    conversation = await service.get_or_create_own_conversation(parent, db)
    return await service.send_message(conversation, parent, payload.body, db)


@router.post("/conversations/me/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_my_conversation_read(
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
) -> None:
    conversation = await service.get_or_create_own_conversation(parent, db)
    await service.mark_conversation_read(conversation, UserRole.PARENT, db)


@router.post(
    "/conversations/me/messages/{message_id}/attachments",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_my_message_attachment(
    message_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    parent: User = Depends(get_parent),
) -> AttachmentResponse:
    conversation = await service.get_or_create_own_conversation(parent, db)
    return await service.add_message_attachment(conversation, message_id, parent, file, db)


# ── Conversations : côté admin (n'importe quel parent, par id) ────
@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ConversationListResponse:
    return await service.list_conversations(
        admin.establishment_id, db, skip=skip, limit=limit
    )


@router.get(
    "/conversations/{conversation_id}/messages", response_model=MessageListResponse
)
async def list_conversation_messages(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> MessageListResponse:
    conversation = await service.get_conversation_for_admin(
        conversation_id, admin.establishment_id, db
    )
    return await service.list_messages(conversation, db, skip=skip, limit=limit)


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_conversation_message(
    conversation_id: uuid.UUID,
    payload: MessageCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin),
) -> MessageResponse:
    """L'admin répond au nom de « l'administration » — n'importe quel admin
    de l'établissement peut répondre dans n'importe quelle conversation."""
    conversation = await service.get_conversation_for_admin(
        conversation_id, admin.establishment_id, db
    )
    return await service.send_message(conversation, admin, payload.body, db)


@router.post(
    "/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT
)
async def mark_conversation_read(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin),
) -> None:
    conversation = await service.get_conversation_for_admin(
        conversation_id, admin.establishment_id, db
    )
    await service.mark_conversation_read(conversation, UserRole.ADMIN, db)


@router.post(
    "/conversations/{conversation_id}/messages/{message_id}/attachments",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_conversation_attachment(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin),
) -> AttachmentResponse:
    conversation = await service.get_conversation_for_admin(
        conversation_id, admin.establishment_id, db
    )
    return await service.add_message_attachment(conversation, message_id, admin, file, db)


# ── Téléchargement (authentifié, jamais de fichier servi en statique) ────
@router.get("/attachments/{attachment_id}")
async def download_attachment(
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_or_parent),
) -> FileResponse:
    attachment, path = await service.get_attachment_for_download(
        attachment_id, current_user, db
    )
    return FileResponse(
        path, filename=attachment.filename, media_type=attachment.content_type
    )


# ── WebSocket : relais temps réel (aucune logique métier ici) ────
@router.websocket("/ws")
async def messaging_ws(websocket: WebSocket, token: str = Query(...)) -> None:
    """
    Jeton passé en query string (`?token=...`) : un handshake WS navigateur ne
    permet pas de poser un header Authorization. Défense en profondeur : on
    vérifie aussi l'Origin quand le navigateur en envoie un.

    La session DB n'est ouverte que pour la phase d'authentification, PUIS
    refermée avant la boucle de relais — une connexion WS peut vivre des
    heures, on ne garde pas une connexion du pool de la base ouverte tout ce
    temps.
    """
    origin = websocket.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        await websocket.close(code=1008)
        return

    async with AsyncSessionLocal() as db:
        try:
            user = await authenticate_ws(token, db)
        except WSAuthError:
            await websocket.close(code=1008)
            return

        if user.role not in (UserRole.ADMIN, UserRole.PARENT) or user.establishment_id is None:
            await websocket.close(code=1008)
            return

        channels = [f"messaging:estab:{user.establishment_id}:announcements"]
        if user.role == UserRole.ADMIN:
            channels.append(f"messaging:estab:{user.establishment_id}:admin")
        else:
            conversation = await service.get_or_create_own_conversation(user, db)
            channels.append(f"messaging:conv:{conversation.id}")
        await db.commit()

    await websocket.accept()
    await run_relay_until_disconnect(websocket, channels)
