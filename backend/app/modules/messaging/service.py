import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.config import settings
from app.modules.auth.models import User, UserRole
from app.modules.messaging.models import (
    Announcement,
    AnnouncementRead,
    Attachment,
    Conversation,
    Message,
)
from app.modules.messaging.schemas import (
    AnnouncementCreateRequest,
    AnnouncementListResponse,
    AnnouncementResponse,
    AnnouncementUpdateRequest,
    AttachmentResponse,
    ConversationListResponse,
    ConversationResponse,
    MessageListResponse,
    MessageResponse,
    UserBrief,
)
from app.modules.messaging.ws_manager import publish_event


def _announcements_channel(establishment_id: uuid.UUID) -> str:
    return f"messaging:estab:{establishment_id}:announcements"


def _admin_channel(establishment_id: uuid.UUID) -> str:
    return f"messaging:estab:{establishment_id}:admin"


def _conversation_channel(conversation_id: uuid.UUID) -> str:
    return f"messaging:conv:{conversation_id}"


# ── Diffusions ──────────────────────────────────────────────────
async def create_announcement(
    payload: AnnouncementCreateRequest,
    establishment_id: uuid.UUID,
    admin: User,
    db: AsyncSession,
) -> AnnouncementResponse:
    announcement = Announcement(
        establishment_id=establishment_id,
        created_by_id=admin.id,
        title=payload.title,
        body=payload.body,
    )
    db.add(announcement)
    await db.flush()
    await db.refresh(announcement)

    response = _announcement_response(announcement, read_count=0, total_parents=None)
    await publish_event(
        _announcements_channel(establishment_id),
        {"type": "announcement", **response.model_dump(mode="json")},
    )
    return response


