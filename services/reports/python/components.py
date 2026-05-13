# File: services/reports/python/components.py
# Role: briques de rendu réutilisables (KPI tile, gauge circulaire, barre
# horizontale, table comptable, bloc constat, filet décoratif…). Les pages
# composent ces briques sans connaître les détails d'implémentation.

import math

from reportlab.graphics.shapes import Circle, Drawing, Line, Polygon, Rect, String, Wedge
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

from theme import (
    BORDER, CONTENT_WIDTH, GOLD, GOLD_LIGHT, GOLD_SOFT, GREEN, GREEN_BG,
    HALF_WIDTH, INK, KPI_CARD_HEIGHT, LIGHT, MUTED, ORANGE, ORANGE_BG, PAPER,
    RED, RED_BG, ROW_ALT, SOFT_INK, SURFACE, THIRD_WIDTH, TRACK, YELLOW,
    YELLOW_BG, hex_str, pillar_color, score_color, signal_palette,
)


# ─── Filet décoratif or ────────────────────────────────────────────────────
def gold_rule(width: float = CONTENT_WIDTH, height: float = 1.0) -> Drawing:
    drawing = Drawing(width, height + 2)
    drawing.add(Rect(0, 1, width, height, fillColor=GOLD, strokeColor=GOLD))
    return drawing


def dotted_leader(width: float, height: float = 8) -> Drawing:
    """Trait pointillé vectoriel sur une seule ligne — utilisé pour les
    leaders du sommaire (titre ........... 3). Empêche le retour à la ligne
    qu'on aurait avec un Paragraph contenant des "." répétés."""
    drawing = Drawing(width, height)
    line = Line(0, height / 2, width, height / 2)
    line.strokeColor = GOLD
    line.strokeWidth = 0.7
    line.strokeDashArray = [1, 3]
    drawing.add(line)
    return drawing


def gold_rule_short(width: float = 2.0 * cm, height: float = 1.0) -> Drawing:
    drawing = Drawing(width, height + 4)
    drawing.add(Rect(0, 2, width, height, fillColor=GOLD, strokeColor=GOLD))
    drawing.add(Circle(width + 4, 2 + height / 2, 2, fillColor=GOLD, strokeColor=GOLD))
    return drawing


def section_title(text: str, styles, top_spacer: float = 0) -> list:
    """Titre or + filet décoratif court avec point. Pour les titres internes
    de page (`SEUIL DE RENTABILITÉ`, `RÉSUMÉ EXÉCUTIF`, `CONSTATS`…)."""
    flow: list = []
    if top_spacer > 0:
        flow.append(Spacer(1, top_spacer))
    flow.append(Paragraph(text.upper(), styles["section_caps"]))
    flow.append(gold_rule_short())
    flow.append(Spacer(1, 4))
    return flow


def section_title_lg(text: str, styles, top_spacer: float = 0) -> list:
    """Titre grand or — utilisé pour les sections analyse (Création de valeur, etc.)."""
    flow: list = []
    if top_spacer > 0:
        flow.append(Spacer(1, top_spacer))
    flow.append(Paragraph(text, styles["section"]))
    flow.append(gold_rule())
    flow.append(Spacer(1, 6))
    return flow


# ─── KPI tile (carte avec accent or à gauche) ──────────────────────────────
def kpi_tile(label: str, value_label, description: str, styles,
             value_color=None, value_style: str = "kpi_value"):
    """Renvoie None si valueLabel est None — la carte est masquée."""
    if value_label is None:
        return None
    # Surcharge la couleur de la valeur si fournie (signal coloré).
    style = styles[value_style]
    if value_color is not None:
        # On crée une copie du style pour ne pas polluer le style partagé.
        from reportlab.lib.styles import ParagraphStyle
        style = ParagraphStyle(
            name=f"{style.name}Override", parent=style, textColor=value_color
        )
    inner = Table(
        [
            [Paragraph(label.upper(), styles["kpi_label"])],
            [Paragraph(value_label, style)],
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
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("LINEBEFORE", (0, 0), (0, -1), 3, GOLD),
    ]))
    return inner


def kpi_tile_compact(label: str, value_label, styles, value_color=None):
    """Tile compact sans description — utilisé pour la grille 3x3 de la page synthèse."""
    if value_label is None:
        return None
    style = styles["tile_value"]
    if value_color is not None:
        from reportlab.lib.styles import ParagraphStyle
        style = ParagraphStyle(
            name=f"{style.name}Override", parent=style, textColor=value_color
        )
    inner = Table(
        [
            [Paragraph(label.upper(), styles["tile_label"])],
            [Paragraph(value_label, style)],
        ],
        colWidths=[None],
    )
    inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (0, 0), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 2),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
    ]))
    return inner


