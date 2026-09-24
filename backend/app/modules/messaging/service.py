import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.config import settings
from app.modules.auth.models import User, UserRole
from app.modules.children.models import Child
from app.modules.messaging.models import (
    Announcement,
    AnnouncementRead,
    Attachment,
    Conversation,
    Message,
    announcement_departments,
)
from app.modules.organization.models import Department
from app.modules.parents.models import parent_children
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
from app.modules.notifications.service import (
    send_push_to_establishment_admins,
    send_push_to_establishment_parents,
)


def _announcements_channel(establishment_id: uuid.UUID) -> str:
    return f"messaging:estab:{establishment_id}:announcements"


# Nombre max de médias joints à une diffusion (photos, vidéos, PDF) — imposé
# à l'upload unitaire comme en lot (409 au-delà).
MAX_ANNOUNCEMENT_ATTACHMENTS = 15
MAX_MESSAGE_ATTACHMENTS = 15


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

    # Ciblage : liste vide = broadcast (aucune ligne). Chaque id est vérifié
    # dans l'établissement (404 sinon), doublons dédupliqués.
    department_ids = await _validate_scope_departments(
        payload.department_ids, establishment_id, db
    )
    if department_ids:
        await db.execute(
            announcement_departments.insert(),
            [
                {"announcement_id": announcement.id, "department_id": d}
                for d in department_ids
            ],
        )
    await db.refresh(announcement)

    # Audience réelle dès la création (le « Y » du compteur admin).
    audience = await _audience_parent_ids(establishment_id, department_ids or None, db)
    response = _announcement_response(
        announcement, read_count=0, total_parents=len(audience),
        department_ids=department_ids,
    )
    await publish_event(
        _announcements_channel(establishment_id),
        {"type": "announcement", **response.model_dump(mode="json")},
    )

    # Push : audience ciblée si départements cochés, sinon tous les parents.
    await send_push_to_establishment_parents(
        establishment_id,
        "Nouvelle diffusion",
        announcement.title,
        db,
        {"type": "announcement", "announcement_id": str(announcement.id),
         "department_ids": [str(d) for d in department_ids]},
        parent_ids=audience,
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
    if current_user.role == UserRole.PARENT or not include_inactive:
        filters.append(Announcement.is_active.is_(True))
    if current_user.role == UserRole.PARENT:
        parent_depts = await _parent_department_ids(current_user.id, db)
        targeted = select(announcement_departments.c.announcement_id).where(
            announcement_departments.c.announcement_id == Announcement.id
        )
        filters.append(
            ~targeted.exists()
            | targeted.where(
                announcement_departments.c.department_id.in_(parent_depts)
            ).exists()
        )

    total = await db.scalar(
        select(func.count()).select_from(Announcement).where(*filters)
    )
    result = await db.execute(
        select(Announcement)
        .where(*filters)
        .order_by(Announcement.created_at.desc(), Announcement.id.desc())
        .offset(skip)
        .limit(limit)
    )
    announcements = result.scalars().all()
    attachments_map = await _attachments_for_announcements(
        [a.id for a in announcements], db
    )
    departments_map = await _departments_for_announcements(
        [a.id for a in announcements], db
    )

    if current_user.role == UserRole.PARENT:
        read_ids = await _read_announcement_ids(current_user.id, db)
        items = [
            _announcement_response(
                a, is_read=a.id in read_ids, attachments=attachments_map.get(a.id),
                department_ids=departments_map.get(a.id, []),
            )
            for a in announcements
        ]
    else:
        counts = await _read_counts({a.id for a in announcements}, db)
        # Total d'audience par périmètre (broadcast vs chaque ciblage), mis en
        # cache car plusieurs diffusions partagent souvent le même périmètre.
        totals: dict[tuple, int] = {}
        items = []
        for a in announcements:
            scope = departments_map.get(a.id, [])
            key = tuple(sorted(scope))
            if key not in totals:
                totals[key] = await _count_audience_parents(
                    establishment_id, scope or None, db
                )
            items.append(
                _announcement_response(
                    a, read_count=counts.get(a.id, 0), total_parents=totals[key],
                    attachments=attachments_map.get(a.id), department_ids=scope,
                )
            )

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
    scope = await _announcement_department_ids(announcement.id, db)
    if current_user.role == UserRole.PARENT:
        # Hors périmètre → 404 (on ne révèle pas l'existence, comme partout).
        if scope and not (set(scope) & await _parent_department_ids(current_user.id, db)):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diffusion introuvable")
        read_ids = await _read_announcement_ids(current_user.id, db)
        return _announcement_response(
            announcement, is_read=announcement.id in read_ids, attachments=attachments,
            department_ids=scope,
        )

    total_parents = await _count_audience_parents(establishment_id, scope or None, db)
    counts = await _read_counts({announcement.id}, db)
    return _announcement_response(
        announcement, read_count=counts.get(announcement.id, 0),
        total_parents=total_parents, attachments=attachments, department_ids=scope,
    )


async def update_announcement(
    announcement_id: uuid.UUID,
    payload: AnnouncementUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> AnnouncementResponse:
    announcement = await _get_announcement_or_404(announcement_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)
    # Le périmètre ne se pose pas par setattr (relation M2M) : il REMPLACE le
    # ciblage (liste vide = retour au broadcast).
    scope_change = changes.pop("department_ids", None)
    validated: list[uuid.UUID] | None = None
    for field, value in changes.items():
        setattr(announcement, field, value)
    if scope_change is not None:
        validated = await _validate_scope_departments(
            scope_change, establishment_id, db
        )
        await db.execute(
            delete(announcement_departments).where(
                announcement_departments.c.announcement_id == announcement.id
            )
        )
        if validated:
            await db.execute(
                announcement_departments.insert(),
                [
                    {"announcement_id": announcement.id, "department_id": d}
                    for d in validated
                ],
            )
        # Cohérence du compteur X/Y : les lectures de parents sortis du
        # périmètre sont supprimées (sinon read_count > total).
        audience = await _audience_parent_ids(
            establishment_id, validated or None, db
        )
        if validated:
            prune = delete(AnnouncementRead).where(
                AnnouncementRead.announcement_id == announcement.id
            )
            if audience:
                prune = prune.where(AnnouncementRead.parent_id.not_in(audience))
            await db.execute(prune)
    await db.flush()
    await db.refresh(announcement)

    scope = await _announcement_department_ids(announcement.id, db)
    total_parents = await _count_audience_parents(establishment_id, scope or None, db)
    counts = await _read_counts({announcement.id}, db)
    return _announcement_response(
        announcement, read_count=counts.get(announcement.id, 0), total_parents=total_parents,
        department_ids=scope,
    )


async def mark_announcement_read(
    announcement_id: uuid.UUID,
    parent: User,
    db: AsyncSession,
) -> None:
    await _get_announcement_or_404(announcement_id, parent.establishment_id, db)
    # Hors périmètre → 404 : un parent ne marque jamais lu ce qu'il ne voit pas.
    scope = await _announcement_department_ids(announcement_id, db)
    if scope and not (set(scope) & await _parent_department_ids(parent.id, db)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diffusion introuvable")
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


async def start_conversation(
    parent_id: uuid.UUID,
    establishment_id: uuid.UUID,
    admin: User,
    db: AsyncSession,
    *,
    body: str | None = None,
) -> ConversationResponse:
    """L'admin ouvre (ou récupère) la conversation privée avec un parent, et envoie
    éventuellement un premier message d'ouverture dans le même appel."""
    parent = await db.scalar(
        select(User).where(
            User.id == parent_id,
            User.establishment_id == establishment_id,
            User.role == UserRole.PARENT,
            User.is_active.is_(True),
        )
    )
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable")

    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.establishment_id == establishment_id,
            Conversation.parent_id == parent.id,
        )
    )
    if not conversation:
        conversation = Conversation(
            establishment_id=establishment_id, parent_id=parent.id
        )
        db.add(conversation)
        await db.flush()
        await db.refresh(conversation)

    if body:
        await send_message(conversation, admin, body, db)

    unread = await _unread_count(conversation.id, unread_from="parent", db=db)
    return _conversation_response(conversation, unread_count=unread)


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
        .where(Message.sender_role == "parent", Message.read_at.is_(None), Message.is_deleted.is_(False))
        .group_by(Message.conversation_id)
        .subquery()
    )
    result = await db.execute(
        select(Conversation, func.coalesce(unread_subq.c.unread, 0))
        .outerjoin(unread_subq, Conversation.id == unread_subq.c.conversation_id)
        .where(Conversation.establishment_id == establishment_id)
        .order_by(Conversation.last_message_at.desc().nulls_last(), Conversation.id.desc())
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
    before_id: uuid.UUID | None = None,
) -> MessageListResponse:
    total = await db.scalar(
        select(func.count())
        .select_from(Message)
        .where(Message.conversation_id == conversation.id)
    )
    filters = [Message.conversation_id == conversation.id]
    if before_id is not None:
        cursor = await db.scalar(
            select(Message).where(Message.id == before_id, *filters)
        )
        if cursor is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message introuvable")
        filters.append(tuple_(Message.created_at, Message.id) < tuple_(cursor.created_at, cursor.id))
    result = await db.execute(
        select(Message)
        .where(*filters)
        .order_by(Message.created_at.desc(), Message.id.desc())
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

    # Push notification au DESTINATAIRE (best-effort, comme les emails de
    # rapport — jamais bloquant) : aux admins si l'expéditeur est le parent,
    # au seul parent de la conversation si l'expéditeur est un admin.
    sender_label = f"{sender.nickname or sender.first_name} {sender.last_name or ''}".strip()
    preview = body.strip()[:120] or "Nouvelle pièce jointe"
    if sender.role == UserRole.ADMIN:
        await send_push_to_establishment_parents(
            conversation.establishment_id,
            "Nouveau message de l'établissement",
            preview,
            db,
            {"type": "message", "conversation_id": str(conversation.id)},
            parent_ids={conversation.parent_id},
        )
    else:
        await send_push_to_establishment_admins(
            conversation.establishment_id,
            "Nouveau message",
            f"Un nouveau message de {sender_label}",
            db,
            {"type": "message", "conversation_id": str(conversation.id)},
        )
    return response


async def edit_message(
    conversation: Conversation,
    message_id: uuid.UUID,
    editor: User,
    body: str,
    db: AsyncSession,
) -> MessageResponse:
    message = await _get_owned_message(conversation, message_id, editor, db)
    now = datetime.now(timezone.utc)
    if message.created_at + MESSAGE_EDIT_WINDOW < now:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Délai d'édition dépassé (15 minutes)",
        )
    body = body.strip()
    if len(body) > 5000 or (not body and not await _message_attachment_count(message.id, db)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Un message doit contenir un texte de 5000 caractères maximum ou un média",
        )
    message.body = body
    message.edited_at = now
    await db.flush()
    await db.refresh(message)

    attachments = await _attachments_for_messages([message.id], db)
    response = _message_response(
        message, attachments=_attachments_map_first(attachments, message.id)
    )
    payload = {"type": "message_updated", **response.model_dump(mode="json")}
    await publish_event(_conversation_channel(conversation.id), payload)
    await publish_event(_admin_channel(conversation.establishment_id), payload)
    return response


