"""
Rôles et permissions — le module qui gouverne l'accès de TOUS les autres, et
qui n'avait jusqu'ici que six lignes de chemin heureux dans le smoke test.

Trois familles de contrôles :
  • les invariants d'autorisation (superadmin exclu, rôle désactivé inerte,
    404 inter-établissement, staff refusé sur /rbac/*) ;
  • les deux MIROIRS du catalogue — l'enum, la table, et la copie frontend —
    dont aucun n'était gardé. Un miroir que personne ne compare finit par
    diverger sans que rien ne le signale (cf. test_email_links.py) ;
  • les rôles SOCLES, dont la clé était un libellé éditable.
"""
import json
import pathlib

import pytest

from app.modules.rbac.models import PermissionCode
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

FRONTEND = pathlib.Path(__file__).resolve().parents[3] / "frontend"


def _staff(c, adm, email, stype="secretaire"):
    r = c.post("/staff", json={
        "first_name": "S", "last_name": "T", "nickname": "Tata",
        "phone": "+229", "email": email, "password": "Staff2026",
        "staff_type": stype,
    }, headers=adm)
    assert r.status_code == 201, f"création staff {email}: {r.status_code} {r.text[:200]}"
    return r.json()


def _role(c, adm, name, codes):
    r = c.post("/rbac/roles", json={"name": name, "permissions": codes}, headers=adm)
    assert r.status_code == 201, f"création rôle {name}: {r.status_code} {r.text[:200]}"
    return r.json()


def _with_role(c, adm, email, codes, stype="secretaire"):
    """Un staff dont les permissions sont EXACTEMENT `codes`, et ses headers."""
    member = _staff(c, adm, email, stype)
    role = _role(c, adm, f"R-{email}", codes)
    c.post(f"/rbac/staff/{member['id']}/roles/{role['id']}", headers=adm)
    return member, login(c, email, "Staff2026")


def _baseline(c, adm, name_hint="socle"):
    roles = c.get("/rbac/roles", headers=adm, params={"include_inactive": True}).json()
    return next((r for r in roles if name_hint in r["name"].lower()
                 or "baseline" in r["name"].lower()), None)


# ── Miroirs du catalogue ────────────────────────────────────────
def test_catalogue_matches_enum(client):
    """La table `permissions` est le REFLET de l'enum, seedé par migration.

    Un code ajouté à l'enum sans migration ne se signale qu'au moment où
    quelqu'un tente de l'attribuer — une 500, sur l'écran d'un admin.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC1", "a@rbac1.fr")

    served = sorted(p["code"] for p in c.get("/rbac/permissions", headers=adm).json())
    ck("Catalogue servi == enum PermissionCode",
       served, sorted(str(code) for code in PermissionCode))


def test_catalogue_matches_frontend_mirror(client):
    """`PERMISSION_CODES` (frontend) est un miroir MANUEL de l'enum.

    Comparé à l'arborescence RÉELLE du frontend, jamais à une liste recopiée
    ici — une liste recopiée serait un troisième miroir, libre de diverger des
    deux autres. Sauté proprement si le frontend est absent (backend déployé
    seul).
    """
    types_file = FRONTEND / "src" / "types" / "rbac.ts"
    if not types_file.exists():
        pytest.skip("frontend absent de ce déploiement")

    src = types_file.read_text(encoding="utf-8")
    block = src.split("export const PERMISSION_CODES = [", 1)[1].split("] as const", 1)[0]
    mirrored = sorted(line.strip().strip("',") for line in block.splitlines() if "'" in line)
    ck("PERMISSION_CODES (frontend) == enum backend",
       mirrored, sorted(str(code) for code in PermissionCode))

    # Chaque code doit aussi être cochable : sans groupe, il n'apparaît que
    # dans le repli « Autres » de l'éditeur de rôles.
    groups = src.split("PERMISSION_GROUPS", 1)[1]
    ungrouped = [code for code in mirrored if f"'{code}'" not in groups]
    ck("Tout code est rangé dans un groupe de l'éditeur", ungrouped, [])

    # ...et porter un libellé dans les DEUX catalogues de traduction.
    for locale in ("fr", "en"):
        labels = json.loads(
            (FRONTEND / "messages" / locale / "rbac.json").read_text(encoding="utf-8")
        )["permissions"]
        ck(f"Libellé {locale} pour chaque code",
           sorted(labels.keys()), sorted(str(code) for code in PermissionCode))


# ── Invariants d'autorisation ───────────────────────────────────
def test_superadmin_is_excluded_from_establishment_data(client):
    """Minimisation RGPD : le superadmin gère le SaaS, pas les enfants."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    onboard(c, su, "RBAC2", "a@rbac2.fr")

    ck("Superadmin sur /children → 403", c.get("/children", headers=su).status_code, 403)
    ck("Superadmin sur /rbac/roles → 403", c.get("/rbac/roles", headers=su).status_code, 403)
    ck("Superadmin sur /rbac/me → 403", c.get("/rbac/me", headers=su).status_code, 403)