def kpi_grid(cards: list, cols: int = 2):
    """Grille de tiles, cols=2 ou 3, ignore les None."""
    visible = [c for c in cards if c is not None]
    if not visible:
        return None
    rows: list = []
    row: list = []
    for c in visible:
        row.append(c)
        if len(row) == cols:
            rows.append(row)
            row = []
    if row:
        while len(row) < cols:
            row.append("")
        rows.append(row)
    if cols == 2:
        col_widths = [HALF_WIDTH, HALF_WIDTH]
    elif cols == 3:
        col_widths = [THIRD_WIDTH] * 3
    else:
        col_widths = [CONTENT_WIDTH / cols] * cols
    table = Table(rows, colWidths=col_widths, rowHeights=[KPI_CARD_HEIGHT] * len(rows))
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


# ─── Score gauge (anneau radial) ───────────────────────────────────────────
def _annular_arc_polygon(cx, cy, r_outer, r_inner, start_deg, sweep_deg,
                          n=80, fill=None, stroke=None) -> Polygon:
    """Construit un secteur annulaire (anneau partiel) en polygone fermé.
    Démarre à `start_deg`, tourne SENS HORAIRE sur `sweep_deg` degrés.
    Plus fiable que reportlab.graphics.shapes.Wedge pour les sweeps > 180°."""
    pts = []
    # Arc extérieur : sens horaire de start vers (start - sweep).
    for i in range(n + 1):
        t = i / n
        a = math.radians(start_deg - sweep_deg * t)
        pts.append(cx + r_outer * math.cos(a))
        pts.append(cy + r_outer * math.sin(a))
    # Arc intérieur : sens inverse pour fermer le polygone.
    for i in range(n + 1):
        t = i / n
        a = math.radians(start_deg - sweep_deg * (1 - t))
        pts.append(cx + r_inner * math.cos(a))
        pts.append(cy + r_inner * math.sin(a))
    poly = Polygon(pts)
    if fill is not None:
        poly.fillColor = fill
    if stroke is not None:
        poly.strokeColor = stroke
        poly.strokeWidth = 0
    else:
        poly.strokeColor = fill
        poly.strokeWidth = 0
    return poly


def score_gauge(score, label: str, size: float = 4.5 * cm) -> Drawing:
    """Gauge radiale : track gris pleine + arc coloré au prorata du score
    (sens horaire à partir du sommet), label central et badge dessous.
    Si score est None → "N/D" en gris."""
    pad = 4
    side = size + pad * 2
    drawing = Drawing(side, side)
    cx, cy = side / 2, side / 2
    outer_r = size / 2
    track_thickness = 7
    inner_r = outer_r - track_thickness

    # Track gris : anneau plein 360°.
    drawing.add(_annular_arc_polygon(cx, cy, outer_r, inner_r, 90, 360, fill=TRACK))

    # Arc coloré selon score.
    color, _ = score_color(score)
    if score is not None:
        sweep = max(0, min(100, float(score))) / 100.0 * 360.0
        if sweep > 0:
            drawing.add(_annular_arc_polygon(cx, cy, outer_r, inner_r, 90, sweep, fill=color))

    # Filet extérieur or fin (double anneau décoratif).
    drawing.add(Circle(cx, cy, outer_r + 1, fillColor=None,
                        strokeColor=GOLD_SOFT, strokeWidth=0.4))

    # Texte central.
    if score is not None:
        score_text = str(int(round(float(score))))
        drawing.add(String(cx, cy + 2, score_text,
                            fontName="Helvetica-Bold", fontSize=28,
                            fillColor=INK, textAnchor="middle"))
        drawing.add(String(cx, cy - 14, "/ 100",
                            fontName="Helvetica", fontSize=8,
                            fillColor=MUTED, textAnchor="middle"))
    else:
        drawing.add(String(cx, cy - 4, "N/D",
                            fontName="Helvetica-Bold", fontSize=22,
                            fillColor=LIGHT, textAnchor="middle"))

    # Badge label (Excellent / Bon / Fragile / Critique) sous le score.
    if label and score is not None:
        badge_y = cy - 28
        text_w = max(len(label) * 4.5, 30)
        drawing.add(Rect(cx - text_w / 2, badge_y - 2, text_w, 12,
                          fillColor=color, strokeColor=color, rx=4, ry=4))
        drawing.add(String(cx, badge_y + 2, label,
                            fontName="Helvetica-Bold", fontSize=7,
                            fillColor=PAPER, textAnchor="middle"))
    return drawing