async def delete_message(
    conversation: Conversation,
    message_id: uuid.UUID,
    requester: User,
    db: AsyncSession,
) -> None:
    message = await _lock_message_for_update(conversation, message_id, db)
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message introuvable")
    if message.sender_id != requester.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Non autorisé")
    if message.is_deleted:
        return
    keys = (
        await db.execute(
            select(Attachment.storage_key).where(Attachment.message_id == message.id)
        )
    ).scalars().all()
    delete_stmt = delete(Attachment).where(Attachment.message_id == message.id)
    await db.execute(delete_stmt)
    message.body = ""
    message.is_deleted = True
    await db.flush()
    for key in keys:
        await storage.delete_file(key)
    await publish_event(
        _conversation_channel(conversation.id),
        {
            "type": "message_deleted",
            "conversation_id": str(conversation.id),
            "message_id": str(message.id),
        },
    )
    await publish_event(
        _admin_channel(conversation.establishment_id),
        {
            "type": "message_deleted",
            "conversation_id": str(conversation.id),
            "message_id": str(message.id),
        },
    )


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
            Message.is_deleted.is_(False),
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


MESSAGE_EDIT_WINDOW = timedelta(minutes=15)


# ── Helpers privés ──────────────────────────────────────────────
async def _lock_message_for_update(
    conversation: Conversation, message_id: uuid.UUID, db: AsyncSession
) -> Message | None:
    return await db.scalar(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Message.id == message_id,
            Message.conversation_id == conversation.id,
            Conversation.establishment_id == conversation.establishment_id,
        )
        .with_for_update(of=Message)
        .execution_options(populate_existing=True)
    )


