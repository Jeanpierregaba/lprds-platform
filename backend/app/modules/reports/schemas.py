import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field, model_validator

from app.modules.reports.models import (
    AcquisitionLevel,
    BehaviorTag,
    ClassBehavior,
    EmotionManagement,
    HealthStatus,
    MealAmount,
    Mood,
    PeerRelation,
    ReportType,
)


# ── Paramètres département ───────────────────────────────────────
class DepartmentReportTypeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id:            uuid.UUID
    department_id: uuid.UUID
    report_type:   ReportType
    created_at:    datetime


# ── Briques communes ──────────────────────────────────────────────
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


class ReportAttachmentResponse(BaseModel):
    id:           uuid.UUID
    filename:     str
    content_type: str
    size_bytes:   int
    uploaded_by:  UserBrief
    created_at:   datetime
    # Chemin de téléchargement authentifié — jamais servi en statique.
    url:          str


# ── Contenu structuré : rapport QUOTIDIEN ─────────────────────────
class DailyReportContent(BaseModel):
    """Contenu du rapport quotidien — validé explicitement contre ce schéma
    (pas de `content: dict` ouvert), comme pour bi_mensuel/annuel ci-dessous."""

    # Horaires : pré-remplis depuis le scan de présence si non fournis
    # (cf. service.py) — restent éditables dans les deux cas.
    arrival_time:   time | None = None
    departure_time: time | None = None

    health_status:         HealthStatus
    temperature_arrival:   float | None = Field(default=None, ge=30, le=43)
    temperature_departure: float | None = Field(default=None, ge=30, le=43)
    health_notes:           str | None = None

    breakfast: MealAmount
    lunch:     MealAmount
    snack:     MealAmount

    nap: bool
    nap_duration_minutes: int | None = Field(default=None, ge=0, le=600)

    bath: bool
    poop: bool

    moods: list[Mood] = Field(min_length=1)
    # Liste d'activités saisie une par une côté frontend (input + bouton « + »)
    # — plus un simple champ texte libre. Nettoyée (espaces, vides) ci-dessous.
    activities: list[str] = Field(min_length=1)
    behaviors: list[BehaviorTag] = Field(min_length=1)
    highlight: str | None = None  # petit fait marquant — facultatif

    @model_validator(mode="after")
    def _check_nap(self) -> "DailyReportContent":
        if self.nap and self.nap_duration_minutes is None:
            raise ValueError("La durée de la sieste est requise si sieste = oui")
        if not self.nap and self.nap_duration_minutes is not None:
            raise ValueError("Pas de durée de sieste à renseigner si sieste = non")
        return self

    @model_validator(mode="after")
    def _dedupe_lists(self) -> "DailyReportContent":
        # Des cases cochées deux fois ne doivent pas produire de doublons.
        self.moods = list(dict.fromkeys(self.moods))
        self.behaviors = list(dict.fromkeys(self.behaviors))
        # Activités : espaces rognés, entrées vides écartées, au moins une
        # activité réelle exigée (un ["  "] ne doit pas passer la validation).
        cleaned = [a.strip() for a in self.activities if a.strip()]
        if not cleaned:
            raise ValueError("Au moins une activité est requise")
        self.activities = cleaned
        return self


# ── Contenu structuré : rapport BI_MENSUEL ────────────────────────
class BiMensuelReportContent(BaseModel):
    """
    Contenu du rapport bi-mensuel. Les dates de début/fin ne sont PAS des
    champs de ce contenu : elles correspondent à `period_start`/`period_end`
    du rapport, déjà calculées automatiquement (découpage 1–15 / 16–fin de
    mois) — les dupliquer ici créerait une seconde source de vérité pouvant
    diverger de la période réelle.
    """

    # 1. Activités & apprentissages
    oral_written_language: str = Field(min_length=1)
    physical_activities:   str = Field(min_length=1)
    artistic_activities:   str = Field(min_length=1)
    math_foundations:      str = Field(min_length=1)
    world_exploration:     str = Field(min_length=1)
    english:                str = Field(min_length=1)

    # 2. Comportement & attitude en classe
    class_behaviors: list[ClassBehavior] = Field(min_length=1)

    # 3. Relation avec les autres
    peer_relations: list[PeerRelation] = Field(min_length=1)

    # 4. Gestion des émotions
    emotion_management: list[EmotionManagement] = Field(min_length=1)

    # 5. Photos & vidéo de la période — pas un champ de contenu : gérées via
    # les pièces jointes du rapport (POST /reports/{id}/attachments), pattern
    # déjà générique, valable pour tous les types de rapport.

    # 6. Observations de l'enseignante
    teacher_observations: str = Field(min_length=1)

    @model_validator(mode="after")
    def _dedupe_lists(self) -> "BiMensuelReportContent":
        self.class_behaviors = list(dict.fromkeys(self.class_behaviors))
        self.peer_relations = list(dict.fromkeys(self.peer_relations))
        self.emotion_management = list(dict.fromkeys(self.emotion_management))
        return self


