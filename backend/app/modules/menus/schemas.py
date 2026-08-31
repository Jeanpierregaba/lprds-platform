import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class UserBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:         uuid.UUID
    first_name: str
    last_name:  str
    nickname:   str | None = None


class DayMenu(BaseModel):
    """Les 4 créneaux d'une journée, dans l'ordre réel des repas — tous
    facultatifs (remplissage progressif au fil de la semaine), mais pas de
    chaîne vide (min_length=1 si fourni)."""

    collation: str | None = Field(default=None, min_length=1)
    dejeuner:  str | None = Field(default=None, min_length=1)
    dessert:   str | None = Field(default=None, min_length=1)
    gouter:    str | None = Field(default=None, min_length=1)


class MenuWriteRequest(BaseModel):
    """
    Corps de PATCH — remplace `content` en entier, comme pour les rapports :
    pas de fusion partielle implicite, le frontend recharge, édite localement,
    renvoie la semaine complète. `week_start` n'y figure pas : il identifie
    déjà la ressource dans l'URL.
    """

    monday:    DayMenu = Field(default_factory=DayMenu)
    tuesday:   DayMenu = Field(default_factory=DayMenu)
    wednesday: DayMenu = Field(default_factory=DayMenu)
    thursday:  DayMenu = Field(default_factory=DayMenu)
    friday:    DayMenu = Field(default_factory=DayMenu)


class MenuCreateRequest(MenuWriteRequest):
    week_start: date


class MenuResponse(BaseModel):
    id:               uuid.UUID
    establishment_id: uuid.UUID
    week_start:       date
    week_end:         date  # vendredi — calculé, jamais saisi

    monday:    DayMenu
    tuesday:   DayMenu
    wednesday: DayMenu
    thursday:  DayMenu
    friday:    DayMenu

    created_by: UserBrief
    updated_by: UserBrief | None
    created_at: datetime
    updated_at: datetime


class MenuListItem(BaseModel):
    id:         uuid.UUID
    week_start: date
    week_end:   date
    updated_at: datetime


class MenuListResponse(BaseModel):
    total: int
    items: list[MenuListItem]
