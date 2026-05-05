#!/usr/bin/env python3
# coding: utf-8
"""
Quantis — rapport d'analyse financière (4 pages denses).

Lit un payload JSON sur stdin, écrit un PDF (binaire) sur stdout.
Le contrat d'entrée est défini par le service TypeScript appelant
(services/reports/financialReportPdf.ts) — voir `ReportPayload` côté TS.
Toutes les agrégations (P&L, bilan, KPIs, recommendations) sont précalculées
par le TS ; ce script ne fait QUE de la mise en page.

Layout cible (4 pages denses) :
  1. Cover : score circle + 4 piliers
  2. Synthèse financière : hero KPIs + tableau récap + graphe tendance + alertes
  3. Création de valeur ▸ Investissement & BFR (2 sections combinées)
  4. Financement ▸ Rentabilité & Performance + Points forts / Axes (combiné)

Les cartes KPI dont la valeur est null sont MASQUÉES.
Les sections sont rendues dans le même flux platypus pour qu'aucune section
ne consomme une page entière à elle seule.
"""
from __future__ import annotations

import io
import json
import sys
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    Image,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.graphics.shapes import Circle, Drawing, Rect, String
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend


# ─── Palette ───────────────────────────────────────────────────────────────
GOLD = colors.HexColor("#C5A059")
INK = colors.HexColor("#0F172A")
SOFT_INK = colors.HexColor("#27272A")
MUTED = colors.HexColor("#6B7280")
LIGHT = colors.HexColor("#9CA3AF")
PAPER = colors.HexColor("#FFFFFF")
SURFACE = colors.HexColor("#F8FAFC")
ROW_ALT = colors.HexColor("#F5F5F5")
BORDER = colors.HexColor("#E5E7EB")
TRACK = colors.HexColor("#E5E7EB")

GREEN = colors.HexColor("#10B981")
YELLOW = colors.HexColor("#F59E0B")
ORANGE = colors.HexColor("#F97316")
RED = colors.HexColor("#EF4444")

# Largeur utile (page A4 - 2 marges).
CONTENT_WIDTH = A4[0] - 4 * cm
HALF_WIDTH = CONTENT_WIDTH / 2 - 0.15 * cm  # petite gouttière entre 2 cartes
THIRD_WIDTH = CONTENT_WIDTH / 3 - 0.2 * cm

# Hauteur uniforme de carte KPI (pour aligner toutes les grilles 2-col).
KPI_CARD_HEIGHT = 2.6 * cm


def score_color(score: float | int | None) -> tuple[colors.Color, str]:
    if score is None:
        return LIGHT, "N/D"
    if score >= 80:
        return GREEN, "Excellent"
    if score >= 60:
        return YELLOW, "Bon"
    if score >= 40:
        return ORANGE, "Fragile"
    return RED, "Critique"


def pillar_color(value: float | int | None) -> colors.Color:
    if value is None:
        return LIGHT
    if value >= 80:
        return GREEN
    if value >= 60:
        return YELLOW
    if value >= 40:
        return ORANGE
    return RED


# ─── Styles texte ──────────────────────────────────────────────────────────
def build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle(
            name="QH1", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=22, leading=28, textColor=INK, spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            name="QSubtitle", parent=base["BodyText"], fontName="Helvetica",
            fontSize=11, leading=14, textColor=MUTED, spaceAfter=6,
        ),
        "section": ParagraphStyle(
            name="QSection", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=13, leading=17, textColor=GOLD, spaceBefore=4, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            name="QBody", parent=base["BodyText"], fontName="Helvetica",
            fontSize=10, leading=13, textColor=INK,
        ),
        "muted": ParagraphStyle(
            name="QMuted", parent=base["BodyText"], fontName="Helvetica",
            fontSize=8.5, leading=11, textColor=MUTED,
        ),
        "kpi_label": ParagraphStyle(
            name="QKpiLabel", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=8, leading=10, textColor=MUTED, spaceAfter=2,
        ),
        "kpi_value": ParagraphStyle(
            name="QKpiValue", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=15, leading=18, textColor=INK, spaceAfter=2,
        ),
        "kpi_value_lg": ParagraphStyle(
            name="QKpiValueLg", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=18, leading=22, textColor=INK, spaceAfter=2,
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
            fontSize=8, leading=10, textColor=MUTED, alignment=1,
        ),
    }


