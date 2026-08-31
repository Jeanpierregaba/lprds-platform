import uuid

from fastapi import APIRouter, Depends, Query

from app.core.database import AsyncSession, get_db
from app.modules.auth.dependencies import require_roles
from app.modules.auth.models import User, UserRole
from app.modules.library import service as library_service
from app.modules.library.dependencies import (
    get_educator,
    require_library_admin,
)
from app.modules.library.schemas import (
    BookCreateRequest,
    BookListResponse,
    BookResponse,
    BookUpdateRequest,
    LendingCreateRequest,
    LendingListResponse,
    LendingResponse,
    LibrarySettingsResponse,
    LibrarySettingsUpdateRequest,
    ReminderResultResponse,
)
from app.modules.reports.dependencies import get_parent

router = APIRouter(prefix="/library", tags=["library"])


# ── Paramètres (admin uniquement) ───────────────────────────────
@router.get("/settings", response_model=LibrarySettingsResponse)
async def get_settings(
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> LibrarySettingsResponse:
    return await library_service.get_library_settings(current_user.establishment_id, db)


@router.put("/settings", response_model=LibrarySettingsResponse)
async def update_settings(
    payload: LibrarySettingsUpdateRequest,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> LibrarySettingsResponse:
    return await library_service.update_library_settings(
        current_user.establishment_id, payload, db
    )


# ── Catalogue ───────────────────────────────────────────────────
@router.post("/books", response_model=BookResponse, status_code=201)
async def create_book(
    payload: BookCreateRequest,
    current_user: User = Depends(require_library_admin),
    db: AsyncSession = Depends(get_db),
) -> BookResponse:
    return await library_service.create_book(
        current_user.establishment_id, payload, db
    )


@router.get("/books", response_model=BookListResponse)
async def list_books(
    section_id: uuid.UUID | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(require_library_admin),
    db: AsyncSession = Depends(get_db),
) -> BookListResponse:
    return await library_service.list_books(
        current_user.establishment_id,
        db,
        section_id=section_id,
        include_inactive=include_inactive,
        skip=skip,
        limit=limit,
    )


@router.get("/books/{book_id}", response_model=BookResponse)
async def get_book(
    book_id: uuid.UUID,
    current_user: User = Depends(require_library_admin),
    db: AsyncSession = Depends(get_db),
) -> BookResponse:
    return await library_service.get_book(book_id, current_user.establishment_id, db)


@router.patch("/books/{book_id}", response_model=BookResponse)
async def update_book(
    book_id: uuid.UUID,
    payload: BookUpdateRequest,
    current_user: User = Depends(require_library_admin),
    db: AsyncSession = Depends(get_db),
) -> BookResponse:
    return await library_service.update_book(
        book_id, current_user.establishment_id, payload, db
    )


@router.delete("/books/{book_id}", response_model=BookResponse)
async def deactivate_book(
    book_id: uuid.UUID,
    current_user: User = Depends(require_library_admin),
    db: AsyncSession = Depends(get_db),
) -> BookResponse:
    return await library_service.deactivate_book(
        book_id, current_user.establishment_id, db
    )


# ── Prêts & retours ─────────────────────────────────────────────
@router.post("/lendings", response_model=LendingResponse, status_code=201)
async def create_lending(
    payload: LendingCreateRequest,
    current_user: User = Depends(require_library_admin),
    db: AsyncSession = Depends(get_db),
) -> LendingResponse:
    return await library_service.create_lending(
        current_user.establishment_id, payload, current_user, db
    )


@router.get("/lendings", response_model=LendingListResponse)
async def list_lendings(
    book_id: uuid.UUID | None = Query(default=None),
    child_id: uuid.UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(require_library_admin),
    db: AsyncSession = Depends(get_db),
) -> LendingListResponse:
    return await library_service.list_lendings(
        current_user.establishment_id,
        db,
        book_id=book_id,
        child_id=child_id,
        status_filter=status_filter,
        skip=skip,
        limit=limit,
    )


@router.post("/lendings/{lending_id}/return", response_model=LendingResponse)
async def return_lending(
    lending_id: uuid.UUID,
    current_user: User = Depends(require_library_admin),
    db: AsyncSession = Depends(get_db),
) -> LendingResponse:
    return await library_service.return_lending(
        lending_id, current_user.establishment_id, db
    )


# ── Rappels ─────────────────────────────────────────────────────
@router.post("/reminders/run", response_model=ReminderResultResponse)
async def run_reminders(
    current_user: User = Depends(require_library_admin),
    db: AsyncSession = Depends(get_db),
) -> ReminderResultResponse:
    return await library_service.send_due_reminders(
        current_user.establishment_id, db
    )


# ── Consultation parent ─────────────────────────────────────────
@router.get("/mine/books", response_model=BookListResponse)
async def my_books(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_parent),
    db: AsyncSession = Depends(get_db),
) -> BookListResponse:
    return await library_service.list_parent_books(current_user, db, skip=skip, limit=limit)


@router.get("/mine/lendings", response_model=LendingListResponse)
async def my_lendings(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_parent),
    db: AsyncSession = Depends(get_db),
) -> LendingListResponse:
    return await library_service.list_parent_lendings(
        current_user, db, skip=skip, limit=limit
    )


# ── Consultation éducatrice (livres de sa section) ──────────────
@router.get("/educator/books", response_model=BookListResponse)
async def educator_books(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_educator),
    db: AsyncSession = Depends(get_db),
) -> BookListResponse:
    return await library_service.list_educator_books(
        current_user, db, skip=skip, limit=limit
    )