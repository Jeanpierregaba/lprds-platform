"""
Import one-shot des fiches enfants depuis l'export CSV legacy.

NE JAMAIS écrire en SQL direct : chaque ligne passe par le service existant
`create_child` (génération des matricules, validation des dates, tuteur
obligatoire, rattachement département/section). Les doublons sont créés quand
même (décision produit) — la protection anti-doublon, c'est `--resume`.

Usage (depuis `backend/`) :
    python scripts/import_children.py --csv /tmp/enfants.csv \\
        --establishment-code LPRDS                    # dry-run par défaut
    python scripts/import_children.py --csv ... --establishment-code LPRDS \\
        --apply --section-map '{"creche_etoile": "Étoile"}' --report /tmp/rapport.csv
    # Reprise après correction : ne rejoue que les lignes non-OK du rapport
    python scripts/import_children.py --csv ... --establishment-code LPRDS \\
        --apply --resume-from-report /tmp/rapport.csv

Mapping legacy → modèle (colonnes lues) :
    first_name/last_name  → first_names/last_name
    birth_date/admission_date (ISO) → idem (cohérence re-vérifiée par Pydantic)
    address (vide → "Adresse non renseignée" + avertissement)
    status active/inactive → fiche créée active puis désactivée si inactive
    section (slug legacy) → section_id + department_id via --section-map
        puis repli sur correspondance exacte du nom ; inconnu → NULL + averti
    emergency_contacts_detailed (JSON) :
        relationship parent/guardian → guardians[] (dédupliqués par téléphone)
        autres + is_pickup_authorized → authorized_persons[] (idem)
        autres + NON autorisés → ignorés (aucun champ ne les porte) + comptés
    medical_info_detailed (JSON) + medical_info + special_needs
        → medical_notes / medications / doctor_name / doctor_phone
    dietary_restrictions / behavioral_notes / preferences → champs homonymes
    usual_name → préfixé à behavioral_notes ("Nom usuel : X.") si non inclus
        dans first_names
    behavioral_notes / dietary_restrictions / ... : la valeur "[]" = vide

Colonnes IGNORÉES explicitement (cf. IGNORED_COLUMNS) :
    id / created_at / updated_at (IDs et horodatages régénérés côté serveur),
    code_qr_id (QR legacy : nos matricules sont générés par
        children/matricule.py, les QR d'attendance dérivent des IDs internes),
    group_id / assigned_educator_id (IDs legacy sans sens ici — assignation
        aux groupes après coup via /groups/...), photo_url (aucun fichier
        fourni), administrative_documents (toujours vide), emergency_contacts
        (colonne plate toujours vide — seul le JSON détaillé est lu).

Sortie : rapport CSV (ligne legacy → OK + matricule / REJETÉ + motif /
avertissements) + code de sortie 0 (tout OK), 1 (rejets), 2 (fatal).
"""

import argparse
import asyncio
import csv
import json
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

import app.core.models  # noqa: F401 — registre central (résolution des mappers)
from app.core.database import AsyncSessionLocal
from app.modules.children.io import (
    address_fallback,
    RowError,
    clean,
    clean_email,
    clean_phone,
    flatten_validation_error,
    real_text,
)
from app.modules.children.schemas import (
    AuthorizedPersonRequest,
    ChildCreateRequest,
    GuardianRequest,
)
from app.modules.children.service import create_child, set_child_status
from app.modules.establishments.models import Establishment
from app.modules.organization.models import Section

# ── Constantes ────────────────────────────────────────────────────
IGNORED_COLUMNS = {
    "id", "created_at", "updated_at",           # régénérés côté serveur
    "code_qr_id",                               # QR legacy — voir docstring
    "group_id", "assigned_educator_id",         # IDs legacy sans sens ici
    "photo_url",                                # aucun fichier fourni
    "administrative_documents",                 # toujours vide dans l'export
    "emergency_contacts",                       # colonne plate vide (JSON lu)
}

GUARDIAN_RELATIONSHIPS = {"parent", "guardian"}


def parse_json_list(raw: object, ctx: str) -> list:
    """JSON imbriqué legacy (contacts, medical) — absent du format canonique
    plat : reste local au script."""
    text = clean(raw)
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RowError(f"JSON invalide dans {ctx} : {exc}") from exc
    if not isinstance(parsed, list):
        raise RowError(f"{ctx} n'est pas une liste JSON")
    return parsed