# ─── Header / footer ───────────────────────────────────────────────────────
def draw_chrome(canvas, doc, payload: dict[str, Any]) -> None:
    canvas.saveState()
    page_num = canvas.getPageNumber()
    company = payload.get("companyName") or "Quantis"
    logo_path = payload.get("logoPath")

    if page_num > 1:
        if logo_path:
            try:
                canvas.drawImage(
                    logo_path,
                    2 * cm, A4[1] - 1.55 * cm,
                    width=0.85 * cm, height=0.85 * cm,
                    preserveAspectRatio=True, mask="auto",
                )
            except Exception:
                pass
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 9)
        canvas.drawString(3.1 * cm, A4[1] - 1.1 * cm, company)
        # Pagination relative au total dynamique stocké côté payload.
        total = payload.get("_pageTotal") or 4
        canvas.drawRightString(A4[0] - 2 * cm, A4[1] - 1.1 * cm, f"Page {page_num} / {total}")
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.4)
        canvas.line(2 * cm, A4[1] - 1.7 * cm, A4[0] - 2 * cm, A4[1] - 1.7 * cm)

    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica-Oblique", 7.5)
    # Footer enrichi : source + date sur la dernière page intéressent un lecteur
    # qui filerait un PDF imprimé — autant les avoir sur toutes les pages, ça
    # évite un paragraphe orphelin en fin de rapport.
    source_label = (payload.get("source") or {}).get("providerLabel")
    report_date = payload.get("reportDate")
    if source_label and report_date:
        footer = f"Rapport confidentiel — Quantis  ·  Source : {source_label}  ·  Émis le {report_date}"
    else:
        footer = "Rapport confidentiel — Quantis"
    canvas.drawCentredString(A4[0] / 2, 1.1 * cm, footer)
    canvas.restoreState()


# ─── Helpers ────────────────────────────────────────────────────────────────
def _gold_rule(width: float = CONTENT_WIDTH, height: float = 1.0) -> Drawing:
    drawing = Drawing(width, height + 2)
    drawing.add(Rect(0, 1, width, height, fillColor=GOLD, strokeColor=GOLD))
    return drawing


def _section_title(text: str, styles, top_spacer: float = 0) -> list:
    flow: list = []
    if top_spacer > 0:
        flow.append(Spacer(1, top_spacer))
    flow.append(Paragraph(text, styles["section"]))
    flow.append(_gold_rule())
    flow.append(Spacer(1, 6))
    return flow


# ─── Page 1 — Cover ────────────────────────────────────────────────────────
def build_page1(payload: dict[str, Any], styles) -> list:
    flow: list = []
    company = payload.get("companyName") or "Quantis"
    logo_path = payload.get("logoPath")

    if logo_path:
        try:
            img = Image(logo_path, width=1.6 * cm, height=1.6 * cm)
            img.hAlign = "LEFT"
            flow.append(img)
            flow.append(Spacer(1, 4))
        except Exception:
            pass

    flow.append(Paragraph("Rapport d'analyse financière", styles["h1"]))
    flow.append(Paragraph(company, styles["subtitle"]))
    flow.append(_gold_rule())
    flow.append(Spacer(1, 22))

    qs = payload.get("quantisScore") or {}
    score_value = qs.get("score")
    if score_value is not None:
        flow.append(_score_block(float(score_value), styles))
        flow.append(Spacer(1, 22))

    pillars = (qs.get("piliers") or [])[:4]
    if pillars:
        flow.append(_pillars_grid(pillars, styles))

    flow.append(Spacer(1, 36))
    period_label = payload.get("periodLabel") or ""
    generated = payload.get("reportDate") or ""
    flow.append(Paragraph(
        f"Période fiscale : {period_label} · Généré le {generated} · Confidentiel",
        styles["footer_note"],
    ))
    return flow


def _score_block(score: float, styles) -> Table:
    color, level_label = score_color(score)
    diameter = 110

    drawing = Drawing(diameter, diameter)
    drawing.add(Circle(diameter / 2, diameter / 2, diameter / 2 - 1, fillColor=color, strokeColor=color))
    drawing.add(Circle(diameter / 2, diameter / 2, diameter / 2 - 7, fillColor=PAPER, strokeColor=PAPER))
    drawing.add(String(diameter / 2, diameter / 2 - 9, f"{int(round(score))}",
                       fontName="Helvetica-Bold", fontSize=30, fillColor=color, textAnchor="middle"))

    score_caption = Paragraph(
        f"<para alignment='center'><font face='Helvetica-Bold' size=14 color='#0F172A'>"
        f"{int(round(score))} / 100</font></para>", styles["body"])
    badge_color_hex = "#" + color.hexval().replace("0x", "")[-6:]
    badge = Paragraph(
        f"<para alignment='center'><font face='Helvetica-Bold' size=10 color='#FFFFFF' "
        f"backColor='{badge_color_hex}'> &nbsp;{level_label}&nbsp; </font></para>", styles["body"])

    table = Table([[drawing], [score_caption], [badge]], colWidths=[CONTENT_WIDTH])
    table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return table


