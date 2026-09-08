"""
Import / export des fiches enfants (format plat administrable).

Le format canonique est IDENTIQUE en .xlsx et .csv (mêmes colonnes, même
ordre) — seule l'enveloppe change. Les helpers purs ci-dessous
(`clean_*`, dédup des contacts, `flatten_validation_error`) sont partagés
avec le script CLI legacy `scripts/import_children.py` (dont le mapping
d'entrée diffère : JSON imbriqués) pour ne pas dupliquer les règles
sanitaires validées sur l'export réel (emails invalides → None + averti,
tél > 20 car. → 1er segment, fusions de doublons).

Colonnes canoniques (en-têtes stables, casse/espaces ignorés à la lecture) :
    matricule, nom, prenoms, nom_usuel, date_naissance, date_admission,
    adresse, statut, section,
    notes_comportement, preferences, notes_medicales,
    restrictions_alimentaires, medicaments, medecin_nom, medecin_tel,
    tuteur_1_nom, tuteur_1_prenoms, tuteur_1_tel, tuteur_1_email, (×3)
    autorise_1_nom, autorise_1_prenoms, autorise_1_tel (×2)

Règles : `matricule` vide = création (jamais fourni par le client, le
matricule reste généré serveur) ; connu dans l'établissement = mise à jour
(les tuteurs fournis REMPLACENT l'existant — sémantique PATCH du module) ;
inconnu = ligne rejetée (on ne crée jamais sur matricule imposé). `statut` :
actif/inactif (vide = actif). `section` : nom exact, inconnu → NULL + averti,
jamais de création implicite (le département est dérivé de la section).
Dates ISO (AAAA-MM-JJ) ou JJ/MM/AAAA (les dates Excel arrivent en datetime).
"""

import csv
import re
import uuid
from datetime import date, datetime
from io import BytesIO, StringIO

from pydantic import ValidationError

from app.modules.children.schemas import (
    AuthorizedPersonRequest,
    GuardianRequest,
)

# Limites anti-abus (413 fichier trop gros, 422 trop de lignes).
MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 1000

IMPORT_COLUMNS = [
    "matricule", "nom", "prenoms", "nom_usuel",
    "date_naissance", "date_admission", "adresse", "statut", "section",
    "notes_comportement", "preferences", "notes_medicales",
    "restrictions_alimentaires", "medicaments", "medecin_nom", "medecin_tel",
    "tuteur_1_nom", "tuteur_1_prenoms", "tuteur_1_tel", "tuteur_1_email",
    "tuteur_2_nom", "tuteur_2_prenoms", "tuteur_2_tel", "tuteur_2_email",
    "tuteur_3_nom", "tuteur_3_prenoms", "tuteur_3_tel", "tuteur_3_email",
    "autorise_1_nom", "autorise_1_prenoms", "autorise_1_tel",
    "autorise_2_nom", "autorise_2_prenoms", "autorise_2_tel",
]

GUARDIAN_SLOTS = (1, 2, 3)
AUTHORIZED_SLOTS = (1, 2)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

ADDRESS_FALLBACK = "Adresse non renseignée"


class ImportFileError(Exception):
    """Fichier illisible dans son ensemble (message simple, cf. convention
    `HTTPException.detail` toujours chaîne)."""


class RowError(Exception):
    """Ligne rejetée : motif explicite pour le rapport."""


# ── Nettoyage (partagé CLI + endpoint) ────────────────────────────
def clean(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value).strip()


def real_text(value: object) -> str | None:
    """Texte utilisable, ou None (vide, '[]', 'null')."""
    text = clean(value)
    if not text or text in ("[]", "null", "None"):
        return None
    return text


def clean_email(raw: object) -> tuple[str | None, str | None]:
    """Espaces parasites retirés ; invalide → None + avertissement (pas rejet)."""
    email = re.sub(r"\s+", "", clean(raw))
    if not email:
        return None, None
    if EMAIL_RE.match(email):
        return email, None
    return None, f"email invalide ignoré ({clean(raw)[:40]})"


def clean_phone(raw: object) -> tuple[str, str | None]:
    """Garde le numéro tel quel (≤ 20 car.) sinon le 1er segment avant '/'.
    Au-delà → rejet (tronquer un téléphone serait dangereux)."""
    phone = clean(raw)
    if not phone:
        raise RowError("téléphone manquant")
    if len(phone) <= 20:
        return phone, None
    first = phone.split("/")[0].strip()
    if first and len(first) <= 20:
        return first, "numéro secondaire ignoré (téléphone > 20 car.)"
    raise RowError(f"téléphone inexploitable ({phone[:30]}…)")


def flatten_validation_error(exc: ValidationError) -> str:
    # Pydantic v2 préfixe en "Value error, ..." : bruit retiré pour un
    # rapport lisible (convention projet : detail reste une chaîne).
    parts = []
    for e in exc.errors():
        msg = re.sub(r"^Value error,\s*", "", str(e["msg"]))
        loc = ".".join(str(p) for p in e["loc"])
        parts.append(f"{loc}: {msg}" if loc else msg)
    return "; ".join(parts)


