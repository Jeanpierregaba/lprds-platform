import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import background, links, media, rate_limit, storage
from app.core.config import settings
from app.core.i18n import DEFAULT_LOCALE, Locale, coerce_locale, current_locale, t
from app.core.translation import TranslationUnavailable, translate_texts
from app.core.people import display_name as display_name_of
from app.modules.auth.models import User, UserRole
from app.modules.establishments.models import Establishment
from app.modules.messaging.email import send_announcement_email, send_message_email
from app.modules.children.models import Child
from app.modules.messaging.models import (
    Announcement,
    AnnouncementRead,
    AnnouncementSignature,
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
    AnnouncementRecipient,
    AnnouncementRecipientListResponse,
    AnnouncementResponse,
    AnnouncementSignRequest,
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

logger = logging.getLogger(__name__)


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
# ── Traduction des diffusions ────────────────────────────────────
async def _translate_announcement(announcement: Announcement, db: AsyncSession) -> None:
    """Remplit la version anglaise — best-effort, jamais bloquant.

    Une diffusion part à TOUS les parents de l'établissement, anglophones
    compris : la laisser en français revenait à ne pas les informer. Même
    politique que le blog et les menus — un échec n'empêche jamais l'envoi, il
    laisse simplement le parent anglophone lire le français.

    Pas de colonne de statut, à la différence des articles : la règle est celle
    des créneaux de menu. Une version anglaise fournie à la main est conservée
    tant que le texte FRANÇAIS ne bouge pas ; dès qu'il change, elle est
    refaite — garder la traduction d'un texte remplacé serait pire qu'un repli.
    """
    try:
        title_en, body_en = await translate_texts(
            [announcement.title, announcement.body], db
        )
    except TranslationUnavailable as exc:
        logger.info("Traduction de la diffusion %s non aboutie : %s", announcement.id, exc)
        return
    announcement.title_en = title_en[:200]
    announcement.body_en = body_en


def _localized_announcement(announcement: Announcement, locale: Locale) -> tuple[str, str]:
    """Titre et corps dans la langue du LECTEUR, repli champ par champ.

    Par champ et non par diffusion : si le titre est traduit mais pas le corps
    (ou l'inverse, après un échec partiel), on sert ce qui existe plutôt que de
    tout ramener au français.
    """
    if locale is DEFAULT_LOCALE:
        return announcement.title, announcement.body
    return (
        announcement.title_en or announcement.title,
        announcement.body_en or announcement.body,
    )


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
        requires_signature=payload.requires_signature,
    )
    await _translate_announcement(announcement, db)
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
        signature_count=0, department_ids=department_ids,
    )
    await publish_event(
        _announcements_channel(establishment_id),
        {"type": "announcement", **response.model_dump(mode="json")},
    )

    # Push : audience ciblée si départements cochés, sinon tous les parents.
    await send_push_to_establishment_parents(
        establishment_id,
        "push.announcement.title",
        None,
        db,
        # `url` : où le tapotement doit mener. Sans elle, le service worker
        # ouvre l'accueil et le destinataire doit retrouver l'information.
        {"type": "announcement", "announcement_id": str(announcement.id),
         "department_ids": [str(d) for d in department_ids],
         # Même destination que le bouton de l'email : la diffusion PRÉCISE,
         # pas l'onglet qui en contient trente.
         "url": links.url_path(
             links.PARENT_MESSAGING,
             **links.parent_announcement_query(announcement.id),
         )},
        parent_ids=audience,
        # Le titre part dans la langue de CHAQUE parent : une diffusion touche
        # tout l'établissement, et la notification est souvent la seule chose
        # qu'on lit d'elle.
        body_by_locale={
            str(DEFAULT_LOCALE): announcement.title,
            str(Locale.EN): announcement.title_en or announcement.title,
        },
    )

    # Email à l'audience — le seul canal qui n'exige du parent ni abonnement,
    # ni application installée, ni onglet ouvert (cf. `messaging/email.py`).
    await _notify_audience_by_email(announcement, audience, db)
    return response