def _pillar_card(pillar: dict[str, Any], styles) -> Table:
    label = pillar.get("label", "")
    value = pillar.get("value")
    value_label = pillar.get("valueLabel") or (f"{int(round(value))} / 100" if value is not None else "N/D")
    color = pillar_color(value if value is not None else None)

    bar_width = 7.3 * cm
    bar_height = 5
    fill_ratio = (value or 0) / 100.0
    drawing = Drawing(bar_width, bar_height)
    drawing.add(Rect(0, 0, bar_width, bar_height, fillColor=TRACK, strokeColor=TRACK, rx=2, ry=2))
    if fill_ratio > 0:
        drawing.add(Rect(0, 0, bar_width * fill_ratio, bar_height, fillColor=color, strokeColor=color, rx=2, ry=2))

    color_hex = "#" + color.hexval().replace("0x", "")[-6:]
    head = Table([[
        Paragraph(f"<font face='Helvetica-Bold' size=10 color='#0F172A'>{label}</font>", styles["body"]),
        Paragraph(f"<para alignment='right'><font face='Helvetica-Bold' size=10 color='{color_hex}'>{value_label}</font></para>", styles["body"]),
    ]], colWidths=[4.3 * cm, 3 * cm])
    head.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    cell = Table([[head], [drawing]], colWidths=[7.3 * cm])
    cell.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
    ]))
    return cell


def _pillars_grid(pillars: list[dict[str, Any]], styles) -> Table:
    cells = [_pillar_card(p, styles) for p in pillars]
    while len(cells) < 4:
        cells.append("")
    rows = [[cells[0], cells[1]], [cells[2], cells[3]]]
    table = Table(rows, colWidths=[HALF_WIDTH, HALF_WIDTH])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


# ─── Carte KPI (utilisée partout après page 1) ─────────────────────────────
def _kpi_card(label: str, value_label: str | None, description: str, styles, value_style: str = "kpi_value") -> Table | None:
    """Renvoie None si la valeur est manquante — la carte est alors masquée."""
    if value_label is None:
        return None
    inner = Table(
        [
            [Paragraph(label.upper(), styles["kpi_label"])],
            [Paragraph(value_label, styles[value_style])],
            [Paragraph(description, styles["kpi_help"])],
        ],
        colWidths=[None],
    )
    inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (0, 0), 10),
        ("TOPPADDING", (0, 1), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 2), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -2), 0),
        ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
        ("LINEBEFORE", (0, 0), (0, -1), 3, GOLD),
    ]))
    return inner


def _kpi_grid(cards: list[Any], cols: int = 2) -> Table | Paragraph:
    """Grille à `cols` colonnes ; ignore les None ; rowHeight uniforme pour
    aligner proprement chaque rangée."""
    visible = [c for c in cards if c is not None]
    if not visible:
        return Paragraph("Aucun indicateur disponible.", getSampleStyleSheet()["BodyText"])
    rows: list[list[Any]] = []
    row: list[Any] = []
    for c in visible:
        row.append(c)
        if len(row) == cols:
            rows.append(row)
            row = []
    if row:
        while len(row) < cols:
            row.append("")
        rows.append(row)
    col_widths = [HALF_WIDTH] * cols if cols == 2 else [THIRD_WIDTH] * cols
    table = Table(rows, colWidths=col_widths, rowHeights=[KPI_CARD_HEIGHT] * len(rows))
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def _build_section_cards(items: list[dict[str, Any]], styles) -> list:
    cards = [
        _kpi_card(it.get("label", ""), it.get("valueLabel"), it.get("description", ""), styles)
        for it in items
    ]
    return cards