# ── Construction ──────────────────────────────────────────────────
def build_guardians(contacts: list[dict]) -> tuple[list[GuardianRequest], list[str]]:
    guardians: list[GuardianRequest] = []
    warnings: list[str] = []
    seen_phones: set[str] = set()
    seen_names: dict[str, str] = {}
    for contact in contacts:
        if contact.get("relationship") not in GUARDIAN_RELATIONSHIPS:
            continue
        last_name = clean(contact.get("last_name"))
        first_names = clean(contact.get("first_name"))
        if not last_name or not first_names:
            warnings.append("tuteur sans nom ignoré")
            continue
        try:
            phone, phone_warning = clean_phone(contact.get("phone"))
        except RowError:
            warnings.append(f"tuteur sans téléphone ignoré ({first_names} {last_name})")
            continue
        if phone_warning:
            warnings.append(f"{first_names} {last_name} : {phone_warning}")
        name_key = f"{last_name.lower()}|{first_names.lower()}"
        phone_key = f"tel:{phone.lower()}"
        if phone_key in seen_phones:
            warnings.append(f"tuteur en double ignoré ({first_names} {last_name})")
            continue
        if name_key in seen_names:
            warnings.append(
                f"tuteur en double fusionné ({first_names} {last_name} : "
                f"{seen_names[name_key]} / {phone})"
            )
            continue
        seen_phones.add(phone_key)
        seen_names[name_key] = phone
        email, email_warning = clean_email(contact.get("email"))
        if email_warning:
            warnings.append(f"{first_names} {last_name} : {email_warning}")
        guardians.append(GuardianRequest(
            last_name=last_name, first_names=first_names,
            phone=phone, email=email,
        ))
    if not guardians:
        raise RowError("aucun tuteur (parent/guardian) exploitable")
    return guardians, warnings


def build_authorized(
    contacts: list[dict], guardian_phones: set[str], guardian_names: set[str]
) -> tuple[list[AuthorizedPersonRequest], int]:
    persons: list[AuthorizedPersonRequest] = []
    seen_phones = set(guardian_phones)
    seen_names = set(guardian_names)
    skipped_not_authorized = 0
    for contact in contacts:
        if contact.get("relationship") in GUARDIAN_RELATIONSHIPS:
            continue
        if not contact.get("is_pickup_authorized"):
            skipped_not_authorized += 1
            continue
        last_name = clean(contact.get("last_name"))
        first_names = clean(contact.get("first_name"))
        if not last_name or not first_names:
            continue
        try:
            phone, _ = clean_phone(contact.get("phone"))
        except RowError:
            continue
        name_key = f"{last_name.lower()}|{first_names.lower()}"
        if f"tel:{phone.lower()}" in seen_phones or name_key in seen_names:
            continue
        seen_phones.add(f"tel:{phone.lower()}")
        seen_names.add(name_key)
        persons.append(AuthorizedPersonRequest(
            last_name=last_name, first_names=first_names, phone=phone,
        ))
    return persons, skipped_not_authorized


def build_medical(row: dict) -> tuple[dict, list[str]]:
    warnings: list[str] = []
    details = {}
    raw_details = clean(row.get("medical_info_detailed"))
    if raw_details:
        try:
            details = json.loads(raw_details)
            if not isinstance(details, dict):
                raise RowError("medical_info_detailed n'est pas un objet JSON")
        except json.JSONDecodeError as exc:
            raise RowError(f"medical_info_detailed invalide : {exc}") from exc
    note_parts = [
        real_text(details.get("medical_notes")),
        ", ".join(c for c in (details.get("chronic_conditions") or []) if clean(c)) or None,
        real_text(row.get("medical_info")),
        real_text(row.get("special_needs")),
    ]
    medical_notes = "\n".join(p for p in note_parts if p) or None
    medications = ", ".join(
        m for m in (details.get("medications") or []) if clean(m)
    ) or None
    doctor_name = real_text(details.get("doctor_name"))
    doctor_phone_raw = clean(details.get("doctor_phone"))
    doctor_phone: str | None = None
    if doctor_phone_raw:
        if len(doctor_phone_raw) <= 20:
            doctor_phone = doctor_phone_raw
        else:
            warnings.append("téléphone médecin ignoré (> 20 car.)")
    return {
        "medical_notes": medical_notes,
        "dietary_restrictions": real_text(row.get("dietary_restrictions")),
        "medications": medications,
        "doctor_name": doctor_name,
        "doctor_phone": doctor_phone,
    }, warnings


def parse_date(raw: object, field: str) -> date:
    try:
        return date.fromisoformat(clean(raw))
    except ValueError as exc:
        raise RowError(f"{field} invalide ({clean(raw)[:20]})") from exc


