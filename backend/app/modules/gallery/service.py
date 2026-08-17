"""
Galerie de médias — vue en agrégation live sur les pièces jointes déjà
stockées par les modules Rapports et Messagerie. Aucune table dédiée, aucune
duplication de fichier : ce module ne fait que lister et filtrer, jamais que
servir un fichier lui-même (les URL de téléchargement pointent toujours vers
les endpoints authentifiés déjà existants de chaque module d'origine).

Deux sources, volontairement traitées différemment (cf. claude.md) :
- `report`  : pièces jointes de rapports — liées à un enfant, un département,
  un groupe, un auteur (staff). Filtrable par tous ces axes.
- `message` : pièces jointes de messages privés (JAMAIS les diffusions,
  génériques à tout l'établissement, donc hors-sujet pour une galerie « photos
  de mon enfant ») — liées à un parent (sa conversation), jamais à un enfant
  précis. Réservé à l'admin : la messagerie reste hors RBAC, jamais accessible
  au staff, donc jamais dans SA galerie non plus.
"""

import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User, UserRole
from app.modules.gallery.schemas import (
    ChildBrief,
    GalleryMediaItem,
    GalleryMediaListResponse,
    GallerySource,
    UserBrief,
)
from app.modules.messaging.models import Attachment as MessageAttachment
from app.modules.messaging.models import Conversation, Message
from app.modules.reports.models import Report, ReportAttachment, ReportStatus, ReportType


# ── Admin / staff (RBAC gallery:read) ─────────────────────────────
async def list_gallery_media(
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
    *,
    source: GallerySource | None = None,
    child_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
    staff_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    report_type: ReportType | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    skip: int = 0,
    limit: int = 50,
) -> GalleryMediaListResponse:
    is_admin = current_user.role == UserRole.ADMIN

    # Filtres n'ayant de sens que pour les rapports : s'ils sont posés, la
    # messagerie (jamais liée à un enfant/groupe/département) n'a rien à y
    # apporter — on l'exclut simplement plutôt que de renvoyer une erreur.
    report_only_filters_set = any(
        [child_id, group_id, staff_id, department_id, report_type]
    )

    include_report = source in (None, GallerySource.REPORT)
    include_message = source in (None, GallerySource.MESSAGE) and not report_only_filters_set

    if source == GallerySource.MESSAGE and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La galerie de messagerie est réservée à l'administration",
        )
    if not is_admin:
        include_message = False

    report_items = []
    if include_report:
        report_items = await _report_media(
            establishment_id, child_id=child_id, group_id=group_id,
            staff_id=staff_id, department_id=department_id, report_type=report_type,
            date_from=date_from, date_to=date_to, db=db,
        )

    message_items = []
    if include_message:
        message_items = await _message_media(
            establishment_id, date_from=date_from, date_to=date_to, db=db,
        )

    return _merge_paginate(report_items, message_items, skip=skip, limit=limit)


# ── Portail staff (hors RBAC) ───────────────────────────────────────
async def list_my_uploads(
    current_user: User,
    db: AsyncSession,
    *,
    source: GallerySource | None = None,
    child_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
) -> GalleryMediaListResponse:
    """
    « Galerie » du portail staff — médias envoyés par l'utilisateur lui-même
    au travers de SES rapports, sans permission gallery:read (hors RBAC,
    comme Mon Groupe/Présence) : scopé à ses propres uploads par
    construction, jamais à toute la galerie de l'établissement.
    """
    include_report = source in (None, GallerySource.REPORT)
    report_items: list[GalleryMediaItem] = []
    if include_report:
        report_items = await _report_media(
            current_user.establishment_id,
            child_id=child_id, group_id=None, staff_id=current_user.id,
            department_id=None, report_type=None,
            date_from=None, date_to=None, db=db,
        )
    return _merge_paginate(report_items, [], skip=skip, limit=limit)


# ── Portail parent ────────────────────────────────────────────────
async def list_my_gallery_media(
    parent: User,
    db: AsyncSession,
    *,
    source: GallerySource | None = None,
    child_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
) -> GalleryMediaListResponse:
    child_ids = {c.id for c in parent.assigned_children}
    if child_id:
        if child_id not in child_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Enfant introuvable"
            )
        child_ids = {child_id}

    include_report = source in (None, GallerySource.REPORT) and bool(child_ids)
    # Une photo de message n'est jamais liée à un enfant précis (cf. module
    # docstring) — si le parent filtre par enfant, la messagerie n'a rien à y
    # apporter, on l'exclut comme côté admin.
    include_message = source in (None, GallerySource.MESSAGE) and not child_id

    report_items = []
    if include_report:
        report_items = await _report_media(
            parent.establishment_id, child_id=None, group_id=None, staff_id=None,
            department_id=None, report_type=None, date_from=None, date_to=None,
            db=db, child_ids=child_ids, validated_only=True, viewer="parent",
        )

    message_items = []
    if include_message:
        message_items = await _message_media(
            parent.establishment_id, date_from=None, date_to=None, db=db,
            parent_id=parent.id, viewer="parent",
        )

    return _merge_paginate(report_items, message_items, skip=skip, limit=limit)


