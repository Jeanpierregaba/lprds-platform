"""
Export des présences (PDF / Excel) — statut agrégé par personne × jour.

Rendu synchrone (reportlab / openpyxl sont bloquants) ; à appeler via
`asyncio.to_thread` depuis le service pour ne pas bloquer la boucle
événementielle — même pattern que `reports/pdf.py`.

Les deux rendus consomment la même liste de `AttendanceExportRow` produite
par `attendance/service.py::_build_export_rows` : une ligne par personne et
par jour de la période.
"""

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.modules.attendance.schemas import AttendanceExportRow

_HEADERS = [
    "Type",
    "Nom",
    "Matricule",
    "Date",
    "Statut",
    "Arrivée",
    "Départ",
    "Retard (min)",
    "Cantine",
]


def _time_str(value) -> str:
    if value is None:
        return "—"
    return value.strftime("%H:%M")


def _date_str(value) -> str:
    return value.strftime("%d/%m/%Y")


def _meal_str(value) -> str:
    if value is None:
        return "—"
    return "Oui" if value else "Non"


def _late_str(value) -> str:
    return "—" if value is None else str(value)


def render_attendance_pdf(
    establishment_name: str,
    date_from,
    date_to,
    rows: list[AttendanceExportRow],
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        topMargin=1.8 * cm, bottomMargin=1.8 * cm,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"], fontSize=14, spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=styles["Normal"], fontSize=10, textColor=colors.grey,
    )
    cell_style = ParagraphStyle("Cell", parent=styles["Normal"], fontSize=8, leading=10)
    header_style = ParagraphStyle(
        "Header", parent=styles["Normal"], fontSize=8, leading=10,
        fontName="Helvetica-Bold",
    )

    story = [
        Paragraph(establishment_name, subtitle_style),
        Paragraph("Export des présences", title_style),
        Paragraph(
            f"Période du {_date_str(date_from)} au {_date_str(date_to)} — "
            f"{len(rows)} ligne(s)",
            subtitle_style,
        ),
        Spacer(1, 0.6 * cm),
    ]

    table_rows = [[Paragraph(h, header_style) for h in _HEADERS]]
    for r in rows:
        table_rows.append([
            Paragraph(r.person_type, cell_style),
            Paragraph(r.name, cell_style),
            Paragraph(r.matricule or "—", cell_style),
            Paragraph(_date_str(r.date), cell_style),
            Paragraph(r.status, cell_style),
            Paragraph(_time_str(r.arrival_time), cell_style),
            Paragraph(_time_str(r.departure_time), cell_style),
            Paragraph(_late_str(r.late_minutes), cell_style),
            Paragraph(_meal_str(r.meal_taken), cell_style),
        ])

    table = Table(table_rows, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e8")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(table)

    doc.build(story)
    return buffer.getvalue()


def render_attendance_xlsx(
    establishment_name: str,
    date_from,
    date_to,
    rows: list[AttendanceExportRow],
) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Présences"

    ws["A1"] = establishment_name
    ws["A2"] = f"Période du {_date_str(date_from)} au {_date_str(date_to)}"
    ws["A3"] = f"{len(rows)} ligne(s)"

    header_fill = PatternFill("solid", fgColor="E8E8E8")
    header_font = Font(bold=True)
    for col_idx, header in enumerate(_HEADERS, start=1):
        cell = ws.cell(row=5, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font

    for row_idx, r in enumerate(rows, start=6):
        ws.cell(row=row_idx, column=1, value=r.person_type)
        ws.cell(row=row_idx, column=2, value=r.name)
        ws.cell(row=row_idx, column=3, value=r.matricule or None)
        ws.cell(row=row_idx, column=4, value=_date_str(r.date))
        ws.cell(row=row_idx, column=5, value=r.status)
        ws.cell(row=row_idx, column=6, value=_time_str(r.arrival_time))
        ws.cell(row=row_idx, column=7, value=_time_str(r.departure_time))
        ws.cell(row=row_idx, column=8, value=r.late_minutes)
        ws.cell(row=row_idx, column=9, value=_meal_str(r.meal_taken))

    ws.freeze_panes = "A6"
    ws.auto_filter.ref = f"A5:I{5 + len(rows)}"
    for col_idx in range(1, len(_HEADERS) + 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = 14

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()