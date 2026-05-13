# File: services/reports/python/theme.py
# Role: palette + styles partagés par tous les modules de rendu PDF.
# Centralise les choix esthétiques pour qu'un changement de ton se répercute
# partout (cover, sommaire, pages synthèse, mode dashboard).

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm

# ─── Palette ───────────────────────────────────────────────────────────────
# Or signature Vyzor — utilisé pour titres, accents, bandes décoratives.
GOLD = colors.HexColor("#C5A059")
GOLD_SOFT = colors.HexColor("#E5C580")
GOLD_LIGHT = colors.HexColor("#FAF7F2")  # fond crème (bandeaux contextuels)

# Tonalités texte / fond
INK = colors.HexColor("#0F172A")
SOFT_INK = colors.HexColor("#27272A")
MUTED = colors.HexColor("#6B7280")
LIGHT = colors.HexColor("#9CA3AF")
PAPER = colors.HexColor("#FFFFFF")
CREAM = colors.HexColor("#FDFCFA")  # fond cover (chaud)
SURFACE = colors.HexColor("#F8FAFC")
ROW_ALT = colors.HexColor("#FAFAFA")
BORDER = colors.HexColor("#E5E7EB")
TRACK = colors.HexColor("#E5E7EB")

# Signaux (constats, badges)
GREEN = colors.HexColor("#10B981")
GREEN_BG = colors.HexColor("#ECFDF5")
YELLOW = colors.HexColor("#F59E0B")
YELLOW_BG = colors.HexColor("#FFFBEB")
ORANGE = colors.HexColor("#F97316")
ORANGE_BG = colors.HexColor("#FFF7ED")
RED = colors.HexColor("#EF4444")
RED_BG = colors.HexColor("#FEF2F2")

# ─── Géométrie ────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4
MARGIN = 2 * cm
CONTENT_WIDTH = PAGE_W - 2 * MARGIN
HALF_WIDTH = CONTENT_WIDTH / 2 - 0.15 * cm
THIRD_WIDTH = CONTENT_WIDTH / 3 - 0.2 * cm
KPI_CARD_HEIGHT = 2.6 * cm


def score_color(score):
    """(color, label_text) selon score 0-100. None → N/D."""
    if score is None:
        return LIGHT, "N/D"
    s = float(score)
    if s >= 80:
        return GREEN, "Excellent"
    if s >= 60:
        return YELLOW, "Bon"
    if s >= 40:
        return ORANGE, "Fragile"
    return RED, "Critique"


def pillar_color(value):
    if value is None:
        return LIGHT
    v = float(value)
    if v >= 80:
        return GREEN
    if v >= 60:
        return YELLOW
    if v >= 40:
        return ORANGE
    return RED


def signal_palette(severity: str):
    """(stripe_color, bg_color) pour les blocs de constats."""
    if severity == "positive":
        return GREEN, GREEN_BG
    if severity == "warning":
        return ORANGE, ORANGE_BG
    if severity == "info":
        return GOLD, GOLD_LIGHT
    return RED, RED_BG  # "risk" par défaut


def hex_str(color):
    """Hex string `#RRGGBB` pour les balises Paragraph (font color=...)."""
    return "#" + color.hexval().replace("0x", "")[-6:]


# ─── Styles texte ──────────────────────────────────────────────────────────
def build_styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle(
            name="QH1", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=24, leading=30, textColor=INK, spaceAfter=4,
        ),
        "h2": ParagraphStyle(
            name="QH2", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=18, leading=22, textColor=INK, spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            name="QSubtitle", parent=base["BodyText"], fontName="Helvetica",
            fontSize=11, leading=14, textColor=MUTED, spaceAfter=6,
        ),
        "section": ParagraphStyle(
            name="QSection", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=13, leading=17, textColor=GOLD, spaceBefore=4, spaceAfter=4,
        ),
        "section_caps": ParagraphStyle(
            name="QSectionCaps", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=10, leading=13, textColor=GOLD, spaceBefore=2, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            name="QBody", parent=base["BodyText"], fontName="Helvetica",
            fontSize=10, leading=13, textColor=INK,
        ),
        "body_lg": ParagraphStyle(
            name="QBodyLg", parent=base["BodyText"], fontName="Helvetica",
            fontSize=11, leading=15, textColor=INK,
        ),
        "muted": ParagraphStyle(
            name="QMuted", parent=base["BodyText"], fontName="Helvetica",
            fontSize=8.5, leading=11, textColor=MUTED,
        ),
        "muted_sm": ParagraphStyle(
            name="QMutedSm", parent=base["BodyText"], fontName="Helvetica",
            fontSize=7.5, leading=10, textColor=MUTED,
        ),
        "kpi_label": ParagraphStyle(
            name="QKpiLabel", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=8, leading=10, textColor=GOLD, spaceAfter=2,
        ),
        "kpi_value": ParagraphStyle(
            name="QKpiValue", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=15, leading=18, textColor=INK, spaceAfter=2,
        ),
        "kpi_value_lg": ParagraphStyle(
            name="QKpiValueLg", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=20, leading=24, textColor=INK, spaceAfter=2,
        ),
        "kpi_help": ParagraphStyle(
            name="QKpiHelp", parent=base["BodyText"], fontName="Helvetica",
            fontSize=7.5, leading=10, textColor=MUTED,
        ),
        "list": ParagraphStyle(
            name="QList", parent=base["BodyText"], fontName="Helvetica",
            fontSize=9.5, leading=13, textColor=INK,
        ),
        "footer_note": ParagraphStyle(
            name="QFooterNote", parent=base["BodyText"], fontName="Helvetica-Oblique",
            fontSize=7.5, leading=10, textColor=MUTED, alignment=1,
        ),
        "cover_brand": ParagraphStyle(
            name="QCoverBrand", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=44, leading=50, textColor=GOLD, alignment=0, spaceAfter=2,
        ),
        "cover_tagline": ParagraphStyle(
            name="QCoverTagline", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=10, leading=12, textColor=GOLD, alignment=0,
        ),
        "cover_company": ParagraphStyle(
            name="QCoverCompany", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=32, leading=38, textColor=INK, spaceAfter=8,
        ),
        "cover_meta": ParagraphStyle(
            name="QCoverMeta", parent=base["BodyText"], fontName="Helvetica",
            fontSize=10, leading=14, textColor=SOFT_INK,
        ),
        "report_title": ParagraphStyle(
            name="QReportTitle", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=18, leading=22, textColor=INK,
        ),
        "report_meta": ParagraphStyle(
            name="QReportMeta", parent=base["BodyText"], fontName="Helvetica",
            fontSize=9.5, leading=13, textColor=SOFT_INK,
        ),
        "tile_label": ParagraphStyle(
            name="QTileLabel", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=8, leading=10, textColor=MUTED, spaceAfter=2,
        ),
        "tile_value": ParagraphStyle(
            name="QTileValue", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=14, leading=17, textColor=INK,
        ),
    }
