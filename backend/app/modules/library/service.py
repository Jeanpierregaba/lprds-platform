"""
Logique métier du module Bibliothèque.

Décisions de conception (confirmées avec l'utilisateur avant implémentation) :
  - Les rappels sont best-effort (email) + injectés dans la conversation
    admin↔parent du parent concerné — par le chemin ADMIN (la messagerie est
    hors-RBAC, admin/parent uniquement). L'échec de l'un ne fait pas échouer
    l'autre ni la transaction.
  - Chaque prêt éligible est rappelé au plus une fois par jour
    (`last_reminded_on`), afin qu'un rappel manuel répété ou la tâche Celery
    quotidienne ne spamment pas les parents.
"""

import logging
import uuid
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSession
from app.core.i18n import coerce_locale, t
from app.modules.auth.models import User, UserRole
from app.modules.children.models import Child
from app.modules.library import email as library_email
from app.modules.library.models import Book, BookLending, LibrarySettings
from app.modules.library.schemas import (
    BookCreateRequest,
    BookListResponse,
    BookResponse,
    BookUpdateRequest,
    LendingCreateRequest,
    LendingListResponse,
    LendingResponse,
    LendingStatus,
    LibrarySettingsResponse,
    LibrarySettingsUpdateRequest,
    ReminderResultResponse,
    SectionBrief,
)
from app.modules.organization.models import Group, Section

logger = logging.getLogger(__name__)


# ── Helpers ─────────────────────────────────────────────────────
def _child_full_name(child: Child) -> str:
    return f"{child.first_names} {child.last_name}".strip()


async def _first_active_admin(
    db: AsyncSession, establishment_id: uuid.UUID
) -> User | None:
    return await db.scalar(
        select(User).where(
            User.establishment_id == establishment_id,
            User.role == str(UserRole.ADMIN),
            User.is_active.is_(True),
        )
    )