async def _get_owned_message(
    conversation: Conversation,
    message_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> Message:
    message = await _lock_message_for_update(conversation, message_id, db)
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message introuvable")
    if message.sender_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Non autorisé")
    if message.is_deleted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Message supprimé")
    return message


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


# ── Ciblage des diffusions par départements ───────────────────────
async def _validate_scope_departments(
    department_ids: list[uuid.UUID], establishment_id: uuid.UUID, db: AsyncSession
) -> list[uuid.UUID]:
    """Déduplique et vérifie que chaque département ciblé appartient à
    l'établissement (404 sinon). Liste vide = broadcast."""
    unique = list(dict.fromkeys(department_ids))
    if not unique:
        return []
    rows = (
        await db.execute(
            select(Department.id).where(
                Department.id.in_(unique),
                Department.establishment_id == establishment_id,
            )
        )
    ).scalars().all()
    if set(rows) != set(unique):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Département introuvable"
        )
    return unique


async def _departments_for_announcements(
    announcement_ids: list[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """Batch : départements ciblés par diffusion (absent = broadcast)."""
    if not announcement_ids:
        return {}
    result = await db.execute(
        select(
            announcement_departments.c.announcement_id,
            announcement_departments.c.department_id,
        ).where(announcement_departments.c.announcement_id.in_(announcement_ids))
    )
    by_announcement: dict[uuid.UUID, list[uuid.UUID]] = {}
    for ann_id, dept_id in result.all():
        by_announcement.setdefault(ann_id, []).append(dept_id)
    return by_announcement


async def _announcement_department_ids(
    announcement_id: uuid.UUID, db: AsyncSession
) -> list[uuid.UUID]:
    return (await _departments_for_announcements([announcement_id], db)).get(
        announcement_id, []
    )


async def _parent_department_ids(parent_id: uuid.UUID, db: AsyncSession) -> set[uuid.UUID]:
    """Départements des enfants rattachés au compte parent (via
    parent_children ; enfants sans département ignorés)."""
    result = await db.execute(
        select(Child.department_id)
        .join(parent_children, parent_children.c.child_id == Child.id)
        .where(
            parent_children.c.parent_id == parent_id,
            Child.department_id.is_not(None),
        )
        .distinct()
    )
    return set(result.scalars().all())


async def _audience_parent_ids(
    establishment_id: uuid.UUID,
    department_ids: list[uuid.UUID] | None,
    db: AsyncSession,
) -> set[uuid.UUID]:
    """Comptes parents destinataires : tous les parents actifs (broadcast,
    `department_ids` vide/None) ou ceux ayant ≥ 1 enfant dans l'un des
    départements ciblés."""
    if not department_ids:
        result = await db.execute(
            select(User.id).where(
                User.establishment_id == establishment_id,
                User.role == UserRole.PARENT,
                User.is_active.is_(True),
            )
        )
        return set(result.scalars().all())
    result = await db.execute(
        select(User.id)
        .join(parent_children, parent_children.c.parent_id == User.id)
        .join(Child, Child.id == parent_children.c.child_id)
        .where(
            User.establishment_id == establishment_id,
            User.role == UserRole.PARENT,
            User.is_active.is_(True),
            Child.department_id.in_(department_ids),
        )
        .distinct()
    )
    return set(result.scalars().all())


async def _count_audience_parents(
    establishment_id: uuid.UUID,
    department_ids: list[uuid.UUID] | None,
    db: AsyncSession,
) -> int:
    """Dénominateur du « X/Y ont lu » : audience réelle de la diffusion."""
    return len(await _audience_parent_ids(establishment_id, department_ids, db))


async def _unread_count(
    conversation_id: uuid.UUID, *, unread_from: str, db: AsyncSession
) -> int:
    return await db.scalar(
        select(func.count()).select_from(Message).where(
            Message.conversation_id == conversation_id,
            Message.sender_role == unread_from,
            Message.read_at.is_(None),
            Message.is_deleted.is_(False),
        )
    ) or 0


def _announcement_response(
    announcement: Announcement,
    *,
    read_count: int | None = None,
    total_parents: int | None = None,
    is_read: bool | None = None,
    attachments: list[AttachmentResponse] | None = None,
    department_ids: list[uuid.UUID] | None = None,
) -> AnnouncementResponse:
    return AnnouncementResponse(
        id=announcement.id,
        establishment_id=announcement.establishment_id,
        title=announcement.title,
        body=announcement.body,
        is_active=announcement.is_active,
        department_ids=department_ids or [],
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
        body=None if message.is_deleted else message.body,
        edited_at=message.edited_at,
        is_deleted=message.is_deleted,
        read_at=message.read_at,
        created_at=message.created_at,
        attachments=[] if message.is_deleted else attachments or [],
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


def _attachments_map_first(
    attachments: dict[uuid.UUID, list[AttachmentResponse]], message_id: uuid.UUID
) -> list[AttachmentResponse] | None:
    return attachments.get(message_id)


async def _attachments_for_messages(
    message_ids: list[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, list[AttachmentResponse]]:
    if not message_ids:
        return {}
    result = await db.execute(
        select(Attachment)
        .where(Attachment.message_id.in_(message_ids))
        .order_by(Attachment.created_at, Attachment.id)
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
        .order_by(Attachment.created_at, Attachment.id)
    )
    by_announcement: dict[uuid.UUID, list[AttachmentResponse]] = {}
    for a in result.scalars().all():
        by_announcement.setdefault(a.announcement_id, []).append(_attachment_response(a))
    return by_announcement


def _validate_upload(file: UploadFile, content: bytes, *, allow_video: bool = False) -> None:
    """Plafond : vidéo → `messaging_max_video_mb`, sinon
    `messaging_max_attachment_mb`. Types : liste blanche + tout `image/*`
    (hors SVG) ; `video/*` uniquement si `allow_video` (messages privés ET
    diffusions — jusqu'à `MAX_ANNOUNCEMENT_ATTACHMENTS` médias par diffusion)."""
    is_video = (file.content_type or "").startswith("video/")
    max_mb = settings.messaging_max_video_mb if is_video else settings.messaging_max_attachment_mb
    max_bytes = max_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Fichier trop volumineux (max {max_mb} Mo)",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Fichier vide",
        )
    content_type = file.content_type or ""
    image_ok = (
        content_type.startswith("image/") and content_type != "image/svg+xml"
    )
    video_ok = allow_video and is_video
    if content_type not in settings.messaging_allowed_attachment_types_set and not (
        image_ok or video_ok
    ):
        allowed = ", ".join(sorted(settings.messaging_allowed_attachment_types_set))
        detail = (
            f"Type de fichier non autorisé : {content_type or 'inconnu'}. "
            f"Autorisés : {allowed} ou toute image (hors SVG)"
        )
        if allow_video:
            detail += " ou toute vidéo"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail + ".",
        )


async def add_message_attachment(
    conversation: Conversation,
    message_id: uuid.UUID,
    uploader: User,
    file: UploadFile,
    db: AsyncSession,
) -> AttachmentResponse:
    responses = await add_message_attachments_batch(
        conversation, message_id, uploader, [file], db
    )
    return responses[0]


async def _save_attachment_batch(
    payloads: list[tuple[UploadFile, bytes]],
    uploader: User,
    db: AsyncSession,
    *,
    message_id: uuid.UUID | None = None,
    announcement_id: uuid.UUID | None = None,
) -> list[AttachmentResponse]:
    keys: list[str] = []
    responses: list[AttachmentResponse] = []
    try:
        async with db.begin_nested():
            for file, content in payloads:
                key = await storage.save_file("messaging", file.filename or "fichier", content)
                keys.append(key)
                attachment = Attachment(
                    message_id=message_id,
                    announcement_id=announcement_id,
                    uploaded_by_id=uploader.id,
                    filename=file.filename or "fichier",
                    content_type=file.content_type or "application/octet-stream",
                    size_bytes=len(content),
                    storage_key=key,
                )
                db.add(attachment)
                await db.flush()
                await db.refresh(attachment)
                responses.append(_attachment_response(attachment))
    except BaseException:
        for key in keys:
            await storage.delete_file(key)
        raise
    return responses


async def _announcement_attachment_count(
    announcement_id: uuid.UUID, db: AsyncSession
) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Attachment)
            .where(Attachment.announcement_id == announcement_id)
        )
        or 0
    )


