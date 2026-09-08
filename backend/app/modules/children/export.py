"""
Export des fiches enfants (Excel / CSV) + modèle d'import vierge.

Rendu synchrone (openpyxl bloquant) ; à appeler via `asyncio.to_thread`
depuis le service — même pattern que `attendance/export.py` et
`reports/pdf.py`. Les colonnes sont le format canonique de `children/io.py`
(IMPORT_COLUMNS) : l'export est directement réimportable (round-trip via le
matricule — cf. `import_children`).

Données sensibles (RGPD) : l'export contient les contacts des tuteurs — il
est réservé aux porteurs de `children:read` et téléchargé, jamais affiché.
"""

from io import BytesIO

from app.modules.children.io import IMPORT_COLUMNS, render_csv

_TEMPLATE_HELP = [
    ("matricule", "Vide = création. Renseignez le matricule (export) pour mettre à jour."),
    ("nom / prenoms", "Obligatoires."),
    ("nom_usuel", "Optionnel — repris dans les notes si différent des prénoms."),
    ("date_naissance / date_admission", "AAAA-MM-JJ (ou JJ/MM/AAAA). Admission ≥ naissance."),
    ("adresse", "Obligatoire (mention par défaut si vide, signalée)."),
    ("statut", "actif / inactif (vide = actif)."),
    ("section", "Nom exact de la section. Inconnu = sans section + avertissement."),
    ("tuteur_1..3", "Au moins UN tuteur complet (nom, prénoms, tél) par enfant."),
    ("autorise_1..2", "Personnes autorisées à récupérer l'enfant."),
]


def _child_to_row(child) -> list[object]:
    """Une fiche ORM (relations chargées) → ligne du format canonique."""
    guardians = sorted(child.guardians, key=lambda g: (g.last_name, g.first_names))
    authorized = sorted(
        child.authorized_persons, key=lambda a: (a.last_name, a.first_names)
    )

    def guardian_cells(idx: int) -> list[object]:
        if idx < len(guardians):
            g = guardians[idx]
            return [g.last_name, g.first_names, g.phone, g.email or ""]
        return ["", "", "", ""]

    def authorized_cells(idx: int) -> list[object]:
        if idx < len(authorized):
            a = authorized[idx]
            return [a.last_name, a.first_names, a.phone]
        return ["", "", ""]

    return [
        child.matricule, child.last_name, child.first_names, "",
        child.birth_date.isoformat(), child.admission_date.isoformat(),
        child.residence_address or "",
        "actif" if child.is_active else "inactif",
        child.section.name if child.section else "",
        child.behavioral_notes or "", child.preferences or "",
        child.medical_notes or "", child.dietary_restrictions or "",
        child.medications or "", child.doctor_name or "",
        child.doctor_phone or "",
        *guardian_cells(0), *guardian_cells(1), *guardian_cells(2),
        *authorized_cells(0), *authorized_cells(1),
    ]


def render_children_xlsx(children: list, example: bool = False) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Enfants"

    header_fill = PatternFill("solid", fgColor="005840")
    header_font = Font(bold=True, color="FFFFFF")
    for col_idx, header in enumerate(IMPORT_COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font

    data = list(children)
    if example and not data:
        data = [None]
    for row_idx, child in enumerate(data, start=2):
        values = _child_to_row(child) if child is not None else _example_row()
        for col_idx, value in enumerate(values, start=1):
            ws.cell(row=row_idx, column=col_idx, value=value if value != "" else None)

    if example:
        help_ws = wb.create_sheet("Aide")
        help_ws["A1"] = "Colonne"
        help_ws["B1"] = "Règle"
        for cell in (help_ws["A1"], help_ws["B1"]):
            cell.fill = header_fill
            cell.font = header_font
        for i, (col, rule) in enumerate(_TEMPLATE_HELP, start=2):
            help_ws.cell(row=i, column=1, value=col)
            help_ws.cell(row=i, column=2, value=rule)
        help_ws.column_dimensions["A"].width = 24
        help_ws.column_dimensions["B"].width = 90

    last_row = 1 + len(data)
    ws.freeze_panes = "A2"
    last_col = get_column_letter(len(IMPORT_COLUMNS))
    ws.auto_filter.ref = f"A1:{last_col}{last_row}"
    for col_idx in range(1, len(IMPORT_COLUMNS) + 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = 18

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def render_children_csv(children: list) -> bytes:
    return render_csv(
        IMPORT_COLUMNS, [_child_to_row(c) for c in children]
    )


def render_template_csv() -> bytes:
    return render_csv(IMPORT_COLUMNS, [_example_row()])


def _example_row() -> list[object]:
    row = [""] * len(IMPORT_COLUMNS)
    by_name = {name: i for i, name in enumerate(IMPORT_COLUMNS)}
    row[by_name["nom"]] = "DUPONT"
    row[by_name["prenoms"]] = "Aya Marie"
    row[by_name["date_naissance"]] = "2022-03-14"
    row[by_name["date_admission"]] = "2024-09-02"
    row[by_name["adresse"]] = "12 rue des Palmiers, Lomé"
    row[by_name["statut"]] = "actif"
    row[by_name["section"]] = "Soleil"
    row[by_name["tuteur_1_nom"]] = "DUPONT"
    row[by_name["tuteur_1_prenoms"]] = "Koffi"
    row[by_name["tuteur_1_tel"]] = "+228 90 00 00 00"
    row[by_name["tuteur_1_email"]] = "koffi.dupont@example.tg"
    return row