def flat_row_to_fields(
    row: dict[str, str],
    sections_by_name: dict[str, tuple],
) -> tuple[dict, list[str], bool]:
    """Ligne du format canonique → champs de fiche + avertissements + is_active.
    Lève RowError (ligne rejetée). `sections_by_name` : nom exact →
    (section_id, department_id) ; section inconnue → (None, None) + averti,
    jamais de création implicite (le département est dérivé de la section)."""
    warnings: list[str] = []

    guardians: list[GuardianRequest] = []
    seen_phones: set[str] = set()
    seen_names: dict[str, str] = {}
    for slot in GUARDIAN_SLOTS:
        last_name = row.get(f"tuteur_{slot}_nom", "")
        first_names = row.get(f"tuteur_{slot}_prenoms", "")
        if not last_name and not first_names and not row.get(f"tuteur_{slot}_tel", ""):
            continue
        if not last_name or not first_names:
            raise RowError(f"tuteur_{slot} incomplet (nom + prénoms requis)")
        try:
            phone, phone_warning = clean_phone(row.get(f"tuteur_{slot}_tel", ""))
        except RowError:
            raise RowError(f"tuteur_{slot} : téléphone manquant") from None
        if phone_warning:
            warnings.append(f"tuteur_{slot} : {phone_warning}")
        name_key = f"{last_name.lower()}|{first_names.lower()}"
        phone_key = f"tel:{phone.lower()}"
        if phone_key in seen_phones:
            warnings.append(f"tuteur_{slot} en double ignoré ({first_names} {last_name})")
            continue
        if name_key in seen_names:
            warnings.append(
                f"tuteur_{slot} en double fusionné ({first_names} {last_name} : "
                f"{seen_names[name_key]} / {phone})"
            )
            continue
        seen_phones.add(phone_key)
        seen_names[name_key] = phone
        email, email_warning = clean_email(row.get(f"tuteur_{slot}_email", ""))
        if email_warning:
            warnings.append(f"tuteur_{slot} : {email_warning}")
        guardians.append(GuardianRequest(
            last_name=last_name, first_names=first_names,
            phone=phone, email=email,
        ))
    # Pas de tuteur : autorisé (liste vide), on continue la construction
    # normale de la fiche — le schéma ChildCreateRequest accepte [].
    authorized: list[AuthorizedPersonRequest] = []
    for slot in AUTHORIZED_SLOTS:
        last_name = row.get(f"autorise_{slot}_nom", "")
        first_names = row.get(f"autorise_{slot}_prenoms", "")
        if not last_name and not first_names and not row.get(f"autorise_{slot}_tel", ""):
            continue
        if not last_name or not first_names:
            raise RowError(f"autorise_{slot} incomplet (nom + prénoms requis)")
        try:
            phone, _ = clean_phone(row.get(f"autorise_{slot}_tel", ""))
        except RowError:
            raise RowError(f"autorise_{slot} : téléphone manquant") from None
        name_key = f"{last_name.lower()}|{first_names.lower()}"
        if f"tel:{phone.lower()}" in seen_phones or name_key in seen_names:
            continue
        seen_phones.add(f"tel:{phone.lower()}")
        seen_names[name_key] = phone
        authorized.append(AuthorizedPersonRequest(
            last_name=last_name, first_names=first_names, phone=phone,
        ))

    residence_address = real_text(row.get("adresse", ""))
    if not residence_address:
        residence_address = ADDRESS_FALLBACK
        warnings.append("adresse manquante → mention par défaut")

    behavioral = real_text(row.get("notes_comportement", ""))
    usual = clean(row.get("nom_usuel", ""))
    first_names_value = clean(row.get("prenoms", ""))
    if usual and usual.lower() not in first_names_value.lower():
        note = f"Nom usuel : {usual}."
        behavioral = f"{note}\n{behavioral}" if behavioral else note

    section_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    section_name = clean(row.get("section", ""))
    if section_name:
        resolved = sections_by_name.get(section_name)
        if resolved is None:
            warnings.append(f"section inconnue ({section_name}) → sans section")
        else:
            section_id, department_id = resolved

    fields = {
        "last_name": clean(row.get("nom", "")),
        "first_names": first_names_value,
        "birth_date": parse_date_value(row.get("date_naissance", ""), "date_naissance"),
        "admission_date": parse_date_value(row.get("date_admission", ""), "date_admission"),
        "residence_address": residence_address,
        "department_id": department_id,
        "section_id": section_id,
        "behavioral_notes": behavioral,
        "preferences": real_text(row.get("preferences", "")),
        "medical_notes": real_text(row.get("notes_medicales", "")),
        "dietary_restrictions": real_text(row.get("restrictions_alimentaires", "")),
        "medications": real_text(row.get("medicaments", "")),
        "doctor_name": real_text(row.get("medecin_nom", "")),
        "doctor_phone": real_text(row.get("medecin_tel", "")),
        "guardians": guardians,
        "authorized_persons": authorized,
    }
    return fields, warnings, parse_status(row.get("statut", ""))