async def _message_attachment_count(message_id: uuid.UUID, db: AsyncSession) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Attachment)
            .where(Attachment.message_id == message_id)
        )
        or 0
    )


def _ensure_message_quota(existing: int, incoming: int) -> None:
    if existing + incoming > MAX_MESSAGE_ATTACHMENTS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Limite de {MAX_MESSAGE_ATTACHMENTS} médias par message "
                f"atteinte ({existing} déjà joint(s))"
            ),
        )


def _ensure_announcement_quota(existing: int, incoming: int) -> None:
    if existing + incoming > MAX_ANNOUNCEMENT_ATTACHMENTS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Limite de {MAX_ANNOUNCEMENT_ATTACHMENTS} médias par diffusion "
                f"atteinte ({existing} déjà joint(s))"
            ),
        )


async def add_announcement_attachment(
    announcement_id: uuid.UUID,
    establishment_id: uuid.UUID,
    uploader: User,
    file: UploadFile,
    db: AsyncSession,
) -> AttachmentResponse:
    responses = await add_announcement_attachments_batch(
        announcement_id, establishment_id, uploader, [file], db
    )
    return responses[0]


async def add_announcement_attachments_batch(
    announcement_id: uuid.UUID,
    establishment_id: uuid.UUID,
    uploader: User,
    files: list[UploadFile],
    db: AsyncSession,
) -> list[AttachmentResponse]:
    """Envoi en lot des médias d'une diffusion (jusqu'à 15 au total).

    Tous les fichiers sont lus et validés AVANT toute écriture : soit le lot
    entier est accepté, soit rien n'est enregistré (pas d'envoi partiel).
    Un événement temps réel est publié par pièce jointe (même contrat que
    l'upload unitaire — le frontend invalide sur `announcement_attachment`).
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Aucun fichier fourni",
        )
    announcement = await db.scalar(
        select(Announcement)
        .where(
            Announcement.id == announcement_id,
            Announcement.establishment_id == establishment_id,
        )
        .with_for_update(of=Announcement)
        .execution_options(populate_existing=True)
    )
    if not announcement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diffusion introuvable")
    _ensure_announcement_quota(
        await _announcement_attachment_count(announcement.id, db), len(files)
    )

    payloads: list[tuple[UploadFile, bytes]] = []
    for file in files:
        content = await file.read()
        _validate_upload(file, content, allow_video=True)
        payloads.append((file, content))

    responses = await _save_attachment_batch(
        payloads, uploader, db, announcement_id=announcement.id
    )
    for response in responses:
        await publish_event(
            _announcements_channel(establishment_id),
            {"type": "announcement_attachment",
             "announcement_id": str(announcement.id),
             **response.model_dump(mode="json")},
        )
    return responses


async def add_message_attachments_batch(
    conversation: Conversation,
    message_id: uuid.UUID,
    uploader: User,
    files: list[UploadFile],
    db: AsyncSession,
) -> list[AttachmentResponse]:
    """Envoi en lot des médias d'un message (tout ou rien, max 15 au total)."""
    if not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Aucun fichier fourni",
        )
    message = await _lock_message_for_update(conversation, message_id, db)
    if not message or message.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message introuvable")
    if message.sender_id != uploader.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Non autorisé")
    _ensure_message_quota(await _message_attachment_count(message.id, db), len(files))

    payloads: list[tuple[UploadFile, bytes]] = []
    for file in files:
        content = await file.read()
        _validate_upload(file, content, allow_video=True)
        payloads.append((file, content))

    responses = await _save_attachment_batch(
        payloads, uploader, db, message_id=message.id
    )
    for response in responses:
        payload = {
            "type": "attachment",
            "conversation_id": str(conversation.id),
            "message_id": str(message.id),
            **response.model_dump(mode="json"),
        }
        await publish_event(_conversation_channel(conversation.id), payload)
        await publish_event(_admin_channel(conversation.establishment_id), payload)
    return responses