async def _open_lending_counts(
    db: AsyncSession, book_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Nombre de prêts en cours par livre (évite un N+1 sur les listes)."""
    if not book_ids:
        return {}
    result = await db.execute(
        select(BookLending.book_id, func.count())
        .where(
            BookLending.book_id.in_(book_ids),
            BookLending.returned_at.is_(None),
        )
        .group_by(BookLending.book_id)
    )
    return {row[0]: row[1] for row in result.all()}


async def _open_lending_count(db: AsyncSession, book_id: uuid.UUID) -> int:
    count = await db.scalar(
        select(func.count())
        .select_from(BookLending)
        .where(BookLending.book_id == book_id, BookLending.returned_at.is_(None))
    )
    return count or 0


def _book_response(book: Book, open_counts: dict[uuid.UUID, int]) -> BookResponse:
    return BookResponse(
        id=book.id,
        establishment_id=book.establishment_id,
        title=book.title,
        author=book.author,
        description=book.description,
        total_quantity=book.total_quantity,
        available_quantity=max(book.total_quantity - open_counts.get(book.id, 0), 0),
        is_active=book.is_active,
        sections=[SectionBrief(id=s.id, name=s.name) for s in book.sections],
        created_at=book.created_at,
        updated_at=book.updated_at,
    )


async def _get_book_or_404(
    book_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Book:
    book = await db.scalar(
        select(Book)
        .where(Book.id == book_id, Book.establishment_id == establishment_id)
        .options(selectinload(Book.sections))
    )
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.library.book_not_found")
        )
    return book


def _lending_status(lending: BookLending) -> tuple[LendingStatus, int | None]:
    if lending.returned_at is not None:
        return LendingStatus.returned, None
    overdue_days = (date.today() - lending.due_date).days
    if overdue_days > 0:
        return LendingStatus.overdue, overdue_days
    return LendingStatus.active, None


async def _lending_response(lending: BookLending, db: AsyncSession) -> LendingResponse:
    status_enum, overdue_days = _lending_status(lending)
    child = lending.child
    return LendingResponse(
        id=lending.id,
        establishment_id=lending.establishment_id,
        book_id=lending.book_id,
        book_title=lending.book.title,
        author=lending.book.author,
        child_id=child.id,
        child_name=_child_full_name(child),
        child_matricule=child.matricule,
        lent_by_id=lending.lent_by_id,
        lent_by_name=f"{lending.lent_by.first_name} {lending.lent_by.last_name}".strip(),
        borrowed_at=lending.borrowed_at,
        due_date=lending.due_date,
        returned_at=lending.returned_at,
        status=status_enum,
        overdue_days=overdue_days,
    )


# ── Paramètres ──────────────────────────────────────────────────
async def get_or_create_library_settings(
    establishment_id: uuid.UUID, db: AsyncSession
) -> LibrarySettings:
    settings = await db.scalar(
        select(LibrarySettings).where(LibrarySettings.establishment_id == establishment_id)
    )
    if settings:
        return settings
    settings = LibrarySettings(establishment_id=establishment_id)
    db.add(settings)
    await db.flush()
    return settings


async def get_library_settings(
    establishment_id: uuid.UUID, db: AsyncSession
) -> LibrarySettingsResponse:
    settings = await get_or_create_library_settings(establishment_id, db)
    await db.refresh(settings)
    return LibrarySettingsResponse(
        reminders_enabled=settings.reminders_enabled,
        reminder_days_before=settings.reminder_days_before,
        default_loan_days=settings.default_loan_days,
    )


async def update_library_settings(
    establishment_id: uuid.UUID,
    payload: LibrarySettingsUpdateRequest,
    db: AsyncSession,
) -> LibrarySettingsResponse:
    settings = await get_or_create_library_settings(establishment_id, db)
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in changes.items():
        setattr(settings, field, value)
    await db.flush()
    await db.refresh(settings)
    return LibrarySettingsResponse(
        reminders_enabled=settings.reminders_enabled,
        reminder_days_before=settings.reminder_days_before,
        default_loan_days=settings.default_loan_days,
    )


# ── Catalogue ───────────────────────────────────────────────────
async def _resolve_sections(
    establishment_id: uuid.UUID, section_ids: list[uuid.UUID], db: AsyncSession
) -> list[Section]:
    if not section_ids:
        return []
    deduped = list(dict.fromkeys(section_ids))
    result = await db.execute(
        select(Section).where(
            Section.id.in_(deduped),
            Section.establishment_id == establishment_id,
        )
    )
    sections = list(result.scalars().all())
    if len(sections) != len(deduped):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.library.unknown_sections"),
        )
    return sections


async def create_book(
    establishment_id: uuid.UUID,
    payload: BookCreateRequest,
    db: AsyncSession,
) -> BookResponse:
    sections = await _resolve_sections(establishment_id, payload.section_ids, db)
    book = Book(
        establishment_id=establishment_id,
        title=payload.title.strip(),
        author=payload.author.strip(),
        description=payload.description.strip() if payload.description else None,
        total_quantity=payload.total_quantity,
        sections=sections,
    )
    db.add(book)
    await db.flush()
    await db.refresh(book)
    return _book_response(book, {})


async def list_books(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    section_id: uuid.UUID | None = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> BookListResponse:
    filters = [Book.establishment_id == establishment_id]
    if not include_inactive:
        filters.append(Book.is_active.is_(True))
    if section_id is not None:
        filters.append(Book.sections.any(Section.id == section_id))

    total = await db.scalar(select(func.count()).select_from(Book).where(*filters))
    result = await db.execute(
        select(Book)
        .where(*filters)
        .options(selectinload(Book.sections))
        .order_by(Book.title.asc())
        .offset(skip)
        .limit(limit)
    )
    books = list(result.scalars().all())
    open_counts = await _open_lending_counts(db, [b.id for b in books])
    items = [_book_response(b, open_counts) for b in books]
    return BookListResponse(total=total or 0, items=items)


async def get_book(
    book_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> BookResponse:
    book = await _get_book_or_404(book_id, establishment_id, db)
    open_count = await _open_lending_count(db, book.id)
    return _book_response(book, {book.id: open_count})


async def update_book(
    book_id: uuid.UUID,
    establishment_id: uuid.UUID,
    payload: BookUpdateRequest,
    db: AsyncSession,
) -> BookResponse:
    book = await _get_book_or_404(book_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)

    if changes.get("title") is not None:
        book.title = changes["title"].strip()
    if changes.get("author") is not None:
        book.author = changes["author"].strip()
    # "" efface la description ; None = inchangé
    if "description" in changes:
        book.description = changes["description"].strip() if changes["description"] else None
    if changes.get("total_quantity") is not None:
        book.total_quantity = changes["total_quantity"]
    if "section_ids" in changes and changes["section_ids"] is not None:
        book.sections = await _resolve_sections(
            establishment_id, changes["section_ids"], db
        )
        await db.flush()
        await db.refresh(book, attribute_names=["sections"])
    if changes.get("is_active") is not None:
        book.is_active = changes["is_active"]

    await db.flush()
    await db.refresh(book)
    open_count = await _open_lending_count(db, book.id)
    return _book_response(book, {book.id: open_count})


async def deactivate_book(
    book_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> BookResponse:
    """Soft delete — jamais de suppression physique (RGPD). Interdit si des
    prêts sont encore en cours : le catalogue et les retours resteraient
    déroutants."""
    book = await _get_book_or_404(book_id, establishment_id, db)
    if not book.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.library.already_deactivated"),
        )
    open_count = await _open_lending_count(db, book.id)
    if open_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.library.active_lendings"),
        )
    book.is_active = False
    await db.flush()
    await db.refresh(book)
    return _book_response(book, {book.id: 0})


# ── Prêts ───────────────────────────────────────────────────────
async def create_lending(
    establishment_id: uuid.UUID,
    payload: LendingCreateRequest,
    lent_by: User,
    db: AsyncSession,
) -> LendingResponse:
    book = await _get_book_or_404(payload.book_id, establishment_id, db)
    if not book.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.library.book_deactivated"),
        )

    child = await db.scalar(
        select(Child).where(
            Child.id == payload.child_id,
            Child.establishment_id == establishment_id,
        )
    )
    if not child:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.child_not_found")
        )

    today = date.today()
    borrowed_at = payload.borrowed_at or today
    if borrowed_at > today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.library.borrow_date_future"),
        )

    settings = await get_or_create_library_settings(establishment_id, db)
    if payload.due_date is None:
        due_date = borrowed_at + timedelta(days=settings.default_loan_days)
    else:
        due_date = payload.due_date
    if due_date < borrowed_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.library.due_before_borrow"),
        )

    open_count = await _open_lending_count(db, book.id)
    if open_count >= book.total_quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.library.no_copy_available"),
        )

    lending = BookLending(
        establishment_id=establishment_id,
        book_id=book.id,
        child_id=child.id,
        lent_by_id=lent_by.id,
        borrowed_at=borrowed_at,
        due_date=due_date,
    )
    db.add(lending)
    await db.flush()
    await db.refresh(lending)
    return await _lending_response(lending, db)


async def list_lendings(
    establishment_id: uuid.UUID,
    db: AsyncSession,
    *,
    book_id: uuid.UUID | None = None,
    child_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> LendingListResponse:
    filters = [BookLending.establishment_id == establishment_id]
    if book_id is not None:
        filters.append(BookLending.book_id == book_id)
    if child_id is not None:
        filters.append(BookLending.child_id == child_id)
    if status_filter == "active":
        filters.append(BookLending.returned_at.is_(None))
        filters.append(BookLending.due_date >= date.today())
    elif status_filter == "overdue":
        filters.append(BookLending.returned_at.is_(None))
        filters.append(BookLending.due_date < date.today())
    elif status_filter == "returned":
        filters.append(BookLending.returned_at.is_not(None))

    total = await db.scalar(select(func.count()).select_from(BookLending).where(*filters))
    result = await db.execute(
        select(BookLending)
        .where(*filters)
        .options(
            selectinload(BookLending.book),
            selectinload(BookLending.child),
            selectinload(BookLending.lent_by),
        )
        .order_by(BookLending.borrowed_at.desc())
        .offset(skip)
        .limit(limit)
    )
    lendings = list(result.scalars().all())
    items = [await _lending_response(l, db) for l in lendings]
    return LendingListResponse(total=total or 0, items=items)


async def return_lending(
    lending_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> LendingResponse:
    lending = await db.scalar(
        select(BookLending)
        .where(
            BookLending.id == lending_id,
            BookLending.establishment_id == establishment_id,
        )
        .options(
            selectinload(BookLending.book),
            selectinload(BookLending.child),
            selectinload(BookLending.lent_by),
        )
    )
    if not lending:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.library.lending_not_found")
        )
    if lending.returned_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.library.already_returned"),
        )
    lending.returned_at = date.today()
    await db.flush()
    await db.refresh(lending)
    return await _lending_response(lending, db)


# ── Rappels ─────────────────────────────────────────────────────
async def _notify_parent(db: AsyncSession, parent: User, items: list[dict]) -> None:
    """Rappel au parent : email best-effort + message injecté dans sa conversation
    admin↔parent (via le chemin admin — la messagerie est hors-RBAC)."""
    locale = coerce_locale(parent.locale)
    try:
        await library_email.send_due_reminder_email(
            to=parent.email,
            parent_first_name=parent.first_name,
            items=items,
            locale=locale,
        )
    except Exception:  # noqa: BLE001 — best-effort (cf. docstring du module)
        logger.exception(
            "Échec d'envoi de l'email de rappel de bibliothèque vers %s", parent.email
        )

    if not parent.establishment_id:
        return
    admin = await _first_active_admin(db, parent.establishment_id)
    if admin is None:
        return
    try:
        from app.modules.messaging.service import (
            get_or_create_own_conversation,
            send_message,
        )

        conversation = await get_or_create_own_conversation(parent, db)
        lines = [t("conversations.library_reminder.intro", locale)]
        for item in items:
            overdue_part = ""
            if item["status"] == "overdue":
                days = item["overdue_days"]
                # Accord porté par deux clés distinctes plutôt que par un
                # « s » ajouté en Python : la règle de pluriel appartient à
                # la langue, pas au code appelant.
                suffix = "one" if days <= 1 else "many"
                overdue_part = t(
                    f"conversations.library_reminder.overdue_{suffix}",
                    locale,
                    days=days,
                )
            lines.append(
                t(
                    "conversations.library_reminder.line",
                    locale,
                    book=item["book_title"],
                    child=item["child_name"],
                    due_date=item["due_date"],
                    overdue=overdue_part,
                )
            )
        await send_message(
            conversation=conversation, sender=admin, body="\n".join(lines), db=db
        )
    except Exception:  # noqa: BLE001 — best-effort
        logger.exception("Échec d'injection du rappel de bibliothèque en messagerie")


async def send_due_reminders(
    establishment_id: uuid.UUID, db: AsyncSession
) -> ReminderResultResponse:
    """Rappelle (email + messagerie admin↔parent) tous les prêts en cours de
    l'établissement dont l'échéance approche ou est dépassée, sauf ceux déjà
    rappelés aujourd'hui."""
    settings = await get_or_create_library_settings(establishment_id, db)
    if not settings.reminders_enabled:
        return ReminderResultResponse(reminded_parents=0, reminded_lendings=0)

    cutoff = date.today() + timedelta(days=settings.reminder_days_before)
    result = await db.execute(
        select(BookLending)
        .where(
            BookLending.establishment_id == establishment_id,
            BookLending.returned_at.is_(None),
            BookLending.due_date <= cutoff,
            or_(
                BookLending.last_reminded_on.is_(None),
                BookLending.last_reminded_on < date.today(),
            ),
        )
        .options(
            selectinload(BookLending.book),
            selectinload(BookLending.child).selectinload(Child.parents),
        )
        .order_by(BookLending.due_date.asc())
    )
    lendings = list(result.scalars().all())
    if not lendings:
        return ReminderResultResponse(reminded_parents=0, reminded_lendings=0)

    by_parent: dict[uuid.UUID, User] = {}
    items_by_parent: dict[uuid.UUID, list[dict]] = {}
    for lending in lendings:
        status_enum, overdue_days = _lending_status(lending)
        for parent in lending.child.parents:
            if not parent.is_active:
                continue
            by_parent[parent.id] = parent
            items_by_parent.setdefault(parent.id, []).append(
                {
                    "child_name": _child_full_name(lending.child),
                    "book_title": lending.book.title,
                    "due_date": lending.due_date.isoformat(),
                    "status": status_enum,
                    "overdue_days": overdue_days if status_enum == LendingStatus.overdue else 0,
                }
            )

    for parent_id, parent in by_parent.items():
        await _notify_parent(db, parent, items_by_parent[parent_id])

    # Anti-doublon : un rappel par prêt et par jour (Celery quotidienne +
    # rappels manuels répétés ne spamment pas)
    today = date.today()
    for lending in lendings:
        lending.last_reminded_on = today
    await db.flush()

    return ReminderResultResponse(
        reminded_parents=len(by_parent), reminded_lendings=len(lendings)
    )


# ── Consultation parent ─────────────────────────────────────────
async def list_parent_books(
    parent: User, db: AsyncSession, *, skip: int = 0, limit: int = 50
) -> BookListResponse:
    child_ids = [c.id for c in parent.assigned_children]
    if not child_ids:
        return BookListResponse(total=0, items=[])
    sections_subq = (
        select(Section.id)
        .join(Child, Child.section_id == Section.id)
        .where(Child.id.in_(child_ids))
        .scalar_subquery()
    )
    base_filters = [
        Book.establishment_id == parent.establishment_id,
        Book.is_active.is_(True),
        Book.sections.any(Section.id.in_(sections_subq)),
    ]
    total = await db.scalar(select(func.count()).select_from(Book).where(*base_filters))
    result = await db.execute(
        select(Book)
        .where(*base_filters)
        .options(selectinload(Book.sections))
        .order_by(Book.title.asc())
        .offset(skip)
        .limit(limit)
    )
    books = list(result.scalars().all())
    open_counts = await _open_lending_counts(db, [b.id for b in books])
    items = [_book_response(b, open_counts) for b in books]
    return BookListResponse(total=total or 0, items=items)


async def list_parent_lendings(
    parent: User, db: AsyncSession, *, skip: int = 0, limit: int = 50
) -> LendingListResponse:
    child_ids = [c.id for c in parent.assigned_children]
    if not child_ids:
        return LendingListResponse(total=0, items=[])
    base_filters = [
        BookLending.establishment_id == parent.establishment_id,
        BookLending.child_id.in_(child_ids),
    ]
    total = await db.scalar(
        select(func.count()).select_from(BookLending).where(*base_filters)
    )
    result = await db.execute(
        select(BookLending)
        .where(*base_filters)
        .options(
            selectinload(BookLending.book),
            selectinload(BookLending.child),
            selectinload(BookLending.lent_by),
        )
        .order_by(BookLending.borrowed_at.desc())
        .offset(skip)
        .limit(limit)
    )
    lendings = list(result.scalars().all())
    items = [await _lending_response(l, db) for l in lendings]
    return LendingListResponse(total=total or 0, items=items)


# ── Consultation éducatrice (livres de la section de ses groupes) ──
async def _educator_section_ids(educator_id: uuid.UUID, db: AsyncSession) -> list[uuid.UUID]:
    result = await db.execute(
        select(Group.section_id).where(
            Group.educatrice_id == educator_id, Group.is_active.is_(True)
        )
    )
    return list(result.scalars().all())


async def list_educator_books(
    educator: User, db: AsyncSession, *, skip: int = 0, limit: int = 50
) -> BookListResponse:
    section_ids = await _educator_section_ids(educator.id, db)
    if not section_ids:
        return BookListResponse(total=0, items=[])
    base_filters = [
        Book.establishment_id == educator.establishment_id,
        Book.is_active.is_(True),
        Book.sections.any(Section.id.in_(section_ids)),
    ]
    total = await db.scalar(select(func.count()).select_from(Book).where(*base_filters))
    result = await db.execute(
        select(Book)
        .where(*base_filters)
        .options(selectinload(Book.sections))
        .order_by(Book.title.asc())
        .offset(skip)
        .limit(limit)
    )
    books = list(result.scalars().all())
    open_counts = await _open_lending_counts(db, [b.id for b in books])
    items = [_book_response(b, open_counts) for b in books]
    return BookListResponse(total=total or 0, items=items)