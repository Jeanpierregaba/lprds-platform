"""
Génération du PDF du bulletin annuel — seul type de rapport téléchargeable en
PDF (mise en page bulletin par domaine, spécifique à `AnnualReportContent`).
Rendu synchrone (reportlab est bloquant) ; à appeler via `asyncio.to_thread`
depuis le service pour ne pas bloquer la boucle événementielle.
"""

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.modules.reports.models import ACQUISITION_LEVEL_LABELS, AcquisitionLevel

_DOMAIN_LABELS: dict[str, str] = {
    "oral_written_language": "Développement et structuration du langage oral et écrit",
    "physical_activities": "Agir, s'exprimer, comprendre à travers les activités physiques",
    "artistic_activities": "Agir, s'exprimer, comprendre à travers les activités artistiques",
    "math_foundations": "L'acquisition des premiers outils mathématiques",
    "world_exploration": "Explorer le monde",
    "english": "Anglais",
}


def render_annual_report_pdf(
    *,
    establishment_name: str,
    child_full_name: str,
    period_label: str,
    content: dict,
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=2 * cm, bottomMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"], fontSize=16, spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=styles["Normal"], fontSize=11, textColor=colors.grey,
    )
    cell_style = ParagraphStyle("Cell", parent=styles["Normal"], fontSize=9, leading=12)
    domain_style = ParagraphStyle(
        "Domain", parent=styles["Normal"], fontSize=9, leading=12, fontName="Helvetica-Bold",
    )

    story = [
        Paragraph(establishment_name, subtitle_style),
        Paragraph("Bulletin annuel", title_style),
        Paragraph(child_full_name, subtitle_style),
        Paragraph(period_label, subtitle_style),
        Spacer(1, 0.8 * cm),
    ]

    rows = [[
        Paragraph("Domaine", domain_style),
        Paragraph("Notation", domain_style),
        Paragraph("Observation de l'éducatrice", domain_style),
    ]]
    for field, label in _DOMAIN_LABELS.items():
        assessment = content[field]
        rating_label = ACQUISITION_LEVEL_LABELS[AcquisitionLevel(assessment["rating"])]
        rows.append([
            Paragraph(label, cell_style),
            Paragraph(rating_label, cell_style),
            Paragraph(assessment["observation"], cell_style),
        ])

    table = Table(rows, colWidths=[5.5 * cm, 3 * cm, 8 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e8")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)

    doc.build(story)
    return buffer.getvalue()
