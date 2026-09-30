import logging
import uuid
from datetime import date, timedelta

from app.core.i18n import DEFAULT_LOCALE, Locale, current_locale, t
from app.core.translation import (
    TranslationUnavailable,
    remember_correction,
    translate_texts,
)

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User, UserRole
from app.modules.children.models import Child
from app.modules.menus.models import WeeklyMenu
from app.modules.menus.schemas import (
    CurrentMenusResponse,
    DayMenu,
    DepartmentBrief,
    MenuCreateRequest,
    MenuListItem,
    MenuListResponse,
    MenuResponse,
    MenuTranslationRequest,
    MenuTranslationResponse,
    MenuWriteRequest,
    UserBrief,
    WeekMenuDays,
    VisibleDepartmentsResponse,
)
from app.modules.organization.models import Department, Group, Section
from app.modules.parents.models import parent_children
from app.modules.rbac.dependencies import user_permission_codes
from app.modules.rbac.models import PermissionCode

logger = logging.getLogger(__name__)

_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"]
_SLOTS = ["collation", "dejeuner", "dessert", "gouter"]

# Branche du JSONB listant les créneaux dont l'anglais a été corrigé à la
# main : {jour: {créneau: true}}. Volontairement un MARQUAGE PAR CRÉNEAU et
# non un statut par semaine (contrairement au blog, où l'unité éditoriale
# est l'article entier) : un menu se remplit jour après jour, et geler les
# 20 créneaux parce qu'un seul plat a été relu empêcherait de traduire ceux
# ajoutés ensuite.
_MANUAL = "manual"


# ── Contenu bilingue ─────────────────────────────────────────────
# `content` est désormais un arbre {langue: {jour: {créneau: plat}}}. Les
# lignes écrites avant cette évolution portent l'ancienne forme à plat
# ({jour: {créneau: plat}}) : la migration les a remontées sous "fr", mais
# `_localized` sait lire les deux — une donnée JSONB n'a pas de schéma imposé
# par la base, donc on ne peut pas se reposer sur la seule migration.
def _localized(content: dict, locale: Locale) -> dict:
    """Les 5 jours dans la langue demandée, repli FR créneau par créneau.

    Le repli est volontairement par CRÉNEAU et non par semaine : un menu
    partiellement traduit (plat ajouté après la traduction) doit afficher ce
    qui existe en anglais et le reste en français, plutôt que de basculer
    toute la semaine en français pour un seul plat manquant.
    """
    base = content.get(str(DEFAULT_LOCALE)) if str(DEFAULT_LOCALE) in content else content
    base = base or {}
    if locale is DEFAULT_LOCALE:
        return base
    translated = content.get(str(locale)) or {}
    merged: dict = {}
    for day in _DAYS:
        fr_day = base.get(day) or {}
        en_day = translated.get(day) or {}
        merged[day] = {
            slot: en_day.get(slot) or fr_day.get(slot) for slot in _SLOTS
        }
    return merged


def _with_branches(content: dict, english: dict, manual: dict) -> dict:
    """Recompose le contenu avec ses branches anglaise et « corrigé ».

    Une branche vide est RETIRÉE plutôt que stockée à vide : `_localized` lit
    `content.get("en")` et traite `{}` comme l'absence, mais une semaine sans
    aucune traduction doit aussi se relire correctement si la forme change un
    jour — mieux vaut que l'absence soit littérale.
    """
    out = {key: value for key, value in content.items() if key not in {str(Locale.EN), _MANUAL}}
    if english:
        out[str(Locale.EN)] = english
    if manual:
        out[_MANUAL] = manual
    return out


