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

from app.core.i18n import DEFAULT_LOCALE, Locale, t

# Les 6 domaines du bulletin, dans l'ordre d'impression. Seuls les CODES sont
# ici : les libellés viennent du catalogue, comme le vocabulaire des rapports.
_DOMAIN_FIELDS = (
    "oral_written_language",
    "physical_activities",
    "artistic_activities",
    "math_foundations",
    "world_exploration",
    "english",
)


def render_annual_report_pdf(
    *,
    establishment_name: str,
    child_full_name: str,
    period_label: str,
    content: dict,
    locale: Locale = DEFAULT_LOCALE,
) -> bytes:
    """Rendu synchrone (bloquant) — appelé via `asyncio.to_thread`.

    La locale est un paramètre explicite et non la langue de la requête : le
    document part vers UN parent, dans SA langue, et rien ne garantit que
    l'appel reste dans le contexte de sa requête (il passe par un thread).
    """
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
        Paragraph(t("reports.pdf.title", locale), title_style),
        Paragraph(child_full_name, subtitle_style),
        Paragraph(period_label, subtitle_style),
        Spacer(1, 0.8 * cm),
    ]

    rows = [[
        Paragraph(t("reports.pdf.column.domain", locale), domain_style),
        Paragraph(t("reports.pdf.column.rating", locale), domain_style),
        Paragraph(t("reports.pdf.column.observation", locale), domain_style),
    ]]
    for field in _DOMAIN_FIELDS:
        assessment = content[field]
        rating_label = t(
            f"reports.vocabulary.acquisition_level.{assessment['rating']}", locale
        )
        rows.append([
            Paragraph(t(f"reports.domains.{field}", locale), cell_style),
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