# ─── Barre horizontale (sub-scores piliers) ────────────────────────────────
def horizontal_score_bar(label: str, value, value_label: str,
                         width: float = CONTENT_WIDTH * 0.55) -> Drawing:
    """Une ligne : label à gauche, valeur à droite, barre colorée pleine largeur en dessous."""
    height = 24
    drawing = Drawing(width, height)
    color = pillar_color(value)
    fill_ratio = (value or 0) / 100.0

    # Label haut gauche, valeur haut droite.
    drawing.add(String(0, height - 8, label, fontName="Helvetica", fontSize=9, fillColor=INK))
    drawing.add(String(width, height - 8, value_label,
                        fontName="Helvetica-Bold", fontSize=9, fillColor=INK, textAnchor="end"))

    # Barre track + fill.
    bar_y = 2
    bar_h = 5
    drawing.add(Rect(0, bar_y, width, bar_h, fillColor=TRACK, strokeColor=TRACK, rx=2, ry=2))
    if fill_ratio > 0:
        drawing.add(Rect(0, bar_y, width * fill_ratio, bar_h,
                          fillColor=color, strokeColor=color, rx=2, ry=2))
    return drawing


# ─── Barre de progression (CA vs point mort) ───────────────────────────────
def progress_bar(ratio: float, color, width: float = CONTENT_WIDTH,
                 height: float = 14) -> Drawing:
    """Barre CA vs point mort, segments colorés selon profitabilité.

    Visuel : track gris en fond, échelle horizontale dynamique calée sur
    le seuil 100 % au milieu (ou au 2/3 si ratio > 1.5). Les segments sont
    peints :
      - 0 → min(ratio, 1.0)  : ROUGE/ORANGE = chemin vers la rentabilité
      - 1.0 → ratio (si > 1) : VERT = au-delà du seuil, marge dégagée
    Repère noir au seuil 100 % avec étiquette "point mort".
    Le paramètre `color` est ignoré — les couleurs sont implicites."""
    drawing = Drawing(width, height + 18)
    bar_y = 10

    # Échelle : on assure que le point mort soit toujours visible et bien
    # placé. Pour ratio <= 1, échelle = 1.0 (point mort à droite). Pour
    # ratio > 1, on étend jusqu'à ratio (cap 2.0 pour rester lisible).
    scale_max = max(1.0, min(float(ratio), 2.0))
    pm_x = (1.0 / scale_max) * width

    # Track gris pleine largeur.
    drawing.add(Rect(0, bar_y, width, height, fillColor=TRACK, strokeColor=TRACK, rx=3, ry=3))

    # Segment 1 : 0 → min(ratio, 1.0) en rouge/orange (zone "à couvrir").
    seg1_end_ratio = min(max(0.0, float(ratio)), 1.0)
    seg1_w = (seg1_end_ratio / scale_max) * width
    if seg1_w > 0:
        # Couleur : rouge si très loin du seuil, orange si proche.
        seg_color = ORANGE if seg1_end_ratio >= 0.7 else RED
        drawing.add(Rect(0, bar_y, seg1_w, height,
                          fillColor=seg_color, strokeColor=seg_color, rx=3, ry=3))

    # Segment 2 : 1.0 → ratio en vert (zone "marge dégagée") si applicable.
    if ratio > 1.0:
        seg2_start_x = pm_x
        seg2_end_x = (min(float(ratio), scale_max) / scale_max) * width
        seg2_w = max(0, seg2_end_x - seg2_start_x)
        if seg2_w > 0:
            drawing.add(Rect(seg2_start_x, bar_y, seg2_w, height,
                              fillColor=GREEN, strokeColor=GREEN, rx=3, ry=3))

    # Marker du point mort — barre verticale noire fine.
    drawing.add(Rect(pm_x - 1, bar_y - 4, 2, height + 8,
                      fillColor=INK, strokeColor=INK))
    drawing.add(String(pm_x, bar_y + height + 6, "point mort",
                        fontName="Helvetica", fontSize=7,
                        fillColor=MUTED, textAnchor="middle"))
    return drawing


