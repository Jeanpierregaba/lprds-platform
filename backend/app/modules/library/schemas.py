import uuid
from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class BookCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    author: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    # Fourni = correction humaine : elle part en mémoire de traduction et la
    # machine ne la réécrit pas tant que le français ne bouge pas.
    description_en: str | None = Field(default=None, max_length=1000)
    total_quantity: int = Field(default=1, ge=1, le=1000)
    # Sections de l'établissement où le livre est accessible aux enfants.
    section_ids: list[uuid.UUID] = Field(default_factory=list)


class BookUpdateRequest(BaseModel):
    # None = inchangé sur un PATCH (semantics : champ absent), comme partout
    # ailleurs dans l'application.
    title: str | None = Field(default=None, min_length=1, max_length=200)
    author: str | None = Field(default=None, min_length=1, max_length=200)
    # "" (chaîne vide) efface la description ; None = inchangé.
    description: str | None = Field(default=None, max_length=1000)
    description_en: str | None = Field(default=None, max_length=1000)
    total_quantity: int | None = Field(default=None, ge=1, le=1000)
    # "[]" vide toutes les sections ; None = inchangé.
    section_ids: list[uuid.UUID] | None = Field(default=None)
    is_active: bool | None = None


class SectionBrief(BaseModel):
    id: uuid.UUID
    name: str


class BookResponse(BaseModel):
    id: uuid.UUID
    establishment_id: uuid.UUID
    title: str
    author: str
    description: str | None
    # Exposée à côté du français pour l'écran de gestion : l'admin édite la
    # source et corrige l'anglais sans les confondre. Les portails parent et
    # éducateur, eux, reçoivent `description` DÉJÀ dans la langue du lecteur.
    description_en: str | None = None
    total_quantity: int
    # total_quantity - prêts en cours (jamais négatif, borné en service)
    available_quantity: int
    is_active: bool
    sections: list[SectionBrief]
    created_at: datetime
    updated_at: datetime


class BookListResponse(BaseModel):
    total: int
    items: list[BookResponse]


class LendingCreateRequest(BaseModel):
    book_id: uuid.UUID
    child_id: uuid.UUID
    # Défaut : aujourd'hui (serveur). Jamais dans le futur.
    borrowed_at: date | None = None
    # Défaut : borrowed_at + settings.default_loan_days.
    due_date: date | None = None


class LendingStatus(StrEnum):
    active = "active"      # prêt en cours, échéance pas encore dépassée
    overdue = "overdue"    # prêt en cours, échéance dépassée
    returned = "returned"  # rendu


class LendingResponse(BaseModel):
    id: uuid.UUID
    establishment_id: uuid.UUID
    book_id: uuid.UUID
    book_title: str
    author: str
    child_id: uuid.UUID
    child_name: str
    child_matricule: str
    lent_by_id: uuid.UUID
    lent_by_name: str
    borrowed_at: date
    due_date: date
    returned_at: date | None
    status: LendingStatus
    overdue_days: int | None


class LendingListResponse(BaseModel):
    total: int
    items: list[LendingResponse]


class LibrarySettingsResponse(BaseModel):
    reminders_enabled: bool
    reminder_days_before: int
    default_loan_days: int


class LibrarySettingsUpdateRequest(BaseModel):
    reminders_enabled: bool | None = None
    reminder_days_before: int | None = Field(default=None, ge=0, le=90)
    default_loan_days: int | None = Field(default=None, ge=1, le=365)


class ReminderResultResponse(BaseModel):
    reminded_parents: int
    reminded_lendings: int