def _kept_manual(content: dict, previous: dict | None) -> tuple[dict, dict]:
    """Corrections humaines encore valables : celles dont le français n'a pas bougé.

    Même raisonnement que `_salvage_english`, appliqué au cas humain : si le
    plat français a été remplacé, la correction portait sur un autre plat et
    l'afficher serait un contresens. Le créneau repasse alors à la machine.
    """
    if not previous:
        return {}, {}
    old_fr = previous.get(str(DEFAULT_LOCALE)) or {}
    old_en = previous.get(str(Locale.EN)) or {}
    flags = previous.get(_MANUAL) or {}
    new_fr = content.get(str(DEFAULT_LOCALE)) or {}
    kept_en: dict = {}
    kept_flags: dict = {}
    for day in _DAYS:
        for slot in _SLOTS:
            if not (flags.get(day) or {}).get(slot):
                continue
            if (old_fr.get(day) or {}).get(slot) != (new_fr.get(day) or {}).get(slot):
                continue
            translation = (old_en.get(day) or {}).get(slot)
            if translation:
                kept_en.setdefault(day, {})[slot] = translation
                kept_flags.setdefault(day, {})[slot] = True
    return kept_en, kept_flags


async def _translate_week(
    content: dict, db: AsyncSession, previous: dict | None = None
) -> dict:
    """Ajoute/rafraîchit la branche anglaise — best-effort, jamais bloquant.

    Tous les plats de la semaine partent en UN appel (20 créneaux au plus),
    pas un appel par plat : c'est aussi ce qui permet à la mémoire de
    traduction de ne renvoyer au modèle que les plats réellement inédits.

    Les créneaux corrigés à la main dont le français n'a pas changé ne sont
    NI renvoyés au modèle NI écrasés — c'est la règle « l'humain a le dernier
    mot », déjà appliquée au blog, portée ici au créneau près.

    `previous` est l'ancien contenu complet, sur une modification. En cas
    d'échec, on n'abandonne pas toute la branche anglaise : on garde les
    créneaux dont le texte FRANÇAIS n'a pas changé — leur traduction reste
    exacte. Les créneaux dont le français a bougé sont en revanche écartés,
    sinon un plat remplacé afficherait la traduction de l'ancien, ce qui est
    pire qu'un repli en français.
    """
    kept_en, kept_flags = _kept_manual(content, previous)
    source = content.get(str(DEFAULT_LOCALE), {})
    keys = [(day, slot) for day in _DAYS for slot in _SLOTS]
    # Un créneau corrigé à la main part vide : inutile de le faire traduire
    # pour écraser le résultat juste après.
    values = [
        "" if (kept_flags.get(day) or {}).get(slot)
        else (source.get(day) or {}).get(slot) or ""
        for day, slot in keys
    ]
    if not any(v.strip() for v in values):
        # Semaine vide, ou entièrement relue à la main : rien à traduire.
        return _with_branches(content, kept_en, kept_flags)

    try:
        translated = await translate_texts(values, db)
    except TranslationUnavailable as exc:
        # Best-effort comme le blog : la lecture retombera créneau par créneau
        # sur le français, et le prochain enregistrement retentera.
        logger.info("Traduction du menu non aboutie : %s", exc)
        # Pas besoin de rajouter `kept_en` : un créneau corrigé à la main a par
        # construction un français inchangé et une traduction existante, donc
        # `_salvage_english` le conserve déjà.
        return _with_branches(content, _salvage_english(content, previous), kept_flags)

    out: dict = {day: {} for day in _DAYS}
    for (day, slot), value in zip(keys, translated):
        if value and value.strip():
            out[day][slot] = value
    for day, slots in kept_en.items():
        out.setdefault(day, {}).update(slots)
    return _with_branches(content, out, kept_flags)


def _salvage_english(content: dict, previous: dict | None) -> dict:
    """Traductions encore valables après un échec : celles dont le français
    est inchangé. Sans `previous` (création), il n'y a rien à récupérer."""
    if not previous:
        return {}
    old_fr = previous.get(str(DEFAULT_LOCALE)) or {}
    old_en = previous.get(str(Locale.EN)) or {}
    new_fr = content.get(str(DEFAULT_LOCALE)) or {}
    kept: dict = {}
    for day in _DAYS:
        for slot in _SLOTS:
            unchanged = (old_fr.get(day) or {}).get(slot) == (new_fr.get(day) or {}).get(slot)
            previous_translation = (old_en.get(day) or {}).get(slot)
            if unchanged and previous_translation:
                kept.setdefault(day, {})[slot] = previous_translation
    return kept