# ─── Bloc constat (fond teinté + barre latérale) ───────────────────────────
def constat_block(message: str, severity: str, styles) -> Table:
    stripe, bg = signal_palette(severity)
    para = Paragraph(message, styles["list"])
    cell = Table([[para]], colWidths=[CONTENT_WIDTH])
    cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 3, stripe),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return cell


def constats_list(items: list, styles) -> list:
    """items : [{message, severity}]. Renvoie une liste de flowables (un bloc + spacer par item)."""
    flow = []
    for it in items:
        flow.append(constat_block(it.get("message", ""), it.get("severity", "info"), styles))
        flow.append(Spacer(1, 4))
    return flow


# ─── Tableau comptable (bilan / CdR) ───────────────────────────────────────
def financial_table(rows: list, col_widths: list, styles,
                     header_labels: list, totals_indices: set = None,
                     emphasis_indices: set = None) -> Table:
    """Construit un tableau comptable :
       - rows : list de dict { label, values: [str], is_section, indent }
       - col_widths : largeurs des colonnes (label + colonnes valeurs)
       - header_labels : labels du header (ACTIF | Brut | Amort. & Dép. | Net | Net N-1)
       - totals_indices : indices de ligne à mettre en évidence (fond doré léger)
       - emphasis_indices : indices de ligne avec fond accentué (TOTAL ACTIF par ex.)
    """
    totals_indices = totals_indices or set()
    emphasis_indices = emphasis_indices or set()

    # Header
    table_rows = [[Paragraph(f"<font color='white'><b>{h}</b></font>", styles["body"])
                   for h in header_labels]]
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), GOLD),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ALIGN", (1, 0), (-1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ]

    for i, row in enumerate(rows, start=1):
        indent = "&nbsp;" * (row.get("indent", 0) * 4)
        is_section = row.get("is_section", False)
        is_total = (i - 1) in totals_indices
        is_emphasis = (i - 1) in emphasis_indices

        if is_section or is_total or is_emphasis:
            label_html = f"<b>{indent}{row.get('label','')}</b>"
        else:
            label_html = f"{indent}{row.get('label','')}"

        cells = [Paragraph(label_html, styles["body"])]
        for v in row.get("values", []):
            v_html = f"<b>{v}</b>" if (is_total or is_emphasis) else v
            cells.append(Paragraph(v_html or "", styles["body"]))
        table_rows.append(cells)

        if is_section:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), SURFACE))
        elif is_total:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), GOLD_LIGHT))
            style_cmds.append(("LINEABOVE", (0, i), (-1, i), 0.6, GOLD))
        elif is_emphasis:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), GOLD_LIGHT))
            style_cmds.append(("LINEABOVE", (0, i), (-1, i), 1.2, GOLD))
            style_cmds.append(("LINEBELOW", (0, i), (-1, i), 0.4, GOLD))
        else:
            # Alternance ligne paire/impaire pour les lignes courantes.
            if (i % 2) == 0:
                style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))

    # Toutes valeurs alignées à droite, label à gauche.
    style_cmds.append(("ALIGN", (1, 1), (-1, -1), "RIGHT"))
    style_cmds.append(("ALIGN", (0, 1), (0, -1), "LEFT"))

    table = Table(table_rows, colWidths=col_widths)
    table.setStyle(TableStyle(style_cmds))
    return table


# ─── Pastille numérotée (sommaire) ─────────────────────────────────────────
def numbered_pastille(num: int, size: float = 22) -> Drawing:
    drawing = Drawing(size, size)
    drawing.add(Circle(size / 2, size / 2, size / 2 - 1, fillColor=GOLD, strokeColor=GOLD))
    drawing.add(String(size / 2, size / 2 - 3, f"{num:02d}",
                        fontName="Helvetica-Bold", fontSize=8,
                        fillColor=PAPER, textAnchor="middle"))
    return drawing


# ─── Bandeau contextuel (NAF, effectif, exercice) ──────────────────────────
def context_band(items: list, styles) -> Table:
    """items: list de "label : valeur" ou Paragraph. Renvoie une bande crème."""
    cells = []
    for it in items:
        if isinstance(it, str):
            cells.append(Paragraph(it, styles["body"]))
        else:
            cells.append(it)
    # On répartit en colonnes égales.
    n = len(cells)
    col_w = CONTENT_WIDTH / n if n else CONTENT_WIDTH
    table = Table([cells], colWidths=[col_w] * n)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GOLD_LIGHT),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return table