def build_payload(
    row: dict,
    sections_by_name: dict[str, tuple],
) -> tuple[ChildCreateRequest, list[str], bool]:
    """Construit le payload validé. Lève RowError / ValidationError."""
    warnings: list[str] = []

    contacts = parse_json_list(
        row.get("emergency_contacts_detailed"), "emergency_contacts_detailed"
    )
    guardians, guardian_warnings = build_guardians(contacts)
    warnings.extend(guardian_warnings)
    guardian_phones = {f"tel:{clean(g.phone).lower()}" for g in guardians}
    guardian_names = {f"{g.last_name.lower()}|{g.first_names.lower()}"
                      for g in guardians}
    authorized, skipped = build_authorized(
        contacts, guardian_phones, guardian_names
    )
    if skipped:
        warnings.append(f"{skipped} contact(s) d'urgence non autorisés ignorés")

    medical, medical_warnings = build_medical(row)
    warnings.extend(medical_warnings)

    residence_address = real_text(row.get("address"))
    if not residence_address:
        residence_address = address_fallback()
        warnings.append("adresse manquante → mention par défaut")

    behavioral = real_text(row.get("behavioral_notes"))
    usual = clean(row.get("usual_name"))
    first_names = clean(row.get("first_name"))
    if usual and usual.lower() not in first_names.lower():
        note = f"Nom usuel : {usual}."
        behavioral = f"{note}\n{behavioral}" if behavioral else note

    section_id: object = None
    department_id: object = None
    slug = clean(row.get("section"))
    if slug:
        resolved = sections_by_name.get(slug)
        if resolved is None:
            warnings.append(f"section legacy inconnue ({slug}) → sans section")
        else:
            section_id, department_id = resolved

    payload = ChildCreateRequest(
        last_name=clean(row.get("last_name")),
        first_names=first_names,
        birth_date=parse_date(row.get("birth_date"), "birth_date"),
        admission_date=parse_date(row.get("admission_date"), "admission_date"),
        residence_address=residence_address,
        department_id=department_id,
        section_id=section_id,
        behavioral_notes=behavioral,
        preferences=real_text(row.get("preferences")),
        **medical,
        guardians=guardians,
        authorized_persons=authorized,
    )
    return payload, warnings, clean(row.get("status")) != "inactive"


# ── CLI ───────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import one-shot des fiches enfants depuis l'export CSV legacy "
                    "(dry-run par défaut, --apply pour écrire)."
    )
    parser.add_argument("--csv", required=True, help="Chemin du fichier CSV legacy")
    parser.add_argument("--establishment-code", required=True,
                        help="Code établissement cible (ex. LPRDS)")
    parser.add_argument("--apply", action="store_true",
                        help="Écrit réellement en base (sans : dry-run, aucune écriture)")
    parser.add_argument("--delimiter", default=",", help="Séparateur CSV (défaut ,)")
    parser.add_argument("--encoding", default=None,
                        help="Encodage (défaut : utf-8-sig puis repli cp1252)")
    parser.add_argument("--section-map", default="{}",
                        help='Correspondance slugs legacy → noms de sections, JSON '
                             '(ex. \'{"creche_etoile": "Étoile"}\'). Sans entrée '
                             '(ni correspondance exacte du nom), section laissée vide.')
    parser.add_argument("--report", default=None,
                        help="Chemin du rapport CSV (défaut ./import_report_<date>.csv)")
    parser.add_argument("--resume-from-report", default=None,
                        help="Rapport précédent : saute les lignes déjà OK")
    return parser.parse_args()


def read_csv(path: Path, delimiter: str, encoding: str | None) -> list[dict]:
    encodings = [encoding] if encoding else ["utf-8-sig", "cp1252"]
    last_error: Exception | None = None
    for enc in encodings:
        try:
            with open(path, encoding=enc, newline="") as f:
                return list(csv.DictReader(f))
        except (UnicodeDecodeError, UnicodeError) as exc:
            last_error = exc
    raise SystemExit(f"encodage illisible ({', '.join(encodings)}) : {last_error}")