def needs_translation(content: dict) -> bool:
    """Un créneau au moins est rempli en français sans anglais correspondant.

    Un menu ne porte aucun statut de traduction, à la différence d'un article :
    l'état se lit directement dans l'arbre JSONB. C'est plus juste qu'un statut
    pour un contenu qui se complète jour après jour — seuls les créneaux
    réellement ajoutés depuis apparaissent comme manquants.

    Les créneaux relus à la main sont ignorés : leur anglais appartient à un
    humain, et son absence est alors un choix, pas un manque.
    """
    french = content.get(str(DEFAULT_LOCALE)) or {}
    english = content.get(str(Locale.EN)) or {}
    flags = content.get(_MANUAL) or {}
    for day in _DAYS:
        for slot in _SLOTS:
            if (flags.get(day) or {}).get(slot):
                continue
            source = (french.get(day) or {}).get(slot)
            if source and source.strip() and not (english.get(day) or {}).get(slot):
                return True
    return False


async def retranslate_content(content: dict, db: AsyncSession) -> dict:
    """Relance la traduction d'un contenu déjà stocké — utilisée par la tâche
    de reprise (`menus/tasks.py`).

    Le contenu sert à la fois de source et de `previous` : le français n'ayant
    pas changé, les corrections manuelles et les traductions déjà obtenues
    sont toutes conservées, et seuls les créneaux sans anglais partent
    réellement au modèle (les autres sont servis par la mémoire).
    """
    return await _translate_week(content, db, previous=content)


def _current_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


def _is_manager(current_user: User) -> bool:
    """Admin, ou staff porteur de menus:write — voit et gère TOUS les
    départements (la restauration reste centrale)."""
    return (
        current_user.role == UserRole.ADMIN
        or PermissionCode.MENUS_WRITE in user_permission_codes(current_user)
    )


def _can_see_history(current_user: User) -> bool:
    codes = user_permission_codes(current_user)
    return (
        current_user.role == UserRole.ADMIN
        or PermissionCode.MENUS_WRITE in codes
        or PermissionCode.MENUS_READ in codes
    )


async def _visible_department_ids(
    current_user: User, db: AsyncSession
) -> list[uuid.UUID] | None:
    """Départements dont l'utilisateur voit les menus. None = tous.
    Parent = départements de ses enfants ; éducatrice (≥ 1 groupe mené) =
    départements de ses groupes ; autre staff = tout (inchangé)."""
    if _is_manager(current_user):
        return None
    if current_user.role == UserRole.PARENT:
        result = await db.execute(
            select(Child.department_id)
            .join(parent_children, parent_children.c.child_id == Child.id)
            .where(
                parent_children.c.parent_id == current_user.id,
                Child.department_id.is_not(None),
            )
            .distinct()
        )
        return list(result.scalars().all())
    if current_user.role == UserRole.STAFF:
        result = await db.execute(
            select(Department.id)
            .join(Section, Section.department_id == Department.id)
            .join(Group, Group.section_id == Section.id)
            .where(
                Department.establishment_id == current_user.establishment_id,
                Group.educatrice_id == current_user.id,
                Group.is_active.is_(True),
            )
            .distinct()
        )
        led = list(result.scalars().all())
        if led:
            return led
    return None


async def _validate_department(
    department_id: uuid.UUID, establishment_id: uuid.UUID, db: AsyncSession
) -> Department:
    department = await db.scalar(
        select(Department).where(
            Department.id == department_id,
            Department.establishment_id == establishment_id,
        )
    )
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=t("errors.common.department_not_found")
        )
    return department


def _ensure_visible(
    department_id: uuid.UUID, visible: list[uuid.UUID] | None
) -> None:
    """Hors périmètre → 403 (jamais 404 : on ne révèle pas l'existence —
    même principe que partout ailleurs)."""
    if visible is not None and department_id not in visible:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.menus.wrong_department"),
        )