# ── Contenu structuré : rapport ANNUEL ────────────────────────────
class DomainAssessment(BaseModel):
    """Une ligne du bulletin annuel : notation + observation de l'éducatrice
    pour un domaine donné."""

    rating:      AcquisitionLevel
    observation: str = Field(min_length=1)


class AnnualReportContent(BaseModel):
    """
    Contenu du rapport annuel — bulletin par domaine, chacun noté
    (Acquis / En cours d'acquisition / A consolider) et commenté. Comme pour
    bi_mensuel, les dates de la période ne sont pas des champs de contenu :
    elles correspondent à `period_start`/`period_end` (année civile complète,
    cf. `_period_for`). Photos/vidéo : mécanisme générique de pièces jointes,
    déjà en place.
    """

    oral_written_language: DomainAssessment  # Développement et structuration du langage oral et écrit
    physical_activities:   DomainAssessment  # Agir, s'exprimer, comprendre à travers les activités physiques
    artistic_activities:   DomainAssessment  # Agir, s'exprimer, comprendre à travers les activités artistiques
    math_foundations:      DomainAssessment  # L'acquisition des premiers outils mathématiques
    world_exploration:     DomainAssessment  # Explorer le monde
    english:                DomainAssessment  # Anglais


class ReportVocabularyResponse(BaseModel):
    """Libellés français des listes déroulantes / cases à cocher — pour que le
    frontend construise le formulaire sans dupliquer ce vocabulaire. Construite
    explicitement en service.py (pas de valeurs par défaut ici)."""

    health_status: dict[str, str]
    meal_amount:   dict[str, str]
    mood:          dict[str, str]
    behavior_tag:  dict[str, str]
    class_behavior:     dict[str, str]
    peer_relation:      dict[str, str]
    emotion_management: dict[str, str]
    acquisition_level:  dict[str, str]


# ── Rapports ────────────────────────────────────────────────────
class ReportCreateRequest(BaseModel):
    child_id:    uuid.UUID
    report_type: ReportType
    # Date de référence pour calculer la période ("Date du rapport" pour un
    # quotidien) — par défaut aujourd'hui. Permet un rapport rétroactif.
    reference_date: date | None = None
    # Optionnel pour les 3 types : `content` structuré porte toute
    # l'information (cf. service.py pour la validation par type).
    summary: str | None = Field(default=None, min_length=1)
    content: dict = Field(default_factory=dict)


class ReportUpdateRequest(BaseModel):
    summary: str | None = Field(default=None, min_length=1)
    content: dict | None = None


class ReportRejectRequest(BaseModel):
    reason: str = Field(min_length=1)


class ReportListItem(BaseModel):
    id:               uuid.UUID
    child:            ChildBrief
    report_type:      ReportType
    period_start:     date
    period_end:       date
    period_label:     str
    status:           str
    created_by:       UserBrief
    submitted_at:     datetime | None
    validated_at:     datetime | None
    created_at:       datetime
    updated_at:       datetime


class ReportListResponse(BaseModel):
    total: int
    items: list[ReportListItem]


class ReportResponse(ReportListItem):
    establishment_id: uuid.UUID
    department_id:    uuid.UUID
    group_id:         uuid.UUID | None
    summary:          str | None
    content:          dict
    validated_by:     UserBrief | None
    rejected_reason:  str | None
    attachments:      list[ReportAttachmentResponse] = []


# ── Portail parent ──────────────────────────────────────────────
class ParentReportListItem(BaseModel):
    """Vue parent : ni le workflow interne (rejet, validateur), ni le contenu
    brut en liste — juste de quoi choisir quel rapport ouvrir."""

    id:            uuid.UUID
    child:         ChildBrief
    report_type:   ReportType
    period_label:  str
    validated_at:  datetime | None
    is_read:       bool


class ParentReportListResponse(BaseModel):
    total: int
    items: list[ParentReportListItem]


class ParentReportDetailResponse(BaseModel):
    id:            uuid.UUID
    child:         ChildBrief
    report_type:   ReportType
    period_start:  date
    period_end:    date
    period_label:  str
    summary:       str | None
    content:       dict
    validated_at:  datetime | None
    is_read:       bool
    attachments:   list[ReportAttachmentResponse] = []