async def remove_message_attachment(
    conversation: Conversation,
    message_id: uuid.UUID,
    attachment_id: uuid.UUID,
    requester: User,
    db: AsyncSession,
) -> None:
    message = await _lock_message_for_update(conversation, message_id, db)
    if not message or message.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message introuvable")
    if message.sender_id != requester.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Non autorisé")
    attachment = await db.scalar(
        select(Attachment).where(
            Attachment.id == attachment_id, Attachment.message_id == message.id
        )
    )
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pièce jointe introuvable")
    remaining = await _message_attachment_count(message.id, db)
    if remaining <= 1 and not message.body.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Un message doit garder au moins un média ou un texte",
        )
    await db.delete(attachment)
    await db.flush()
    await storage.delete_file(attachment.storage_key)

    attachments = await _attachments_for_messages([message.id], db)
    response = _message_response(
        message, attachments=_attachments_map_first(attachments, message.id)
    )
    payload = {"type": "message_updated", **response.model_dump(mode="json")}
    await publish_event(_conversation_channel(conversation.id), payload)
    await publish_event(_admin_channel(conversation.establishment_id), payload)


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
        if message.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Pièce jointe introuvable"
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
        if current_user.role == UserRole.ADMIN:
            owner_ok = True
        else:
            # Diffusion ciblée : le parent doit être dans le périmètre (un
            # broadcast reste visible par tous les parents).
            scope = await _announcement_department_ids(announcement.id, db)
            owner_ok = not scope or bool(
                set(scope) & await _parent_department_ids(current_user.id, db)
            )

    if establishment_id != current_user.establishment_id or not owner_ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pièce jointe introuvable")

    return attachment, storage.resolve_path(attachment.storage_key)