async def list_announcements(
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
    *,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> AnnouncementListResponse:
    filters = [Announcement.establishment_id == establishment_id]
    if not include_inactive:
        filters.append(Announcement.is_active.is_(True))

    total = await db.scalar(
        select(func.count()).select_from(Announcement).where(*filters)
    )
    result = await db.execute(
        select(Announcement)
        .where(*filters)
        .order_by(Announcement.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    announcements = result.scalars().all()
    attachments_map = await _attachments_for_announcements(
        [a.id for a in announcements], db
    )

    if current_user.role == UserRole.PARENT:
        read_ids = await _read_announcement_ids(current_user.id, db)
        items = [
            _announcement_response(
                a, is_read=a.id in read_ids, attachments=attachments_map.get(a.id)
            )
            for a in announcements
        ]
    else:
        total_parents = await _count_active_parents(establishment_id, db)
        counts = await _read_counts({a.id for a in announcements}, db)
        items = [
            _announcement_response(
                a, read_count=counts.get(a.id, 0), total_parents=total_parents,
                attachments=attachments_map.get(a.id),
            )
            for a in announcements
        ]

    return AnnouncementListResponse(total=total or 0, items=items)


async def get_announcement(
    announcement_id: uuid.UUID,
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> AnnouncementResponse:
    announcement = await _get_announcement_or_404(announcement_id, establishment_id, db)
    attachments = (await _attachments_for_announcements([announcement.id], db)).get(
        announcement.id
    )
    if current_user.role == UserRole.PARENT:
        read_ids = await _read_announcement_ids(current_user.id, db)
        return _announcement_response(
            announcement, is_read=announcement.id in read_ids, attachments=attachments
        )

    total_parents = await _count_active_parents(establishment_id, db)
    counts = await _read_counts({announcement.id}, db)
    return _announcement_response(
        announcement, read_count=counts.get(announcement.id, 0),
        total_parents=total_parents, attachments=attachments,
    )


async def update_announcement(
    announcement_id: uuid.UUID,
    payload: AnnouncementUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> AnnouncementResponse:
    announcement = await _get_announcement_or_404(announcement_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(announcement, field, value)
    await db.flush()
    await db.refresh(announcement)

    total_parents = await _count_active_parents(establishment_id, db)
    counts = await _read_counts({announcement.id}, db)
    return _announcement_response(
        announcement, read_count=counts.get(announcement.id, 0), total_parents=total_parents
    )


async def mark_announcement_read(
    announcement_id: uuid.UUID,
    parent: User,
    db: AsyncSession,
) -> None:
    await _get_announcement_or_404(announcement_id, parent.establishment_id, db)
    existing = await db.scalar(
        select(AnnouncementRead.id).where(
            AnnouncementRead.announcement_id == announcement_id,
            AnnouncementRead.parent_id == parent.id,
        )
    )
    if existing:
        return
    db.add(AnnouncementRead(announcement_id=announcement_id, parent_id=parent.id))
    await db.flush()

    # Pas de notification aux AUTRES parents (non pertinent pour eux) : seul le
    # compteur admin ("X/Y lu") a besoin d'être poussé en direct.
    read_count = (await _read_counts({announcement_id}, db)).get(announcement_id, 0)
    await publish_event(
        _admin_channel(parent.establishment_id),
        {
            "type": "announcement_read",
            "announcement_id": str(announcement_id),
            "read_count": read_count,
        },
    )


# ── Conversations ───────────────────────────────────────────────
async def get_or_create_own_conversation(parent: User, db: AsyncSession) -> Conversation:
    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.establishment_id == parent.establishment_id,
            Conversation.parent_id == parent.id,
        )
    )
    if conversation:
        return conversation
    conversation = Conversation(
        establishment_id=parent.establishment_id, parent_id=parent.id
    )
    db.add(conversation)
    await db.flush()
    await db.refresh(conversation)
    return conversation


async def get_own_conversation_summary(
    parent: User, db: AsyncSession
) -> ConversationResponse:
    conversation = await get_or_create_own_conversation(parent, db)
    unread = await _unread_count(conversation.id, unread_from="admin", db=db)
    return _conversation_response(conversation, unread_count=unread)


async def list_conversations(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    skip: int = 0,
    limit: int = 50,
) -> ConversationListResponse:
    total = await db.scalar(
        select(func.count())
        .select_from(Conversation)
        .where(Conversation.establishment_id == establishment_id)
    )

    unread_subq = (
        select(Message.conversation_id, func.count().label("unread"))
        .where(Message.sender_role == "parent", Message.read_at.is_(None))
        .group_by(Message.conversation_id)
        .subquery()
    )
    result = await db.execute(
        select(Conversation, func.coalesce(unread_subq.c.unread, 0))
        .outerjoin(unread_subq, Conversation.id == unread_subq.c.conversation_id)
        .where(Conversation.establishment_id == establishment_id)
        .order_by(Conversation.last_message_at.desc().nulls_last())
        .offset(skip)
        .limit(limit)
    )
    rows = result.all()
    items = [_conversation_response(conv, unread_count=unread) for conv, unread in rows]
    return ConversationListResponse(total=total or 0, items=items)


async def get_conversation_for_admin(
    conversation_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Conversation:
    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.establishment_id == establishment_id,
        )
    )
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation introuvable")
    return conversation


async def list_messages(
    conversation: Conversation,
    db: AsyncSession,
    *,
    skip: int = 0,
    limit: int = 50,
) -> MessageListResponse:
    total = await db.scalar(
        select(func.count())
        .select_from(Message)
        .where(Message.conversation_id == conversation.id)
    )
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    messages = result.scalars().all()
    attachments_map = await _attachments_for_messages([m.id for m in messages], db)
    return MessageListResponse(
        total=total or 0,
        items=[
            _message_response(m, attachments=attachments_map.get(m.id))
            for m in reversed(messages)
        ],
    )


async def send_message(
    conversation: Conversation,
    sender: User,
    body: str,
    db: AsyncSession,
) -> MessageResponse:
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender.id,
        sender_role=str(sender.role),
        body=body,
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)

    conversation.last_message_at = message.created_at
    await db.flush()

    response = _message_response(message)
    payload = {"type": "message", **response.model_dump(mode="json")}
    # Le parent n'écoute que sa propre conversation ; tous les admins
    # connectés écoutent le canal agrégé pour rafraîchir leur liste en direct.
    await publish_event(_conversation_channel(conversation.id), payload)
    await publish_event(_admin_channel(conversation.establishment_id), payload)
    return response


async def mark_conversation_read(
    conversation: Conversation,
    reader_role: UserRole,
    db: AsyncSession,
) -> None:
    """Marque lus tous les messages envoyés par l'AUTRE côté."""
    other_role = "parent" if reader_role == UserRole.ADMIN else "admin"
    result = await db.execute(
        select(Message).where(
            Message.conversation_id == conversation.id,
            Message.sender_role == other_role,
            Message.read_at.is_(None),
        )
    )
    now = datetime.now(timezone.utc)
    messages = result.scalars().all()
    message_ids = [m.id for m in messages]
    for message in messages:
        message.read_at = now
    await db.flush()

    if not message_ids:
        return

    # Pousse l'accusé de lecture en direct : le côté qui a ENVOYÉ ces messages
    # voit apparaître le "lu" sans recharger. reader_role = qui vient de lire
    # (donc l'événement dit "vos messages ont été lus par {reader_role}").
    payload = {
        "type": "read_receipt",
        "conversation_id": str(conversation.id),
        "reader_role": str(reader_role),
        "message_ids": [str(m) for m in message_ids],
        "read_at": now.isoformat(),
    }
    await publish_event(_conversation_channel(conversation.id), payload)
    await publish_event(_admin_channel(conversation.establishment_id), payload)


# ── Helpers privés ──────────────────────────────────────────────
async def _get_announcement_or_404(
    announcement_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Announcement:
    announcement = await db.scalar(
        select(Announcement).where(
            Announcement.id == announcement_id,
            Announcement.establishment_id == establishment_id,
        )
    )
    if not announcement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diffusion introuvable")
    return announcement


async def _read_announcement_ids(parent_id: uuid.UUID, db: AsyncSession) -> set[uuid.UUID]:
    result = await db.execute(
        select(AnnouncementRead.announcement_id).where(
            AnnouncementRead.parent_id == parent_id
        )
    )
    return set(result.scalars().all())


async def _read_counts(
    announcement_ids: set[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, int]:
    if not announcement_ids:
        return {}
    result = await db.execute(
        select(AnnouncementRead.announcement_id, func.count())
        .where(AnnouncementRead.announcement_id.in_(announcement_ids))
        .group_by(AnnouncementRead.announcement_id)
    )
    return dict(result.all())


async def _count_active_parents(establishment_id: uuid.UUID, db: AsyncSession) -> int:
    return await db.scalar(
        select(func.count()).select_from(User).where(
            User.establishment_id == establishment_id,
            User.role == UserRole.PARENT,
            User.is_active.is_(True),
        )
    ) or 0


async def _unread_count(
    conversation_id: uuid.UUID, *, unread_from: str, db: AsyncSession
) -> int:
    return await db.scalar(
        select(func.count()).select_from(Message).where(
            Message.conversation_id == conversation_id,
            Message.sender_role == unread_from,
            Message.read_at.is_(None),
        )
    ) or 0


def _announcement_response(
    announcement: Announcement,
    *,
    read_count: int | None = None,
    total_parents: int | None = None,
    is_read: bool | None = None,
    attachments: list[AttachmentResponse] | None = None,
) -> AnnouncementResponse:
    return AnnouncementResponse(
        id=announcement.id,
        establishment_id=announcement.establishment_id,
        title=announcement.title,
        body=announcement.body,
        is_active=announcement.is_active,
        created_by=UserBrief(
            id=announcement.created_by.id,
            first_name=announcement.created_by.first_name,
            last_name=announcement.created_by.last_name,
            nickname=announcement.created_by.nickname,
        ),
        created_at=announcement.created_at,
        updated_at=announcement.updated_at,
        read_count=read_count,
        total_parents=total_parents,
        is_read=is_read,
        attachments=attachments or [],
    )


def _message_response(
    message: Message, *, attachments: list[AttachmentResponse] | None = None
) -> MessageResponse:
    return MessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        sender=UserBrief(
            id=message.sender.id,
            first_name=message.sender.first_name,
            last_name=message.sender.last_name,
            nickname=message.sender.nickname,
        ),
        sender_role=message.sender_role,
        body=message.body,
        read_at=message.read_at,
        created_at=message.created_at,
        attachments=attachments or [],
    )


def _conversation_response(
    conversation: Conversation, *, unread_count: int
) -> ConversationResponse:
    return ConversationResponse(
        id=conversation.id,
        establishment_id=conversation.establishment_id,
        parent=UserBrief(
            id=conversation.parent.id,
            first_name=conversation.parent.first_name,
            last_name=conversation.parent.last_name,
            nickname=conversation.parent.nickname,
        ),
        last_message_at=conversation.last_message_at,
        unread_count=unread_count,
        created_at=conversation.created_at,
    )


# ── Pièces jointes ──────────────────────────────────────────────
def _attachment_url(attachment_id: uuid.UUID) -> str:
    return f"/api/v1/messaging/attachments/{attachment_id}"


def _attachment_response(attachment: Attachment) -> AttachmentResponse:
    return AttachmentResponse(
        id=attachment.id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        uploaded_by=UserBrief(
            id=attachment.uploaded_by.id,
            first_name=attachment.uploaded_by.first_name,
            last_name=attachment.uploaded_by.last_name,
            nickname=attachment.uploaded_by.nickname,
        ),
        created_at=attachment.created_at,
        url=_attachment_url(attachment.id),
    )


async def _attachments_for_messages(
    message_ids: list[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, list[AttachmentResponse]]:
    if not message_ids:
        return {}
    result = await db.execute(
        select(Attachment)
        .where(Attachment.message_id.in_(message_ids))
        .order_by(Attachment.created_at)
    )
    by_message: dict[uuid.UUID, list[AttachmentResponse]] = {}
    for a in result.scalars().all():
        by_message.setdefault(a.message_id, []).append(_attachment_response(a))
    return by_message


async def _attachments_for_announcements(
    announcement_ids: list[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, list[AttachmentResponse]]:
    if not announcement_ids:
        return {}
    result = await db.execute(
        select(Attachment)
        .where(Attachment.announcement_id.in_(announcement_ids))
        .order_by(Attachment.created_at)
    )
    by_announcement: dict[uuid.UUID, list[AttachmentResponse]] = {}
    for a in result.scalars().all():
        by_announcement.setdefault(a.announcement_id, []).append(_attachment_response(a))
    return by_announcement


def _validate_upload(file: UploadFile, content: bytes) -> None:
    max_bytes = settings.messaging_max_attachment_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Fichier trop volumineux (max {settings.messaging_max_attachment_mb} Mo)",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Fichier vide",
        )
    content_type = file.content_type or ""
    if content_type not in settings.messaging_allowed_attachment_types_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Type de fichier non autorisé : {content_type or 'inconnu'}. "
                f"Autorisés : {', '.join(sorted(settings.messaging_allowed_attachment_types_set))}"
            ),
        )


async def add_message_attachment(
    conversation: Conversation,
    message_id: uuid.UUID,
    uploader: User,
    file: UploadFile,
    db: AsyncSession,
) -> AttachmentResponse:
    message = await db.scalar(
        select(Message).where(
            Message.id == message_id, Message.conversation_id == conversation.id
        )
    )
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message introuvable")

    content = await file.read()
    _validate_upload(file, content)
    storage_key = await storage.save_file("messaging", file.filename or "fichier", content)

    attachment = Attachment(
        message_id=message.id,
        uploaded_by_id=uploader.id,
        filename=file.filename or "fichier",
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        storage_key=storage_key,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)

    response = _attachment_response(attachment)
    payload = {"type": "attachment", "message_id": str(message.id), **response.model_dump(mode="json")}
    await publish_event(_conversation_channel(conversation.id), payload)
    await publish_event(_admin_channel(conversation.establishment_id), payload)
    return response


async def add_announcement_attachment(
    announcement_id: uuid.UUID,
    establishment_id: uuid.UUID,
    uploader: User,
    file: UploadFile,
    db: AsyncSession,
) -> AttachmentResponse:
    announcement = await _get_announcement_or_404(announcement_id, establishment_id, db)

    content = await file.read()
    _validate_upload(file, content)
    storage_key = await storage.save_file("messaging", file.filename or "fichier", content)

    attachment = Attachment(
        announcement_id=announcement.id,
        uploaded_by_id=uploader.id,
        filename=file.filename or "fichier",
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        storage_key=storage_key,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)

    response = _attachment_response(attachment)
    await publish_event(
        _announcements_channel(establishment_id),
        {"type": "announcement_attachment", "announcement_id": str(announcement.id),
         **response.model_dump(mode="json")},
    )
    return response


async def get_attachment_for_download(
    attachment_id: uuid.UUID, current_user: User, db: AsyncSession
) -> tuple[Attachment, Path]:
    attachment = await db.scalar(select(Attachment).where(Attachment.id == attachment_id))
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pièce jointe introuvable")

    if attachment.message_id:
        message = await db.scalar(select(Message).where(Message.id == attachment.message_id))
        conversation = await db.scalar(
            select(Conversation).where(Conversation.id == message.conversation_id)
        )
        establishment_id = conversation.establishment_id
        owner_ok = (
            current_user.role == UserRole.ADMIN
            or conversation.parent_id == current_user.id
        )
    else:
        announcement = await db.scalar(
            select(Announcement).where(Announcement.id == attachment.announcement_id)
        )
        establishment_id = announcement.establishment_id
        owner_ok = True  # toute diffusion de l'établissement est visible par ses parents

    if establishment_id != current_user.establishment_id or not owner_ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pièce jointe introuvable")

    return attachment, storage.resolve_path(attachment.storage_key)