def parse_status(raw: object) -> bool:
    """actif/inactif (vide = actif). Inconnu → rejet (pas de devinette)."""
    text = clean(raw).lower()
    if not text or text in ("actif", "active", "1", "oui", "vrai", "true"):
        return True
    if text in ("inactif", "inactive", "0", "non", "faux", "false"):
        return False
    raise RowError(f"statut inconnu ({clean(raw)[:20]}) — 'actif' ou 'inactif'")


def parse_date_value(raw: object, field: str):
    """ISO (AAAA-MM-JJ, natif Excel) ou JJ/MM/AAAA. Sinon rejet."""
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    text = clean(raw)
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise RowError(f"{field} invalide ({text[:20]}) — AAAA-MM-JJ ou JJ/MM/AAAA")


# ── Lecture du fichier (xlsx + csv, mêmes colonnes) ───────────────
def _normalize_row(raw: dict, lineno: int) -> dict[str, str]:
    """Clés : en-têtes normalisés (minuscules, espaces rognés). Colonnes
    inconnues ignorées ; colonnes canoniques absentes → chaîne vide."""
    normalized = {
        str(k or "").strip().lower(): v for k, v in raw.items() if k is not None
    }
    row = {col: clean(normalized.get(col, "")) for col in IMPORT_COLUMNS}
    if not any(row.values()):
        raise RowError("ligne entièrement vide")
    return row


def read_import_rows(content: bytes, filename: str) -> list[dict[str, str]]:
    """Parse le fichier uploadé → lignes normalisées. Lève ImportFileError
    si le fichier est illisible, RowError par ligne sinon (jamais ici)."""
    name = (filename or "").lower()
    if name.endswith(".xlsx"):
        return _read_xlsx(content)
    if name.endswith(".csv"):
        return _read_csv(content)
    raise ImportFileError("format non pris en charge — .xlsx ou .csv uniquement")


def _read_xlsx(content: bytes) -> list[dict[str, str]]:
    from openpyxl import load_workbook

    try:
        wb = load_workbook(BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        headers = next(rows_iter, None)
    except Exception as exc:
        raise ImportFileError(f"fichier Excel illisible ({exc})") from exc
    if not headers or not any(h is not None and str(h).strip() for h in headers):
        raise ImportFileError("feuille vide ou sans en-têtes")
    header_names = [str(h or "").strip() for h in headers]
    rows: list[dict[str, str]] = []
    for lineno, values in enumerate(rows_iter, start=3):
        raw = dict(zip(header_names, values or []))
        if not any(v is not None and str(v).strip() != "" for v in raw.values()):
            continue
        try:
            rows.append(_normalize_row(raw, lineno))
        except RowError:
            continue
    if not rows:
        raise ImportFileError("aucune ligne de données")
    return rows


def _read_csv(content: bytes) -> list[dict[str, str]]:
    text: str | None = None
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            text = content.decode(encoding)
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    if text is None:
        raise ImportFileError("encodage illisible (ni UTF-8 ni Windows-1252)")
    delimiter = _detect_delimiter(text)
    reader = csv.DictReader(StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        raise ImportFileError("CSV vide ou sans en-têtes")
    rows: list[dict[str, str]] = []
    for lineno, raw in enumerate(reader, start=2):
        raw = {k: v for k, v in (raw or {}).items() if k is not None}
        if not any((v or "").strip() for v in raw.values()):
            continue
        try:
            rows.append(_normalize_row(raw, lineno))
        except RowError:
            continue
    if not rows:
        raise ImportFileError("aucune ligne de données")
    return rows


def _detect_delimiter(text: str) -> str:
    """Sniff ; repli sur le dénombrement (le Sniffer échoue sur les lignes
    majoritairement vides — formats plats). Ordre ';' (format canonique
    LPRDS) puis ',' puis tabulation."""
    try:
        return csv.Sniffer().sniff(text[:4096], delimiters=",;\t").delimiter
    except csv.Error:
        sample = text[:4096]
        counts = {d: sample.count(d) for d in (";", ",", "\t")}
        if counts[";"] >= counts[","] and counts[";"] > 0:
            return ";"
        if counts[","] > 0:
            return ","
        return "\t" if counts["\t"] > 0 else ";"


# ── Rendu CSV (export + modèle) ───────────────────────────────────
def render_csv(headers: list[str], rows: list[list[object]]) -> bytes:
    """CSV avec BOM UTF-8 et séparateur ';' (ouverture directe dans Excel FR)."""
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(headers)
    writer.writerows([[clean(v) for v in row] for row in rows])
    return "\ufeff".encode("utf-8") + buffer.getvalue().encode("utf-8")