async def _notify_audience_by_email(
    announcement: Announcement,
    audience: set[uuid.UUID],
    db: AsyncSession,
) -> None:
    """Prévient par email les parents destinataires de la diffusion.

    ⚠️ **L'audience est celle qui vient d'être calculée pour le compteur**, donc
    exactement les départements ciblés (ou tous les parents en broadcast). La
    recalculer ici serait une seconde implémentation de la règle de ciblage,
    libre de diverger — et un email parti à un département non concerné est
    précisément ce qu'un ciblage sert à éviter.

    ⚠️ **L'envoi part EN FOND, la requête ne l'attend pas.** `fastapi-mail`
    ouvre une connexion SMTP par message : à une demi-seconde l'unité, une
    diffusion à 150 parents tiendrait la publication plus d'une minute, et le
    reverse proxy la couperait (60 s par défaut) — l'admin verrait une erreur
    sur une diffusion pourtant publiée. Les destinataires sont donc lus ICI,
    pendant que la session existe, et l'envoi se fait ensuite sans base.
    """
    if not audience:
        return

    parents = (
        await db.execute(
            select(User).where(User.id.in_(audience), User.is_active.is_(True))
        )
    ).scalars().all()
    establishment_name = (
        await db.execute(
            select(Establishment.name).where(
                Establishment.id == announcement.establishment_id
            )
        )
    ).scalar_one_or_none() or ""

    destinataires = []
    for parent in parents:
        locale = coerce_locale(parent.locale)
        # Le titre dans la langue du DESTINATAIRE, comme le corps du push : un
        # parent anglophone ne doit pas recevoir un sujet français.
        title, _ = _localized_announcement(announcement, locale)
        destinataires.append((parent.email, parent.first_name, title, locale))
    if not destinataires:
        return

    background.spawn(
        _envoyer_emails_diffusion(
            destinataires,
            announcement_id=announcement.id,
            establishment_name=establishment_name,
            requires_signature=announcement.requires_signature,
        ),
        label=f"emails de diffusion {announcement.id}",
    )


