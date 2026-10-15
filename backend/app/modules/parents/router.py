import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.models import User
from app.modules.parents import service
from app.modules.parents.dependencies import get_parent as get_current_parent
from app.modules.parents.schemas import (
    ChildBrief,
    InvitationResendRequest,
    ParentCreateRequest,
    ParentListResponse,
    ParentPasswordResetRequest,
    ParentResponse,
    ParentUpdateRequest,
)
from app.modules.rbac.dependencies import require_permission
from app.modules.rbac.models import PermissionCode

router = APIRouter(prefix="/parents", tags=["parents"])


# ── Portail parent ────────────────────────────────────────────────
@router.get("/me/children", response_model=list[ChildBrief])
async def list_my_children(
    parent: User = Depends(get_current_parent),
) -> list[ChildBrief]:
    """
    Enfants assignés au compte parent connecté — seule source frontend pour
    peupler un sélecteur d'enfant (Rapports/Galerie), le reste du module
    /parents étant réservé à parents:read/write (admin). `assigned_children`
    est chargé en lazy="selectin" sur User, aucune requête supplémentaire.
    """
    return [ChildBrief.model_validate(c) for c in parent.assigned_children]


@router.post("", response_model=ParentResponse, status_code=status.HTTP_201_CREATED)
async def create_parent(
    payload: ParentCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.PARENTS_WRITE)),
) -> ParentResponse:
    """Crée un compte parent et lui envoie ses identifiants par email."""
    return await service.create_parent(payload, current_user.establishment_id, db)


@router.get("", response_model=ParentListResponse)
async def list_parents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.PARENTS_READ)),
    search: str | None = Query(default=None, description="Nom, surnom ou email"),
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ParentListResponse:
    return await service.list_parents(
        current_user.establishment_id,
        db,
        search=search,
        include_inactive=include_inactive,
        skip=skip,
        limit=limit,
    )


@router.get("/{parent_id}", response_model=ParentResponse)
async def get_parent(
    parent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.PARENTS_READ)),
) -> ParentResponse:
    return await service.get_parent(parent_id, current_user.establishment_id, db)


@router.patch("/{parent_id}", response_model=ParentResponse)
async def update_parent(
    parent_id: uuid.UUID,
    payload: ParentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.PARENTS_WRITE)),
) -> ParentResponse:
    """Modifie les informations d'un parent (email inclus)."""
    return await service.update_parent(
        parent_id, payload, current_user.establishment_id, db
    )


@router.post("/{parent_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_parent_password(
    parent_id: uuid.UUID,
    payload: ParentPasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.PARENTS_WRITE)),
) -> None:
    """
    Réinitialise le mot de passe : le nouveau mot de passe fourni est envoyé au
    parent par email. Le parent n'a pas à le redéfinir.
    """
    await service.reset_parent_password(
        parent_id, payload.new_password, current_user.establishment_id, db
    )

@router.post("/{parent_id}/resend-invitation", status_code=status.HTTP_204_NO_CONTENT)
async def resend_parent_invitation(
    parent_id: uuid.UUID,
    payload: InvitationResendRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.PARENTS_WRITE)),
) -> None:
    """Renvoie l'email de bienvenue avec un mot de passe NEUF.

    ⚠️ **Aucun mot de passe en réponse**, et c'est la règle qui n'a pas bougé :
    un secret généré par la plateforme ne traverse pas une réponse HTTP. Le
    corps est optionnel — si l'admin FOURNIT le mot de passe, il sait déjà ce
    qu'il a saisi (son écran peut donc le lui faire copier pour le transmettre
    par un autre canal), et rien ne circule en retour. Sans corps, le mot de
    passe est généré et n'existe que dans l'email, comme avant.
    """
    await service.resend_parent_invitation(
        parent_id,
        current_user.establishment_id,
        db,
        password=payload.password if payload else None,
    )