def test_staff_cannot_manage_roles_but_reads_its_own(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC3", "a@rbac3.fr")
    _, st = _with_role(c, adm, "s@rbac3.fr", ["children:read"])

    ck("Staff sur /rbac/roles → 403", c.get("/rbac/roles", headers=st).status_code, 403)
    ck("Staff sur /rbac/permissions → 403",
       c.get("/rbac/permissions", headers=st).status_code, 403)
    me = c.get("/rbac/me", headers=st).json()
    ck("Staff lit ses propres droits", me["permissions"], ["children:read"])

    # L'admin n'a aucune ligne `Role` : lui renvoyer `user.roles` donnerait
    # « aucun droit » alors qu'il a tout chez lui.
    adm_me = c.get("/rbac/me", headers=adm).json()
    ck("Admin reçoit tout le catalogue",
       sorted(adm_me["permissions"]), sorted(str(code) for code in PermissionCode))


def test_deactivated_role_confers_nothing(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC4", "a@rbac4.fr")
    member, st = _with_role(c, adm, "s@rbac4.fr", ["children:read"])

    ck("Droit actif → 200", c.get("/children", headers=st).status_code, 200)
    role = c.get(f"/rbac/staff/{member['id']}/roles", headers=adm).json()["roles"][0]
    ck("Désactivation du rôle",
       c.delete(f"/rbac/roles/{role['id']}", headers=adm).status_code, 204)

    ck("Rôle désactivé → 403", c.get("/children", headers=st).status_code, 403)
    ck("Et plus aucune permission effective",
       c.get("/rbac/me", headers=st).json()["permissions"], [])


def test_roles_are_isolated_per_establishment(client):
    """404, jamais 403 : on ne révèle pas l'existence d'un rôle d'ailleurs."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    a = onboard(c, su, "RBAC5A", "a@rbac5a.fr")
    b = onboard(c, su, "RBAC5B", "a@rbac5b.fr")

    role = _role(c, a, "Chez A", ["children:read"])
    ck("Rôle d'un autre établissement → 404",
       c.get(f"/rbac/roles/{role['id']}", headers=b).status_code, 404)
    ck("Modification → 404",
       c.patch(f"/rbac/roles/{role['id']}", json={"name": "X"}, headers=b).status_code, 404)

    member = _staff(c, b, "s@rbac5b.fr")
    ck("Attribution croisée → 404",
       c.post(f"/rbac/staff/{member['id']}/roles/{role['id']}", headers=b).status_code, 404)


def test_role_name_is_unique_and_revocation_works(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC6", "a@rbac6.fr")
    role = _role(c, adm, "Directrice", ["children:read"])

    ck("Nom dupliqué → 409", c.post("/rbac/roles", json={
       "name": "Directrice", "permissions": []}, headers=adm).status_code, 409)

    member = _staff(c, adm, "s@rbac6.fr")
    got = c.post(f"/rbac/staff/{member['id']}/roles/{role['id']}", headers=adm).json()
    ck("Attribution", got["permissions"], ["children:read"])
    again = c.post(f"/rbac/staff/{member['id']}/roles/{role['id']}", headers=adm)
    ck("Attribution idempotente", len(again.json()["roles"]), 1)

    got = c.delete(f"/rbac/staff/{member['id']}/roles/{role['id']}", headers=adm).json()
    ck("Révocation", got["permissions"], [])


# ── Découpage du module Présences ───────────────────────────────
def test_attendance_write_no_longer_grants_badges_nor_corrections(client):
    """`attendance:write` ne désigne QUE les paramètres.

    Signalé par l'établissement : une assistante de direction devait recevoir
    les réglages de l'établissement pour imprimer une carte.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC7", "a@rbac7.fr")
    child = c.post("/children", json={
        "last_name": "D", "first_names": "Ana", "birth_date": "2024-01-10",
        "admission_date": "2025-09-01", "residence_address": "rue",
        "guardians": [],
    }, headers=adm).json()

    _, params_only = _with_role(c, adm, "p@rbac7.fr", ["attendance:write"])
    # ⚠️ `/settings/general` répond 404 tant que rien n'est configuré : ce
    # code ne distingue pas « autorisé » de « refusé ». La liste des
    # exemptions répond 200 même vide, donc elle, oui.
    ck("Paramètres : accès aux réglages",
       c.get("/attendance/settings/exempt-staff", headers=params_only).status_code, 200)
    ck("Paramètres : PAS de badge",
       c.get(f"/attendance/qrcode/child/{child['id']}", headers=params_only).status_code, 403)
    ck("Paramètres : PAS de rectification", c.patch(
       "/attendance/events/00000000-0000-0000-0000-000000000000",
       json={"scanned_at": "2026-10-01T08:00:00"}, headers=params_only).status_code, 403)

    _, badges = _with_role(c, adm, "q@rbac7.fr", ["attendance:qrcode"])
    ck("Badges : impression autorisée",
       c.get(f"/attendance/qrcode/child/{child['id']}", headers=badges).status_code, 200)
    ck("Badges : PAS les réglages",
       c.get("/attendance/settings/exempt-staff", headers=badges).status_code, 403)

    _, correct = _with_role(c, adm, "r@rbac7.fr", ["attendance:correct"])
    ck("Rectification : saisie manuelle autorisée", c.post(
       "/attendance/events/manual",
       json={"person_type": "child", "child_id": child["id"],
             "event_type": "arrival", "date": "2026-10-01", "time": "08:05"},
       headers=correct).status_code, 201)
    ck("Rectification : PAS les réglages",
       c.get("/attendance/settings/exempt-staff", headers=correct).status_code, 403)
    ck("Rectification : PAS de badge",
       c.get(f"/attendance/qrcode/child/{child['id']}", headers=correct).status_code, 403)


# ── Rôles socles ────────────────────────────────────────────────
def test_baseline_survives_a_rename(client):
    """Le socle est retrouvé par sa CLÉ, plus par son libellé.

    Avant : renommé depuis l'écran Rôles, il était recréé en double à
    l'embauche suivante, et la rétrogradation retirait le lien du mauvais rôle
    — le membre gardait `reports:write`.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC8", "a@rbac8.fr")

    educ = _staff(c, adm, "e1@rbac8.fr", "educateur")
    base = _baseline(c, adm)
    ck("Socle créé à la 1re embauche", base is not None, True)
    ck("Renommage par l'admin", c.patch(
       f"/rbac/roles/{base['id']}", json={"name": "Nos éducatrices"},
       headers=adm).status_code, 200)

    _staff(c, adm, "e2@rbac8.fr", "educateur")
    roles = c.get("/rbac/roles", headers=adm).json()
    ck("Pas de socle en double après renommage", len(roles), 1)

    c.patch(f"/staff/{educ['id']}", json={"staff_type": "secretaire"}, headers=adm)
    got = c.get(f"/rbac/staff/{educ['id']}/roles", headers=adm).json()
    ck("Rétrogradation : droits bien retirés", got["permissions"], [])


def test_baseline_is_not_silently_reactivated(client):
    """Une décision prise dans l'écran Rôles ne se défait pas toute seule.

    Avant : l'admin désactivait le socle, et la simple embauche de l'éducatrice
    suivante le réactivait — pour TOUTES les éducatrices.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC9", "a@rbac9.fr")

    e1 = _staff(c, adm, "e1@rbac9.fr", "educateur")
    base = _baseline(c, adm)
    c.delete(f"/rbac/roles/{base['id']}", headers=adm)
    ck("Droits retirés", c.get(f"/rbac/staff/{e1['id']}/roles",
       headers=adm).json()["permissions"], [])

    _staff(c, adm, "e2@rbac9.fr", "educateur")
    after = c.get(f"/rbac/roles/{base['id']}", headers=adm).json()
    ck("Le socle reste désactivé", after["is_active"], False)
    ck("Et la 1re éducatrice n'a rien retrouvé",
       c.get(f"/rbac/staff/{e1['id']}/roles", headers=adm).json()["permissions"], [])


def test_baseline_assigned_by_hand_then_promoted(client):
    """Le socle est un rôle ORDINAIRE : l'admin peut l'attribuer lui-même.

    Avant : attribué à la main puis le membre promu éducateur, l'insertion
    violait `user_roles_pkey` — la promotion répondait 500.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC10", "a@rbac10.fr")

    _staff(c, adm, "e1@rbac10.fr", "educateur")
    base = _baseline(c, adm)
    sec = _staff(c, adm, "s1@rbac10.fr", "secretaire")
    ck("Attribution manuelle du socle",
       c.post(f"/rbac/staff/{sec['id']}/roles/{base['id']}", headers=adm).status_code, 200)

    ck("Promotion en éducateur → pas de 500", c.patch(
       f"/staff/{sec['id']}", json={"staff_type": "educateur"},
       headers=adm).status_code, 200)
    got = c.get(f"/rbac/staff/{sec['id']}/roles", headers=adm).json()
    ck("Un seul lien vers le socle", len(got["roles"]), 1)


def test_baseline_label_follows_the_requester_locale(client):
    """Un établissement qui s'installe en anglais ne lit pas « (socle) ».

    Le libellé n'est plus la clé : il peut donc suivre la langue, et l'admin
    peut le renommer.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC11", "a@rbac11.fr")
    c.patch("/auth/me/locale", json={"locale": "en"}, headers=adm)

    _staff(c, adm, "e1@rbac11.fr", "educateur")
    roles = c.get("/rbac/roles", headers=adm).json()
    ck("Libellé anglais pour un compte anglophone",
       roles[0]["name"], "Educator (baseline)")


# ── Annuaire ────────────────────────────────────────────────────
def test_directory_serves_pickers_without_the_other_module(client):
    """Le cas signalé, de bout en bout.

    Une assistante de direction porte les présences (badges + corrections) et
    RIEN du module Enfants. Avant l'annuaire, le sélecteur de l'onglet QR
    appelait `/children` : 403, liste vide, aucun badge imprimable — alors que
    sa permission dit « générer les badges ».
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC12", "a@rbac12.fr")
    dep = c.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    child = c.post("/children", json={
        "last_name": "Dupont", "first_names": "Ana", "birth_date": "2024-01-10",
        "admission_date": "2025-09-01", "residence_address": "rue",
        "department_id": dep["id"], "section_id": sec["id"], "guardians": [],
    }, headers=adm).json()

    _, assistante = _with_role(
        c, adm, "assist@rbac12.fr",
        ["attendance:read", "attendance:qrcode", "attendance:correct"],
    )

    ck("Le dossier enfant reste fermé",
       c.get("/children", headers=assistante).status_code, 403)
    ck("La fiche de l'enfant aussi",
       c.get(f"/children/{child['id']}", headers=assistante).status_code, 403)

    annuaire = c.get("/directory/children", headers=assistante)
    ck("Mais l'annuaire répond", annuaire.status_code, 200)
    item = annuaire.json()["items"][0]
    ck("Nom affichable", item["display_name"], "Ana Dupont")
    ck("Matricule pour le badge", item["matricule"], child["matricule"])
    ck("Section pour le filtre", item["section_name"], "PS")

    # ⚠️ Le cœur du module : ce que l'annuaire NE dit PAS. L'onglet QR
    # téléchargeait la fiche complète pour imprimer un nom.
    ck("Prénoms et nom séparés, pour les deux lignes du badge",
       (item["first_names"], item["last_name"]), ("Ana", "Dupont"))
    for champ in ("medical_notes", "medications", "doctor_name",
                  "residence_address", "birth_date", "guardians",
                  "behavioral_notes", "dietary_restrictions"):
        ck(f"L'annuaire ne porte pas {champ}", champ in item, False)

    ck("Et le badge s'imprime",
       c.get(f"/attendance/qrcode/child/{child['id']}", headers=assistante).status_code, 200)

    # Personnel et périmètres suivent la même règle.
    ck("Annuaire du personnel", c.get("/directory/staff", headers=assistante).status_code, 200)
    units = c.get("/directory/units", headers=assistante)
    ck("Annuaire des unités", units.status_code, 200)
    ck("Sections listées", units.json()["sections"][0]["name"], "PS")


def test_directory_is_not_open_to_every_permission(client):
    """L'annuaire n'est pas un passe-droit : il reste adossé aux permissions.

    `blog:write` n'a aucune raison de connaître l'effectif — rédiger une
    actualité ne choisit personne.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "RBAC13", "a@rbac13.fr")
    _, redacteur = _with_role(c, adm, "red@rbac13.fr", ["blog:write"])

    ck("Rédacteur : pas d'annuaire des enfants",
       c.get("/directory/children", headers=redacteur).status_code, 403)
    ck("Rédacteur : pas d'annuaire du personnel",
       c.get("/directory/staff", headers=redacteur).status_code, 403)
    ck("Rédacteur : pas d'annuaire des unités",
       c.get("/directory/units", headers=redacteur).status_code, 403)
    ck("Superadmin exclu de l'annuaire",
       c.get("/directory/children", headers=su).status_code, 403)