async def _envoyer_emails_diffusion(
    destinataires: list[tuple[str, str, str, Locale]],
    *,
    announcement_id: uuid.UUID,
    establishment_name: str,
    requires_signature: bool,
) -> None:
    """Best-effort PAR DESTINATAIRE : un SMTP qui refuse une adresse ne doit pas
    priver les suivants de leur notification.

    Plus aucune session de base ici — tout ce qu'il faut a été lu avant, pendant
    la requête. Rien n'est remonté : la diffusion est publiée et consultable
    sans cet email.
    """
    for email, first_name, title, locale in destinataires:
        try:
            await send_announcement_email(
                to=email,
                parent_first_name=first_name,
                announcement_id=announcement_id,
                title=title,
                establishment_name=establishment_name,
                requires_signature=requires_signature,
                locale=locale,
            )
        except Exception:  # SMTP, rendu de template, réseau…
            logger.exception(
                "Échec d'envoi de la notification de diffusion à %s", email
            )


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
        signed = await _signatures_of_parent(current_user.id, db)
        items = [
            _announcement_response(
                a, is_read=a.id in read_ids, attachments=attachments_map.get(a.id),
                localized=True,
                department_ids=departments_map.get(a.id, []),
                is_signed=a.id in signed, signed_at=signed.get(a.id),
            )
            for a in announcements
        ]
    else:
        ids = {a.id for a in announcements}
        counts = await _read_counts(ids, db)
        # Signatures : on récupère les PAIRES (diffusion, parent) en une
        # requête, pas un simple compte — il faut les croiser avec l'audience
        # courante ci-dessous.
        signatures = await _signature_parent_ids(ids, db)
        # Audience par périmètre (broadcast vs chaque ciblage), mise en cache
        # car plusieurs diffusions partagent souvent le même périmètre.
        audiences: dict[tuple, set[uuid.UUID]] = {}
        items = []
        for a in announcements:
            scope = departments_map.get(a.id, [])
            key = tuple(sorted(scope))
            if key not in audiences:
                audiences[key] = await _audience_parent_ids(
                    establishment_id, scope or None, db
                )
            items.append(
                _announcement_response(
                    a, read_count=counts.get(a.id, 0),
                    total_parents=len(audiences[key]),
                    signature_count=len(
                        signatures.get(a.id, set()) & audiences[key]
                    ),
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.announcement_not_found"))
        read_ids = await _read_announcement_ids(current_user.id, db)
        signed = await _signatures_of_parent(current_user.id, db)
        return _announcement_response(
            announcement, is_read=announcement.id in read_ids, attachments=attachments,
            localized=True,
            department_ids=scope,
            is_signed=announcement.id in signed,
            signed_at=signed.get(announcement.id),
        )

    audience = await _audience_parent_ids(establishment_id, scope or None, db)
    counts = await _read_counts({announcement.id}, db)
    return _announcement_response(
        announcement, read_count=counts.get(announcement.id, 0),
        total_parents=len(audience), attachments=attachments, department_ids=scope,
        signature_count=await _signature_count(announcement.id, audience, db),
    )


async def update_announcement(
    announcement_id: uuid.UUID,
    payload: AnnouncementUpdateRequest,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> AnnouncementResponse:
    announcement = await _get_announcement_or_404(announcement_id, establishment_id, db)
    changes = payload.model_dump(exclude_unset=True)
    # La traduction suit le texte FRANÇAIS. Une version anglaise fournie dans
    # le même appel fait foi (correction) ; sinon, un français modifié est
    # retraduit, et un français inchangé garde sa traduction.
    text_changed = any(
        field in changes and changes[field] != getattr(announcement, field)
        for field in ("title", "body")
    )
    manual_en = changes.get("title_en") is not None or changes.get("body_en") is not None
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
        #
        # ⚠️ Les SIGNATURES, elles, ne sont jamais supprimées : une lecture est
        # un simple constat, une attestation est une preuve — on ne détruit pas
        # la seconde parce que le périmètre a bougé après coup. La cohérence du
        # compteur est obtenue autrement : `_signature_count` ne compte que les
        # signataires de l'audience COURANTE, donc il ne dépasse jamais le
        # total, et la ligne reste en base.
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
    if text_changed and not manual_en:
        await _translate_announcement(announcement, db)
    await db.flush()
    await db.refresh(announcement)

    scope = await _announcement_department_ids(announcement.id, db)
    audience = await _audience_parent_ids(establishment_id, scope or None, db)
    counts = await _read_counts({announcement.id}, db)
    return _announcement_response(
        announcement, read_count=counts.get(announcement.id, 0),
        total_parents=len(audience), department_ids=scope,
        signature_count=await _signature_count(announcement.id, audience, db),
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.announcement_not_found"))
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


async def sign_announcement(
    announcement_id: uuid.UUID,
    payload: AnnouncementSignRequest,
    parent: User,
    db: AsyncSession,
) -> AnnouncementResponse:
    """Le parent atteste avoir lu la diffusion.

    ⚠️ **Signer n'est pas idempotent, contrairement à marquer comme lu.** Un
    second appel renvoie 409 au lieu de rafraîchir la ligne : réécrire
    `signed_at` déplacerait la date d'une attestation déjà donnée, c'est-à-dire
    exactement ce qu'une attestation ne doit pas faire. Marquer lu, à
    l'inverse, est un constat qu'on peut reposer sans rien altérer.

    ⚠️ **Signer marque AUSSI comme lu.** Sans ça, un parent qui signe depuis la
    liste sans ouvrir le détail resterait « non lu mais signé » — un état
    absurde, et le compteur de lecture dirait moins que celui des signatures.
    """
    announcement = await _get_announcement_or_404(
        announcement_id, parent.establishment_id, db
    )
    # Hors périmètre, ou diffusion désactivée → 404 : dans les deux cas elle
    # n'existe pas pour ce parent (elle a disparu de son portail), et on ne
    # révèle jamais l'existence de ce qu'on ne montre pas.
    scope = await _announcement_department_ids(announcement_id, db)
    if not announcement.is_active or (
        scope and not (set(scope) & await _parent_department_ids(parent.id, db))
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.messaging.announcement_not_found"),
        )
    if not announcement.requires_signature:
        # Signer une diffusion qui ne demande rien n'a pas de sens : le
        # registre afficherait une attestation que personne n'a sollicitée.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.messaging.signature_not_required"),
        )

    existing = await db.scalar(
        select(AnnouncementSignature).where(
            AnnouncementSignature.announcement_id == announcement_id,
            AnnouncementSignature.parent_id == parent.id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.messaging.already_signed"),
        )

    signature = AnnouncementSignature(
        announcement_id=announcement_id,
        parent_id=parent.id,
        signed_name=payload.signed_name.strip(),
        account_name=f"{parent.first_name} {parent.last_name}".strip(),
    )
    db.add(signature)
    # La lecture d'abord posée si elle manquait (cf. docstring) — on réutilise
    # le chemin existant plutôt que d'insérer la ligne à la main, pour que les
    # deux restent d'accord si la règle de lecture change un jour.
    await mark_announcement_read(announcement_id, parent, db)
    await db.flush()
    await db.refresh(signature)

    audience = await _audience_parent_ids(
        parent.establishment_id, scope or None, db
    )
    # Poussé au seul canal ADMIN : la signature d'un parent ne concerne pas
    # les autres parents, exactement comme l'accusé de lecture.
    await publish_event(
        _admin_channel(parent.establishment_id),
        {
            "type": "announcement_signed",
            "announcement_id": str(announcement_id),
            "signature_count": await _signature_count(announcement_id, audience, db),
        },
    )

    attachments = (await _attachments_for_announcements([announcement_id], db)).get(
        announcement_id
    )
    return _announcement_response(
        announcement, is_read=True, attachments=attachments, localized=True,
        department_ids=scope, is_signed=True, signed_at=signature.signed_at,
    )


async def list_announcement_recipients(
    announcement_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> AnnouncementRecipientListResponse:
    """Registre d'une diffusion : TOUS les parents de l'audience, avec ce que
    chacun en a fait — rien, lu, signé.

    ⚠️ La liste part de l'AUDIENCE, pas des accusés de lecture. Une liste des
    seuls lecteurs (ou des seuls signataires) répondrait à la lettre de la
    question « qui a lu / qui a signé » en taisant la réponse utile : qui n'a
    rien fait. C'est de ceux-là que l'établissement a besoin, puisque ce sont
    les seuls à relancer.

    Tri par ÉTAT puis par nom : les parents sans aucune trace en premier, les
    signataires en dernier. L'ordre alphabétique seul obligerait à parcourir
    toute la liste pour retrouver les retardataires.
    """
    announcement = await _get_announcement_or_404(
        announcement_id, establishment_id, db
    )
    scope = await _announcement_department_ids(announcement_id, db)
    audience = await _audience_parent_ids(establishment_id, scope or None, db)
    if not audience:
        return AnnouncementRecipientListResponse(
            total=0, read_count=0, signature_count=0,
            requires_signature=announcement.requires_signature, items=[],
        )

    parents = (
        await db.execute(select(User).where(User.id.in_(audience)))
    ).scalars().all()

    reads = dict(
        (
            await db.execute(
                select(AnnouncementRead.parent_id, AnnouncementRead.read_at).where(
                    AnnouncementRead.announcement_id == announcement_id,
                    AnnouncementRead.parent_id.in_(audience),
                )
            )
        ).all()
    )
    signatures = {
        row.parent_id: row
        for row in (
            await db.execute(
                select(AnnouncementSignature).where(
                    AnnouncementSignature.announcement_id == announcement_id,
                    AnnouncementSignature.parent_id.in_(audience),
                )
            )
        ).scalars().all()
    }

    items = [
        AnnouncementRecipient(
            parent=UserBrief(
                id=user.id,
                first_name=user.first_name,
                last_name=user.last_name,
                nickname=user.nickname,
            ),
            email=user.email,
            read_at=reads.get(user.id),
            signed_at=signatures[user.id].signed_at if user.id in signatures else None,
            signed_name=(
                signatures[user.id].signed_name if user.id in signatures else None
            ),
        )
        for user in parents
    ]
    items.sort(
        key=lambda r: (
            2 if r.signed_at else (1 if r.read_at else 0),
            r.parent.last_name.casefold(),
            r.parent.first_name.casefold(),
        )
    )

    return AnnouncementRecipientListResponse(
        total=len(items),
        read_count=sum(1 for r in items if r.read_at),
        signature_count=sum(1 for r in items if r.signed_at),
        requires_signature=announcement.requires_signature,
        items=items,
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.parent_not_found"))

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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.conversation_not_found"))
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.message_not_found"))
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
    # ⚠️ Le surnom SEUL quand il existe : cette copie-ci lui accolait le nom de
    # famille (« Tata Victoire Dupont ») là où les quatre autres rendaient
    # « Tata Victoire ». Même personne, deux noms selon la notification.
    sender_label = display_name_of(sender)
    preview = body.strip()[:120] or t("push.new_attachment")
    if sender.role == UserRole.ADMIN:
        await send_push_to_establishment_parents(
            conversation.establishment_id,
            "push.message_from_school.title",
            preview,
            db,
            # ⚠️ L'onglet NOMMÉ : cet écran ouvre les diffusions par défaut,
            # donc sans lui la notification menait juste à côté du message
            # qu'elle annonce.
            {"type": "message", "conversation_id": str(conversation.id),
             "url": links.url_path(links.PARENT_MESSAGING,
                                   **links.parent_conversation_query())},
            parent_ids={conversation.parent_id},
        )
    else:
        await send_push_to_establishment_admins(
            conversation.establishment_id,
            "push.message.title",
            None,
            db,
            # Destination côté ADMIN : ce n'est pas le même écran que le
            # parent, et l'admin a PLUSIEURS conversations — il faut donc en
            # plus désigner laquelle, sinon il doit la retrouver dans la liste.
            {"type": "message", "conversation_id": str(conversation.id),
             "url": links.url_path(
                 links.ADMIN_MESSAGING,
                 **links.admin_conversation_query(conversation.id))},
            body_key="push.message.body",
            body_params={"sender": sender_label},
        )

    await _notify_recipient_by_email(conversation, sender, sender_label, db)
    return response


async def _notify_recipient_by_email(
    conversation: Conversation,
    sender: User,
    sender_label: str,
    db: AsyncSession,
) -> None:
    """Prévient par email le destinataire d'un message privé.

    ⚠️ **Pourquoi un email alors que le push existe.** Exactement le
    raisonnement qui a mené à l'email de diffusion : les trois canaux en place
    n'atteignent que quelqu'un qui a DÉJÀ fait quelque chose — le WebSocket
    suppose un onglet ouvert à cet instant, le push un abonnement par appareil
    que le destinataire a accordé lui-même, la pastille de non-lus qu'il
    revienne de son propre chef. Un parent qui n'a jamais ouvert la carte de
    réglages des notifications n'était prévenu de rien, et un message privé
    attend souvent une réponse.

    ⚠️ **Les deux sens**, comme le push, et avec la même règle de destinataire :
    au parent de la conversation si l'expéditeur est un admin, à tous les admins
    actifs sinon. Un admin n'est pas davantage devant son écran qu'un parent —
    et c'est lui qu'un parent attend.

    ⚠️ **Lecture ICI, envoi EN FOND** : `fastapi-mail` ouvre une connexion SMTP
    par message. Tenu par la requête, l'envoi ferait attendre l'expéditeur le
    temps d'un aller-retour SMTP à chaque message — sur le chemin le plus
    fréquent de la plateforme, dans une interface qui se veut temps réel.
    """
    if sender.role == UserRole.ADMIN:
        destinataires = (
            await db.execute(
                select(User).where(
                    User.id == conversation.parent_id, User.is_active.is_(True)
                )
            )
        ).scalars().all()
        # Côté parent, l'expéditeur est « l'administration » en tant que
        # COLLECTIF : le portail n'affiche jamais le nom de l'admin qui a
        # répondu (cf. `sender_role`, photo du rôle à l'envoi). L'email dit
        # donc la même chose que l'écran.
        etiquette_par_defaut = (
            await db.execute(
                select(Establishment.name).where(
                    Establishment.id == conversation.establishment_id
                )
            )
        ).scalar_one_or_none() or ""
        destination = links.url(
            links.PARENT_MESSAGING, **links.parent_conversation_query()
        )
    else:
        destinataires = (
            await db.execute(
                select(User).where(
                    User.establishment_id == conversation.establishment_id,
                    User.role == UserRole.ADMIN,
                    User.is_active.is_(True),
                )
            )
        ).scalars().all()
        etiquette_par_defaut = sender_label
        destination = links.url(
            links.ADMIN_MESSAGING,
            **links.admin_conversation_query(conversation.id),
        )

    envois: list[tuple[str, str, str, Locale, str]] = []
    # ⚠️ L'expéditeur ne peut pas se retrouver dans cette liste : les deux
    # branches ci-dessus ne lisent QUE l'autre côté de la conversation. Un
    # test de plus (« et surtout pas moi ») n'aurait rien protégé — vérifié
    # par sabotage, il passait encore une fois la garde retirée, parce que
    # c'est la forme de la requête qui tient la propriété, pas un `if`.
    for destinataire in destinataires:
        # ⚠️ La temporisation est RÉSERVÉE PENDANT LA REQUÊTE, jamais dans la
        # tâche de fond : deux messages envoyés coup sur coup y arriveraient
        # tous les deux avant que le premier n'ait posé sa clé.
        cle = _cle_email_message(conversation.id, destinataire.id)
        if not await rate_limit.claim_once(
            cle, window_seconds=settings.message_email_cooldown_minutes * 60
        ):
            continue
        locale = coerce_locale(destinataire.locale)
        etiquette = etiquette_par_defaut or t(
            "emails.message.sender_school", locale
        )
        envois.append(
            (destinataire.email, destinataire.first_name, etiquette, locale, cle)
        )
    if not envois:
        return

    background.spawn(
        _envoyer_emails_message(envois, destination),
        label=f"emails de message, conversation {conversation.id}",
    )


def _cle_email_message(conversation_id: uuid.UUID, destinataire_id: uuid.UUID) -> str:
    return f"msg_email:{conversation_id}:{destinataire_id}"


async def _envoyer_emails_message(
    envois: list[tuple[str, str, str, Locale, str]],
    destination: str,
) -> None:
    """Best-effort PAR DESTINATAIRE, et plus aucune session de base ici.

    ⚠️ **Un échec LÈVE la temporisation** — même raisonnement que la relance
    d'invitation : rien n'a été délivré, et laisser la clé en place priverait le
    destinataire de toute notification pour la demi-heure suivante, c'est-à-dire
    précisément quand le SMTP revient. La garde protège contre un email de
    TROP, pas contre une tentative de rattrapage.
    """
    for email, first_name, sender_label, locale, cle in envois:
        try:
            await send_message_email(
                to=email,
                recipient_first_name=first_name,
                sender_label=sender_label,
                message_url=destination,
                locale=locale,
            )
        except Exception:  # SMTP, rendu de template, réseau…
            logger.exception(
                "Échec d'envoi de la notification de message à %s", email
            )
            try:
                await rate_limit.reset(cle)
            except Exception:
                logger.exception("Temporisation non levée pour %s", email)


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
            detail=t("errors.messaging.edit_window_over"),
        )
    body = body.strip()
    if len(body) > 5000 or (not body and not await _message_attachment_count(message.id, db)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.messaging.body_or_media"),
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.message_not_found"))
    if message.sender_id != requester.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("errors.common.unauthorized"))
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.message_not_found"))
    if message.sender_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("errors.common.unauthorized"))
    if message.is_deleted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=t("errors.messaging.message_deleted"))
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.announcement_not_found"))
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


async def _signatures_of_parent(
    parent_id: uuid.UUID, db: AsyncSession
) -> dict[uuid.UUID, datetime]:
    """Diffusions signées par CE parent, et quand — la date est affichée en
    confirmation (« signé le … »), sans quoi il n'a aucune trace de son geste."""
    result = await db.execute(
        select(
            AnnouncementSignature.announcement_id, AnnouncementSignature.signed_at
        ).where(AnnouncementSignature.parent_id == parent_id)
    )
    return dict(result.all())


async def _signature_parent_ids(
    announcement_ids: set[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, set[uuid.UUID]]:
    """Signataires par diffusion, en UNE requête.

    On ramène les identifiants et pas un `COUNT` parce que le compteur doit
    être croisé avec l'audience courante (cf. `_signature_count`) : un
    agrégat SQL ne saurait pas écarter un signataire sorti du périmètre.
    """
    if not announcement_ids:
        return {}
    result = await db.execute(
        select(
            AnnouncementSignature.announcement_id, AnnouncementSignature.parent_id
        ).where(AnnouncementSignature.announcement_id.in_(announcement_ids))
    )
    by_announcement: dict[uuid.UUID, set[uuid.UUID]] = {}
    for ann_id, parent_id in result.all():
        by_announcement.setdefault(ann_id, set()).add(parent_id)
    return by_announcement


async def _signature_count(
    announcement_id: uuid.UUID, audience: set[uuid.UUID], db: AsyncSession
) -> int:
    """Numérateur du « X/Y ont signé », borné à l'audience COURANTE.

    Une signature posée par un parent ensuite sorti du périmètre reste en base
    (on ne détruit pas une attestation) mais ne compte plus : sinon le
    compteur pourrait dépasser son total après un reciblage.
    """
    if not audience:
        return 0
    return len(
        (await _signature_parent_ids({announcement_id}, db)).get(
            announcement_id, set()
        )
        & audience
    )


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
            status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.department_not_found")
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
    localized: bool = False,
    signature_count: int | None = None,
    is_signed: bool | None = None,
    signed_at: datetime | None = None,
) -> AnnouncementResponse:
    """`localized=True` sert le texte dans la langue du LECTEUR (vue parent).

    La vue de GESTION garde le français, à dessein : c'est ce que l'admin a
    écrit et ce que son formulaire d'édition réaffiche. Lui renvoyer l'anglais
    parce que son compte est en anglais lui ferait écraser le français au
    premier enregistrement. `title_en` / `body_en` restent exposés à côté, pour
    qu'il puisse corriger la traduction sans jamais la confondre avec la source.
    """
    title, body = (
        _localized_announcement(announcement, current_locale())
        if localized
        else (announcement.title, announcement.body)
    )
    return AnnouncementResponse(
        id=announcement.id,
        establishment_id=announcement.establishment_id,
        title=title,
        body=body,
        title_en=announcement.title_en,
        body_en=announcement.body_en,
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
        requires_signature=announcement.requires_signature,
        signature_count=signature_count,
        is_signed=is_signed,
        signed_at=signed_at,
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
    payloads: list[media.AcceptedMedia],
    uploader: User,
    db: AsyncSession,
    *,
    message_id: uuid.UUID | None = None,
    announcement_id: uuid.UUID | None = None,
) -> list[AttachmentResponse]:
    """⚠️ Le lot porte des médias déjà IDENTIFIÉS et normalisés.

    Il stockait auparavant `file.content_type or "application/octet-stream"` —
    donc le type que le navigateur avait annoncé, et à défaut un type générique.
    Une photo parfaitement valide envoyée sans MIME était ainsi enregistrée
    comme un flux d'octets, puis servie telle quelle : le navigateur du
    destinataire proposait de la télécharger au lieu de l'afficher.
    """
    keys: list[str] = []
    responses: list[AttachmentResponse] = []
    try:
        async with db.begin_nested():
            for item in payloads:
                key = await storage.save_file("messaging", item.filename, item.content)
                keys.append(key)
                attachment = Attachment(
                    message_id=message_id,
                    announcement_id=announcement_id,
                    uploaded_by_id=uploader.id,
                    filename=item.filename,
                    content_type=item.content_type,
                    size_bytes=len(item.content),
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
            detail=t(
                "errors.messaging.message_media_limit",
                max_media=MAX_MESSAGE_ATTACHMENTS,
                existing=existing,
            ),
        )


def _ensure_announcement_quota(existing: int, incoming: int) -> None:
    if existing + incoming > MAX_ANNOUNCEMENT_ATTACHMENTS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t(
                "errors.messaging.announcement_media_limit",
                max_media=MAX_ANNOUNCEMENT_ATTACHMENTS,
                existing=existing,
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
            detail=t("errors.messaging.no_file"),
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.announcement_not_found"))
    _ensure_announcement_quota(
        await _announcement_attachment_count(announcement.id, db), len(files)
    )

    payloads: list[media.AcceptedMedia] = []
    for file in files:
        payloads.append(await media.accept_upload(
            file,
            await file.read(),
            max_image_mb=settings.messaging_max_attachment_mb,
            max_video_mb=settings.messaging_max_video_mb,
            allow_video=True,
            allow_pdf=True,
        ))

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
            detail=t("errors.messaging.no_file"),
        )
    message = await _lock_message_for_update(conversation, message_id, db)
    if not message or message.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.message_not_found"))
    if message.sender_id != uploader.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("errors.common.unauthorized"))
    _ensure_message_quota(await _message_attachment_count(message.id, db), len(files))

    payloads: list[media.AcceptedMedia] = []
    for file in files:
        payloads.append(await media.accept_upload(
            file,
            await file.read(),
            max_image_mb=settings.messaging_max_attachment_mb,
            max_video_mb=settings.messaging_max_video_mb,
            allow_video=True,
            allow_pdf=True,
        ))

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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.message_not_found"))
    if message.sender_id != requester.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("errors.common.unauthorized"))
    attachment = await db.scalar(
        select(Attachment).where(
            Attachment.id == attachment_id, Attachment.message_id == message.id
        )
    )
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.attachment_not_found"))
    remaining = await _message_attachment_count(message.id, db)
    if remaining <= 1 and not message.body.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.messaging.keep_body_or_media"),
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.attachment_not_found"))

    if attachment.message_id:
        message = await db.scalar(select(Message).where(Message.id == attachment.message_id))
        conversation = await db.scalar(
            select(Conversation).where(Conversation.id == message.conversation_id)
        )
        if message.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.attachment_not_found")
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.messaging.attachment_not_found"))

    return attachment, storage.resolve_path(attachment.storage_key)