# ─── Page 2 — Synthèse + tendance + alertes ────────────────────────────────
def build_page2(payload: dict[str, Any], styles) -> list:
    flow: list = []
    flow += _section_title("Synthèse financière", styles)

    # Hero KPIs : 3 cartes en ligne avec valeur en GROS.
    hero = payload.get("heroKpis") or []
    hero_cells = []
    for item in hero[:3]:
        card = _kpi_card(item.get("label", ""), item.get("valueLabel"), "", styles, value_style="kpi_value_lg")
        if card is not None:
            hero_cells.append(card)
    if hero_cells:
        widths = [THIRD_WIDTH] * 3
        while len(hero_cells) < 3:
            hero_cells.append("")
        hero_table = Table([hero_cells], colWidths=widths, rowHeights=[2.0 * cm])
        hero_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, 0), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        flow.append(hero_table)

    # Tableau récap.
    summary_rows = [r for r in (payload.get("summaryRows") or []) if r.get("valueLabel")]
    if summary_rows:
        rows = [[r.get("label", ""), r.get("valueLabel", "")] for r in summary_rows]
        table = Table(rows, colWidths=[CONTENT_WIDTH * 0.62, CONTENT_WIDTH * 0.38])
        table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ]))
        flow.append(table)
        flow.append(Spacer(1, 10))

    # Mini graphe tendance 6 mois — INLINE sur la page synthèse.
    monthly = payload.get("monthlyChart") or []
    if len(monthly) >= 2:
        flow.append(Paragraph("<b>Tendance — CA et charges (6 derniers mois)</b>", styles["body"]))
        flow.append(Spacer(1, 4))
        flow.append(_compact_monthly_chart(monthly))
        flow.append(Spacer(1, 8))

    # Alertes + Recommandations en colonnes côte-à-côte (gain de place).
    alerts = payload.get("alerts") or []
    recos = payload.get("recommendations") or []
    flow.append(_alerts_recos_block(alerts, recos, styles))

    # Points forts / Axes d'amélioration : même famille d'actionnables que les
    # alertes/recos, donc on les regroupe sur la même page synthèse.
    strengths = payload.get("strengths") or []
    improvements = payload.get("improvements") or []
    if strengths or improvements:
        flow.append(Spacer(1, 8))
        flow.append(_strengths_improvements_block(strengths, improvements, styles))
    return flow


def _compact_monthly_chart(monthly: list[dict[str, Any]]) -> Drawing:
    drawing = Drawing(CONTENT_WIDTH, 130)
    chart = VerticalBarChart()
    chart.x = 50
    chart.y = 35
    chart.width = CONTENT_WIDTH - 80
    chart.height = 80
    months = [m.get("month", "") for m in monthly]
    ca_series = [m.get("ca", 0) for m in monthly]
    ch_series = [m.get("charges", 0) for m in monthly]
    chart.data = [ca_series, ch_series]
    chart.bars[0].fillColor = GOLD
    chart.bars[1].fillColor = SOFT_INK
    chart.barWidth = 12
    chart.groupSpacing = 8
    chart.categoryAxis.categoryNames = months
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 7.5
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 7
    drawing.add(chart)

    # Légende manuelle (le composant Legend de reportlab clip une des séries
    # quand 2 entrées rentrent dans le même flux côté Drawing → on dessine à la main).
    legend_y = 8
    drawing.add(Rect(50, legend_y, 10, 8, fillColor=GOLD, strokeColor=GOLD))
    drawing.add(String(65, legend_y + 1, "Chiffre d'affaires",
                        fontName="Helvetica", fontSize=8, fillColor=INK))
    drawing.add(Rect(170, legend_y, 10, 8, fillColor=SOFT_INK, strokeColor=SOFT_INK))
    drawing.add(String(185, legend_y + 1, "Charges totales d'exploitation",
                        fontName="Helvetica", fontSize=8, fillColor=INK))
    return drawing


def _alerts_recos_block(alerts: list[dict[str, Any]], recos: list[str], styles) -> Table:
    # Colonne gauche : alertes (rouge). Colonne droite : recommandations (gold).
    left: list = [Paragraph("<b>Alertes</b>", styles["body"])]
    if alerts:
        for a in alerts[:3]:
            left.append(Paragraph(f"<font color='#EF4444'>●</font>  {a.get('label','')}", styles["list"]))
    else:
        left.append(Paragraph(
            "<font color='#10B981'>●</font>  Aucune alerte majeure détectée sur la période.",
            styles["list"],
        ))

    right: list = [Paragraph("<b>Recommandations</b>", styles["body"])]
    if recos:
        for r in recos[:3]:
            right.append(Paragraph(f"<font color='#C5A059'>●</font>  {r}", styles["list"]))
    else:
        right.append(Paragraph(
            "<font color='#6B7280'>●</font>  Aucune recommandation spécifique pour cette période.",
            styles["list"],
        ))

    table = Table([[left, right]], colWidths=[HALF_WIDTH, HALF_WIDTH])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
    ]))
    return table


# ─── Sections KPI (flow naturel à partir de la page 3) ────────────────────
# Plutôt que de forcer un PageBreak entre chaque section, on laisse reportlab
# paginer naturellement. Un `CondPageBreak` avant chaque section évite qu'un
# titre se retrouve seul en bas d'une page sans au moins une rangée de cartes.
SECTION_MIN_SPACE = 5 * cm  # titre + 1 row de cartes (2.6cm) + marge