async def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv)
    if not csv_path.is_file():
        print(f"ERREUR FATALE : fichier introuvable ({csv_path})", file=sys.stderr)
        return 2
    try:
        section_map = json.loads(args.section_map)
        if not isinstance(section_map, dict):
            raise ValueError
    except ValueError:
        print("ERREUR FATALE : --section-map doit être un objet JSON", file=sys.stderr)
        return 2

    rows = read_csv(csv_path, args.delimiter, args.encoding)
    print(f"→ {len(rows)} ligne(s) lue(s) depuis {csv_path.name}")

    resumed: set[str] = set()
    if args.resume_from_report:
        with open(args.resume_from_report, encoding="utf-8") as f:
            resumed = {r["legacy_id"] for r in csv.DictReader(f) if r.get("result") == "OK"}
        print(f"→ reprise : {len(resumed)} ligne(s) déjà OK ignorée(s)")

    report_path = Path(args.report) if args.report else Path(
        f"./import_report_{datetime.now():%Y%m%d-%H%M%S}.csv"
    )
    mode = "ÉCRITURE RÉELLE" if args.apply else "DRY-RUN (aucune écriture)"

    ok = rejected = skipped = 0
    report_rows: list[dict] = []

    async with AsyncSessionLocal() as db:
        # Garde-fou search_path : avec un schéma dédié (DB_SCHEMA), si les
        # migrations n'y ont pas été appliquées, les requêtes non qualifiées
        # retomberaient SILENCIEUSEMENT sur le schéma public (dev). On refuse
        # de continuer plutôt que d'écrire au mauvais endroit.
        from sqlalchemy import text as _text
        from app.core.config import settings as _settings
        expected_schema = _settings.db_schema or "public"
        exists = await db.scalar(
            _text("SELECT to_regclass(:tbl)"),
            {"tbl": f"{expected_schema}.children"},
        )
        if not exists:
            print(f"ERREUR FATALE : table children absente du schéma "
                  f"'{expected_schema}' — appliquer d'abord les migrations "
                  f"(alembic upgrade head)", file=sys.stderr)
            return 2
        establishment = await db.scalar(select(Establishment).where(
            Establishment.code == args.establishment_code.upper()
        ))
        if not establishment:
            print(f"ERREUR FATALE : établissement '{args.establishment_code}' "
                  f"introuvable", file=sys.stderr)
            return 2
        sections = (await db.execute(select(Section).where(
            Section.establishment_id == establishment.id
        ))).scalars().all()
        sections_by_name = {s.name: (s.id, s.department_id) for s in sections}
        # Le slug legacy peut aussi être directement le nom de la section.
        resolve = dict(sections_by_name)
        for slug, name in section_map.items():
            if name in sections_by_name:
                resolve[slug] = sections_by_name[name]
            else:
                print(f"  ! --section-map : section '{name}' introuvable "
                      f"(slug '{slug}' → sans section)")
        print(f"→ établissement {establishment.code} "
              f"({len(sections)} section(s) connue(s)) — {mode}")

        for lineno, row in enumerate(rows, start=2):
            legacy_id = clean(row.get("id")) or f"ligne-{lineno}"
            base = {
                "legacy_id": legacy_id,
                "first_name": clean(row.get("first_name")),
                "last_name": clean(row.get("last_name")),
                "section_slug": clean(row.get("section")),
                "status": clean(row.get("status")) or "active",
                "matricule": "", "warnings": "", "error": "",
            }
            if legacy_id in resumed:
                base["result"] = "IGNORÉE (reprise)"
                skipped += 1
            else:
                warnings: list[str] = []
                try:
                    payload, build_warnings, is_active = build_payload(row, resolve)
                    warnings.extend(build_warnings)
                    if not args.apply:
                        base.update(result="DRY-RUN OK",
                                    warnings=" | ".join(warnings))
                        ok += 1
                    else:
                        response = await create_child(
                            payload, establishment.id, db
                        )
                        if not is_active:
                            await set_child_status(
                                response.id, False, establishment.id, db
                            )
                        await db.commit()
                        base.update(result="OK", matricule=response.matricule,
                                    warnings=" | ".join(warnings))
                        ok += 1
                except (RowError, ValidationError, HTTPException,
                        json.JSONDecodeError) as exc:
                    await db.rollback()
                    if isinstance(exc, ValidationError):
                        reason = flatten_validation_error(exc)
                    elif isinstance(exc, HTTPException):
                        reason = str(exc.detail)
                    else:
                        reason = str(exc)
                    base.update(result="REJETÉE", warnings=" | ".join(warnings),
                                error=reason)
                    rejected += 1
                    print(f"  ✗ {base['first_name']} {base['last_name']} "
                          f"({legacy_id[:8]}) : {reason}")
            # Chaque ligne traitée apparaît exactement une fois au rapport.
            report_rows.append(base)

    with open(report_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "legacy_id", "first_name", "last_name", "section_slug", "status",
            "result", "matricule", "warnings", "error",
        ])
        writer.writeheader()
        writer.writerows(report_rows)

    print(f"\n✓ {ok} acceptée(s), ✗ {rejected} rejetée(s), "
          f"→ {skipped} ignorée(s) (reprise)")
    print(f"→ rapport : {report_path}")
    return 1 if rejected else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