def _ensure_monday(week_start: date) -> None:
    if week_start.weekday() != 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.menus.not_monday"),
        )


def _ensure_not_past(week_start: date) -> None:
    """On ne réécrit jamais l'historique — création/modification/suppression
    limitées à la semaine en cours ou à venir."""
    if week_start < _current_monday():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("errors.menus.past_week"),
        )


# ── Écriture (admin ou menus:write, TOUS les départements) ──────
async def create_menu(
    payload: MenuCreateRequest,
    establishment_id: uuid.UUID,
    author: User,
    db: AsyncSession,
) -> MenuResponse:
    week_start = payload.week_start
    _ensure_monday(week_start)
    _ensure_not_past(week_start)
    department = await _validate_department(payload.department_id, establishment_id, db)

    existing = await db.scalar(
        select(WeeklyMenu.id).where(
            WeeklyMenu.establishment_id == establishment_id,
            WeeklyMenu.department_id == payload.department_id,
            WeeklyMenu.week_start == week_start,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("errors.menus.already_exists"),
        )

    content = await _translate_week(
        {str(DEFAULT_LOCALE): payload.model_dump(
            mode="json", exclude={"week_start", "department_id"}
        )},
        db,
    )
    menu = WeeklyMenu(
        establishment_id=establishment_id,
        department_id=payload.department_id,
        week_start=week_start,
        content=content,
        created_by_id=author.id,
    )
    db.add(menu)
    await db.flush()
    await db.refresh(menu)
    return _to_response(menu, department_name=department.name)


async def update_menu(
    week_start: date,
    department_id: uuid.UUID,
    payload: MenuWriteRequest,
    establishment_id: uuid.UUID,
    editor: User,
    db: AsyncSession,
) -> MenuResponse:
    _ensure_not_past(week_start)
    menu = await _get_menu_or_404(week_start, department_id, establishment_id, db)

    menu.content = await _translate_week(
        {str(DEFAULT_LOCALE): payload.model_dump(mode="json")}, db,
        previous=menu.content,
    )
    menu.updated_by_id = editor.id
    await db.flush()
    await db.refresh(menu)
    names = await _department_names(establishment_id, db)
    return _to_response(menu, department_name=names.get(menu.department_id))


# ── Correction manuelle de la version anglaise ───────────────────
async def get_menu_translation(
    week_start: date,
    department_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> MenuTranslationResponse:
    """Les deux langues côte à côte, pour l'écran de relecture.

    Volontairement PAS `_localized()` : cet écran est le seul du projet qui
    doit voir la branche anglaise telle qu'elle est stockée, trous compris.
    Le repli créneau par créneau, utile partout ailleurs, masquerait ici
    exactement ce que le relecteur cherche — ce qui n'est pas encore traduit.
    """
    menu = await _get_menu_or_404(week_start, department_id, establishment_id, db)
    names = await _department_names(establishment_id, db)
    french = menu.content.get(str(DEFAULT_LOCALE)) or {}
    english = menu.content.get(str(Locale.EN)) or {}
    flags = menu.content.get(_MANUAL) or {}
    return MenuTranslationResponse(
        week_start=menu.week_start,
        week_end=menu.week_start + timedelta(days=4),
        department_id=menu.department_id,
        department_name=names.get(menu.department_id),
        french=_week_days(french),
        english=_week_days(english),
        manual_slots=[
            f"{day}.{slot}"
            for day in _DAYS
            for slot in _SLOTS
            if (flags.get(day) or {}).get(slot)
        ],
    )


async def set_menu_translation(
    week_start: date,
    department_id: uuid.UUID,
    payload: MenuTranslationRequest,
    establishment_id: uuid.UUID,
    editor: User,
    db: AsyncSession,
) -> MenuTranslationResponse:
    """Enregistre la version anglaise relue — et la grave en mémoire.

    ⚠️ Pas de `_ensure_not_past` ici, à la différence de toutes les autres
    écritures du module. La règle « on ne réécrit jamais l'historique » protège
    ce qui a été SERVI aux enfants ; une traduction ne dit rien de plus sur le
    repas, elle ne fait que le donner à lire dans une autre langue. Interdire
    la correction sur une semaine passée rendrait d'ailleurs incorrigible une
    erreur repérée le vendredi, ce qui viderait la fonction de son sens.

    Le corps REMPLACE la branche anglaise en entier (même contrat que
    `update_menu`, pas de fusion partielle) : un créneau laissé vide perd sa
    traduction et son marquage, et repassera donc à la machine au prochain
    enregistrement.

    Chaque créneau relu est répercuté dans la mémoire de traduction. C'est le
    point essentiel : sans lui la correction ne vaudrait que pour cette
    semaine-ci, et le même plat réapparaîtrait faux la semaine suivante en
    relisant l'entrée que la machine avait posée.
    """
    menu = await _get_menu_or_404(week_start, department_id, establishment_id, db)
    french = menu.content.get(str(DEFAULT_LOCALE)) or {}

    english: dict = {}
    flags: dict = {}
    for day in _DAYS:
        day_payload = getattr(payload, day)
        for slot in _SLOTS:
            value = getattr(day_payload, slot)
            if not value:
                continue
            english.setdefault(day, {})[slot] = value
            flags.setdefault(day, {})[slot] = True
            source = (french.get(day) or {}).get(slot)
            if source:
                await remember_correction(db, source, value)

    menu.content = _with_branches(menu.content, english, flags)
    menu.updated_by_id = editor.id
    await db.flush()
    await db.refresh(menu)
    return await get_menu_translation(
        week_start, department_id, establishment_id, db
    )


async def delete_menu(
    week_start: date,
    department_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    _ensure_not_past(week_start)
    menu = await _get_menu_or_404(week_start, department_id, establishment_id, db)
    await db.delete(menu)
    await db.flush()


# ── Lecture (scopée par départements visibles) ───────────────────
async def get_visible_departments(
    establishment_id: uuid.UUID, current_user: User, db: AsyncSession
) -> VisibleDepartmentsResponse:
    visible = await _visible_department_ids(current_user, db)
    names = await _department_names(establishment_id, db)
    if visible is None:
        items = [
            DepartmentBrief(id=d_id, name=name or "")
            for d_id, name in names.items()
            if name is not None
        ]
    else:
        items = [
            DepartmentBrief(id=d_id, name=names[d_id])
            for d_id in visible
            if d_id in names
        ]
    items.sort(key=lambda d: d.name)
    return VisibleDepartmentsResponse(total=len(items), items=items)


async def get_current_menus(
    establishment_id: uuid.UUID, current_user: User, db: AsyncSession
) -> CurrentMenusResponse:
    """Semaine en cours — un menu par département visible (liste vide si aucun
    publié). Jamais dans le passé par construction."""
    visible = await _visible_department_ids(current_user, db)
    filters = [
        WeeklyMenu.establishment_id == establishment_id,
        WeeklyMenu.week_start == _current_monday(),
    ]
    if visible is not None:
        if not visible:
            return CurrentMenusResponse(items=[])
        filters.append(WeeklyMenu.department_id.in_(visible))
    result = await db.execute(
        select(WeeklyMenu).where(*filters).order_by(WeeklyMenu.department_id)
    )
    menus = result.scalars().all()
    names = await _department_names(establishment_id, db)
    return CurrentMenusResponse(
        items=[_to_response(m, department_name=names.get(m.department_id)) for m in menus]
    )


async def get_menu(
    week_start: date,
    department_id: uuid.UUID,
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> MenuResponse:
    """Semaine quelconque d'un département : 403 si hors périmètre, 403 si
    semaine passée sans droit d'historique (le contrôle d'accès prime sur
    l'existence, comme partout), 404 si aucun menu publié."""
    _ensure_visible(
        department_id, await _visible_department_ids(current_user, db)
    )
    if week_start < _current_monday() and not _can_see_history(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("errors.menus.history_restricted"),
        )
    menu = await _get_menu_or_404(week_start, department_id, establishment_id, db)
    names = await _department_names(establishment_id, db)
    return _to_response(menu, department_name=names.get(menu.department_id))


async def list_menus(
    establishment_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
    *,
    department_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
) -> MenuListResponse:
    """Historique complet — réservé côté router à admin/menus:read/menus:write.
    Scopé aux départements visibles (+ filtre optionnel)."""
    visible = await _visible_department_ids(current_user, db)
    filters = [WeeklyMenu.establishment_id == establishment_id]
    if visible is not None:
        if not visible:
            return MenuListResponse(total=0, items=[])
        filters.append(WeeklyMenu.department_id.in_(visible))
    if department_id is not None:
        _ensure_visible(department_id, visible)
        filters.append(WeeklyMenu.department_id == department_id)

    total = await db.scalar(
        select(func.count()).select_from(WeeklyMenu).where(*filters)
    )
    result = await db.execute(
        select(WeeklyMenu)
        .where(*filters)
        .order_by(WeeklyMenu.week_start.desc(), WeeklyMenu.department_id)
        .offset(skip)
        .limit(limit)
    )
    menus = result.scalars().all()
    names = await _department_names(establishment_id, db)
    items = [
        MenuListItem(
            id=m.id, department_id=m.department_id,
            department_name=names.get(m.department_id),
            week_start=m.week_start,
            week_end=m.week_start + timedelta(days=4), updated_at=m.updated_at,
        )
        for m in menus
    ]
    return MenuListResponse(total=total or 0, items=items)


# ── Helpers privés ──────────────────────────────────────────────
async def _department_names(
    establishment_id: uuid.UUID, db: AsyncSession
) -> dict[uuid.UUID, str | None]:
    """Nom des départements (le parent ne peut pas appeler /departments —
    organization:read requis — le nom est donc dénormalisé dans la réponse)."""
    result = await db.execute(
        select(Department.id, Department.name).where(
            Department.establishment_id == establishment_id
        )
    )
    return dict(result.all())


async def _get_menu_or_404(
    week_start: date,
    department_id: uuid.UUID,
    establishment_id: uuid.UUID,
    db: AsyncSession,
) -> WeeklyMenu:
    menu = await db.scalar(
        select(WeeklyMenu).where(
            WeeklyMenu.establishment_id == establishment_id,
            WeeklyMenu.department_id == department_id,
            WeeklyMenu.week_start == week_start,
        )
    )
    if not menu:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=t("errors.menus.no_menu"),
        )
    return menu


def _week_days(days: dict) -> WeekMenuDays:
    """Arbre JSONB brut → schéma typé, en ignorant les clés inconnues.

    Une colonne JSONB n'a pas de schéma imposé par la base : un contenu écrit
    par une version antérieure (ou à la main en SQL) peut porter des clés que
    `DayMenu` ne connaît pas, et `DayMenu(**slots)` lèverait alors une 500 sur
    une simple lecture.
    """
    return WeekMenuDays(**{
        day: DayMenu(**{
            slot: (days.get(day) or {}).get(slot) or None for slot in _SLOTS
        })
        for day in _DAYS
    })


def _user_brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id, first_name=user.first_name, last_name=user.last_name,
        nickname=user.nickname,
    )


def _to_response(menu: WeeklyMenu, *, department_name: str | None = None) -> MenuResponse:
    localized = _localized(menu.content, current_locale())
    days = {day: DayMenu(**(localized.get(day) or {})) for day in _DAYS}
    return MenuResponse(
        id=menu.id,
        establishment_id=menu.establishment_id,
        department_id=menu.department_id,
        department_name=department_name,
        week_start=menu.week_start,
        week_end=menu.week_start + timedelta(days=4),
        created_by=_user_brief(menu.created_by),
        updated_by=_user_brief(menu.updated_by) if menu.updated_by else None,
        created_at=menu.created_at,
        updated_at=menu.updated_at,
        **days,
    )