def build_kpi_sections(payload: dict[str, Any], styles) -> list:
    """Trois sections KPI au lieu de quatre — la 'Rentabilité' est fusionnée
    dans 'Financement & Performance' pour éviter une 4e page presque vide
    quand seul ROE est rempli (cas typique des données dynamiques où l'on n'a
    pas tous les ratios de rentabilité)."""
    flow: list = []

    # Création de valeur.
    flow += _section_title("Création de valeur & Rentabilité opérationnelle", styles)
    flow.append(_kpi_grid(_build_section_cards(payload.get("valueCreationItems") or [], styles), cols=2))

    # Investissement & BFR.
    flow.append(CondPageBreak(SECTION_MIN_SPACE))
    flow.append(Spacer(1, 6))
    flow += _section_title("Investissement & Gestion du Besoin en Fonds de Roulement", styles)
    flow.append(_kpi_grid(_build_section_cards(payload.get("investmentItems") or [], styles), cols=2))

    # Financement & Performance — fusion des items financement + rentabilité.
    flow.append(CondPageBreak(SECTION_MIN_SPACE))
    flow.append(Spacer(1, 6))
    flow += _section_title("Financement, Rentabilité & Performance", styles)
    merged = (payload.get("financingItems") or []) + (payload.get("profitabilityItems") or [])
    flow.append(_kpi_grid(_build_section_cards(merged, styles), cols=2))
    # NB : le rappel de source / date est imprimé dans le chrome de page (footer
    # commun) pour éviter un paragraphe orphelin sur une dernière page vide.
    return flow


def _strengths_improvements_block(strengths: list[str], improvements: list[str], styles) -> Table:
    left: list = [Paragraph("<font color='#10B981'><b>Points forts</b></font>", styles["body"])]
    for s in strengths:
        left.append(Paragraph(s, styles["list"]))
    if not strengths:
        left.append(Paragraph("Données insuffisantes pour identifier des points forts.", styles["muted"]))

    right: list = [Paragraph("<font color='#EF4444'><b>Axes d'amélioration</b></font>", styles["body"])]
    for s in improvements:
        right.append(Paragraph(f"› {s}", styles["list"]))
    if not improvements:
        right.append(Paragraph("Aucun axe d'amélioration prioritaire identifié.", styles["muted"]))

    table = Table([[left, right]], colWidths=[HALF_WIDTH, HALF_WIDTH])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return table


# ─── Document builder ──────────────────────────────────────────────────────
def _build_story(payload: dict[str, Any], styles) -> list:
    """Construit l'arbre Flowables. Page 1 et page 2 sont fixes (PageBreak forcé) ;
    les sections KPI suivantes flottent naturellement avec CondPageBreak."""
    story: list = []
    story += build_page1(payload, styles)
    story.append(PageBreak())
    story += build_page2(payload, styles)
    story.append(PageBreak())
    story += build_kpi_sections(payload, styles)
    return story


def _make_doc(buf: io.BytesIO, on_page=None) -> BaseDocTemplate:
    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=1.8 * cm,
        title="Rapport d'analyse financière Quantis",
        author="Quantis",
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
        id="content", showBoundary=0,
    )
    template = PageTemplate(
        id="quantis",
        frames=[frame],
        onPage=on_page or (lambda canvas, d: None),
    )
    doc.addPageTemplates([template])
    return doc


def build_document(payload: dict[str, Any]) -> bytes:
    """2-pass build : on construit d'abord pour compter les pages, puis on
    rebuild avec le bon `_pageTotal` injecté dans le chrome (`Page X / N`)."""
    styles = build_styles()

    # Pass 1 : compter les pages (chrome ignoré).
    counter_buf = io.BytesIO()
    counter_doc = _make_doc(counter_buf)
    counter_doc.build(_build_story(payload, styles))
    payload["_pageTotal"] = max(counter_doc.page, 1)

    # Pass 2 : rendu final avec chrome.
    out_buf = io.BytesIO()
    out_doc = _make_doc(out_buf, on_page=lambda canvas, d: draw_chrome(canvas, d, payload))
    out_doc.build(_build_story(payload, styles))
    return out_buf.getvalue()


def main() -> int:
    raw = sys.stdin.buffer.read()
    if not raw:
        sys.stderr.write("Empty stdin\n")
        return 2
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"Invalid JSON on stdin: {exc}\n")
        return 2
    try:
        pdf = build_document(payload)
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"PDF build failed: {type(exc).__name__}: {exc}\n")
        return 3
    sys.stdout.buffer.write(pdf)
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