# ── Helpers privés ──────────────────────────────────────────────
async def _report_media(
    establishment_id: uuid.UUID,
    *,
    child_id: uuid.UUID | None,
    group_id: uuid.UUID | None,
    staff_id: uuid.UUID | None,
    department_id: uuid.UUID | None,
    report_type: ReportType | None,
    date_from: date | None,
    date_to: date | None,
    db: AsyncSession,
    child_ids: set[uuid.UUID] | None = None,
    validated_only: bool = False,
    viewer: str = "staff",
) -> list[GalleryMediaItem]:
    filters = [Report.establishment_id == establishment_id]
    if validated_only:
        filters.append(Report.status == str(ReportStatus.VALIDATED))
    if child_ids is not None:
        if not child_ids:
            return []
        filters.append(Report.child_id.in_(child_ids))
    if child_id:
        filters.append(Report.child_id == child_id)
    if group_id:
        filters.append(Report.group_id == group_id)
    if staff_id:
        filters.append(ReportAttachment.uploaded_by_id == staff_id)
    if department_id:
        filters.append(Report.department_id == department_id)
    if report_type:
        filters.append(Report.report_type == str(report_type))
    _apply_date_range(filters, ReportAttachment.created_at, date_from, date_to)

    stmt = (
        select(ReportAttachment)
        .join(Report, ReportAttachment.report_id == Report.id)
        .where(*filters)
        .order_by(ReportAttachment.created_at.desc())
    )
    result = await db.execute(stmt)
    return [
        _report_attachment_to_item(a, viewer=viewer) for a in result.scalars().all()
    ]


async def _message_media(
    establishment_id: uuid.UUID,
    *,
    date_from: date | None,
    date_to: date | None,
    db: AsyncSession,
    parent_id: uuid.UUID | None = None,
    viewer: str = "staff",
) -> list[GalleryMediaItem]:
    filters = [
        Conversation.establishment_id == establishment_id,
        MessageAttachment.message_id.is_not(None),
    ]
    if parent_id:
        filters.append(Conversation.parent_id == parent_id)
    _apply_date_range(filters, MessageAttachment.created_at, date_from, date_to)

    stmt = (
        select(MessageAttachment)
        .join(Message, MessageAttachment.message_id == Message.id)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(*filters)
        .order_by(MessageAttachment.created_at.desc())
    )
    result = await db.execute(stmt)
    return [
        _message_attachment_to_item(a, viewer=viewer) for a in result.scalars().all()
    ]


def _apply_date_range(
    filters: list, column, date_from: date | None, date_to: date | None
) -> None:
    if date_from:
        filters.append(column >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        upper = datetime.combine(date_to, time.min, tzinfo=timezone.utc) + timedelta(days=1)
        filters.append(column < upper)


def _merge_paginate(
    report_items: list[GalleryMediaItem],
    message_items: list[GalleryMediaItem],
    *,
    skip: int,
    limit: int,
) -> GalleryMediaListResponse:
    merged = sorted(report_items + message_items, key=lambda i: i.created_at, reverse=True)
    total = len(merged)
    page = merged[skip: skip + limit]
    return GalleryMediaListResponse(total=total, items=page)


def _user_brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id, first_name=user.first_name, last_name=user.last_name,
        nickname=user.nickname,
    )


def _report_attachment_to_item(
    attachment: ReportAttachment, *, viewer: str
) -> GalleryMediaItem:
    report = attachment.report
    url = (
        f"/api/v1/reports/mine/{report.id}/attachments/{attachment.id}"
        if viewer == "parent"
        else f"/api/v1/reports/{report.id}/attachments/{attachment.id}"
    )
    return GalleryMediaItem(
        id=attachment.id,
        source=GallerySource.REPORT,
        filename=attachment.filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        uploaded_by=_user_brief(attachment.uploaded_by),
        created_at=attachment.created_at,
        url=url,
        child=ChildBrief(
            id=report.child.id, matricule=report.child.matricule,
            last_name=report.child.last_name, first_names=report.child.first_names,
        ),
        report_type=ReportType(report.report_type),
    )


def _message_attachment_to_item(
    attachment: MessageAttachment, *, viewer: str
) -> GalleryMediaItem:
    conversation = attachment.message.conversation
    return GalleryMediaItem(
        id=attachment.id,
        source=GallerySource.MESSAGE,
        filename=attachment.filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        uploaded_by=_user_brief(attachment.uploaded_by),
        created_at=attachment.created_at,
        url=f"/api/v1/messaging/attachments/{attachment.id}",
        conversation_parent=(
            None if viewer == "parent" else _user_brief(conversation.parent)
        ),
    )
