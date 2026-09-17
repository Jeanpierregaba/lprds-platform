import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel

from app.modules.reports.models import ReportType


class GallerySource(StrEnum):
    REPORT       = "report"
    MESSAGE      = "message"
    ANNOUNCEMENT = "announcement"


class UserBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:         uuid.UUID
    first_name: str
    last_name:  str
    nickname:   str | None = None


class ChildBrief(BaseModel):
    model_config = {"from_attributes": True}

    id:          uuid.UUID
    matricule:   str
    last_name:   str
    first_names: str


class GalleryMediaItem(BaseModel):
    id:           uuid.UUID
    source:       GallerySource
    filename:     str
    content_type: str
    size_bytes:   int
    uploaded_by:  UserBrief
    created_at:   datetime
    # Chemin de téléchargement authentifié — toujours celui du module d'origine
    # (reports/messaging), jamais une URL de stockage brute ni un endpoint
    # dupliqué : la galerie ne fait qu'agréger, jamais ne re-sert de fichiers.
    url:          str

    # Présents seulement si source == "report"
    child:       ChildBrief | None = None
    report_type: ReportType | None = None

    # Présent seulement si source == "message", vue admin (le parent n'a pas
    # besoin qu'on lui rappelle qu'il s'agit de sa propre conversation)
    conversation_parent: UserBrief | None = None

    # Présents seulement si source == "announcement" (la diffusion d'origine —
    # jamais liée à un enfant précis, mais utile pour regrouper l'affichage)
    announcement_id: uuid.UUID | None = None
    announcement_title: str | None = None


class GalleryMediaListResponse(BaseModel):
    total: int
    items: list[GalleryMediaItem]
