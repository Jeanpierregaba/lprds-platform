"""
Annuaire de l'établissement — la porte UNIQUE des sélecteurs de personnes et
de périmètres.

⚠️ **Pourquoi ce module existe.** Neuf écrans avaient besoin de nommer une
personne ou une unité gérée par un AUTRE module, et appelaient donc son
endpoint de liste : l'onglet des badges QR appelait `/children` et `/staff`,
l'écran des prêts `/children`, les filtres de galerie les trois. Deux
conséquences, et la seconde est celle qui a été signalée :

  • chacun de ces appels exige la permission du module VISÉ. Une assistante de
    direction à qui l'établissement avait confié les présences ne pouvait pas
    imprimer un badge : le sélecteur appelait `children:read`, qu'elle n'avait
    pas, et la liste restait vide — sans un mot d'explication ;
  • pour imprimer un nom sur une carte, l'écran téléchargeait la fiche
    complète de l'enfant, dossier médical compris.

Les élargir un par un aurait créé le couplage caché que le projet refuse
explicitement ailleurs (« `gallery:read` n'implique pas `reports:read` »).
L'annuaire sépare donc les deux questions : **de quoi ai-je besoin pour
remplir une liste déroulante** (un nom, un matricule, un rattachement) et
**de quoi ai-je besoin pour ouvrir un dossier** (la permission du module).

Chaque liste est autorisée par un OU sur les permissions dont le geste a
RÉELLEMENT besoin de choisir une personne. Les listes sont longues et c'est
voulu : elles sont lisibles, et `blog:write` n'y figure pas — rédiger une
actualité ne demande pas de connaître l'effectif.
"""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import User
from app.modules.directory import service
from app.modules.directory.schemas import (
    DirectoryChildrenResponse,
    DirectoryStaffResponse,
    DirectoryUnitsResponse,
)
from app.modules.rbac.dependencies import require_any_permission
from app.modules.rbac.models import PermissionCode as P

router = APIRouter(prefix="/directory", tags=["directory"])

# Choisir un ENFANT : fiches, présences (badges, corrections, tableaux de
# bord, export), rapports, prêts de la bibliothèque, filtres de galerie.
# `attendance:scan` est absent : un scan présente un badge, il ne choisit
# personne dans une liste.
_pick_child = require_any_permission(
    P.CHILDREN_READ, P.CHILDREN_WRITE,
    P.ATTENDANCE_READ, P.ATTENDANCE_QRCODE, P.ATTENDANCE_CORRECT,
    P.REPORTS_READ, P.REPORTS_WRITE, P.REPORTS_VALIDATE,
    P.LIBRARY_READ, P.LIBRARY_LEND,
    P.GALLERY_READ,
)

# Choisir un MEMBRE DU PERSONNEL : comptes, badges et corrections, horaires
# personnalisés et exemptions (paramètres), désignation d'une éducatrice à la
# tête d'un groupe, filtre d'auteur dans la galerie.
_pick_staff = require_any_permission(
    P.STAFF_READ, P.STAFF_WRITE,
    P.ATTENDANCE_READ, P.ATTENDANCE_QRCODE, P.ATTENDANCE_CORRECT, P.ATTENDANCE_WRITE,
    P.ORGANIZATION_WRITE,
    P.GALLERY_READ,
)

# Choisir un PÉRIMÈTRE (département, section) : presque tous les écrans de
# liste en proposent un filtre.
_pick_unit = require_any_permission(
    P.ORGANIZATION_READ, P.ORGANIZATION_WRITE,
    P.CHILDREN_READ, P.CHILDREN_WRITE,
    P.ATTENDANCE_READ, P.ATTENDANCE_CORRECT, P.ATTENDANCE_WRITE,
    P.REPORTS_READ, P.REPORTS_WRITE, P.REPORTS_VALIDATE,
    P.MENUS_READ, P.MENUS_WRITE,
    P.LIBRARY_READ, P.LIBRARY_WRITE,
    P.GALLERY_READ,
)


@router.get("/children", response_model=DirectoryChildrenResponse)
async def list_children(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_pick_child),
    search: str | None = Query(default=None, max_length=100),
    section_id: uuid.UUID | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> DirectoryChildrenResponse:
    """Nom, matricule, section — jamais la fiche."""
    return await service.list_children(
        user.establishment_id, db,
        search=search, section_id=section_id,
        include_inactive=include_inactive, skip=skip, limit=limit,
    )


@router.get("/staff", response_model=DirectoryStaffResponse)
async def list_staff(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_pick_staff),
    search: str | None = Query(default=None, max_length=100),
    staff_type: str | None = Query(default=None, max_length=50),
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> DirectoryStaffResponse:
    """Surnom (le nom affiché partout), matricule, poste."""
    return await service.list_staff(
        user.establishment_id, db,
        search=search, staff_type=staff_type,
        include_inactive=include_inactive, skip=skip, limit=limit,
    )


@router.get("/units", response_model=DirectoryUnitsResponse)
async def list_units(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_pick_unit),
    include_inactive: bool = Query(default=False),
) -> DirectoryUnitsResponse:
    """Départements, sections et groupes, pour les filtres de périmètre."""
    return await service.list_units(
        user.establishment_id, db, include_inactive=include_inactive
    )
