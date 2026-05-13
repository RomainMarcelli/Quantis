# File: services/reports/python/widgets/registry.py
# Role: dispatcher vizType → fonction de rendu. Le payload côté TS sérialise
# chaque widget avec ses données spécifiques (value pour kpiCard, series
# pour line/bar, slices pour donut, etc.). Ce module route vers le bon
# renderer, et fait fallback vers une carte "non supporté" si vizType inconnu.

from typing import Optional

from reportlab.platypus import Paragraph, Table, TableStyle

from theme import BORDER, MUTED, PAPER
from components import kpi_tile


def render_widget(widget: dict, styles) -> Optional[object]:
    """Renvoie un Flowable pour un widget donné. None si le widget est
    invalide / non supporté (le call-site peut décider de skip)."""
    viz_type = widget.get("vizType") or ""

    if viz_type == "kpiCard":
        return kpi_tile(
            widget.get("label", ""),
            widget.get("valueLabel"),
            widget.get("description", ""),
            styles,
        )

    if viz_type == "quantisScore":
        # Rendu compact pour le mode dashboard — la version complète vit page 3
        # de la synthèse. Ici on affiche juste score + label.
        return _quantis_score_compact(widget, styles)

    if viz_type in ("aiInsight", "alertList", "actionList"):
        # Rendu textuel : une boîte avec le texte injecté.
        return _text_widget(widget, styles)

    # Charts (line, bar, donut, comparison, waterfall, gauge) : rendu placeholder
    # pour V1 — la version finale rendra une mini-image générée via reportlab.graphics.
    if viz_type in ("evolutionChart", "lineChart", "barChart", "donut",
                     "comparison", "waterfall", "gauge"):
        return _chart_placeholder(widget, styles)

    # Fallback inconnu — on ne casse pas le rapport.
    return _unsupported_widget(viz_type, styles)


def _quantis_score_compact(widget: dict, styles):
    score = widget.get("score")
    label = widget.get("label") or "Vyzor Score"
    score_label = widget.get("scoreLabel") or ""
    value_text = f"{int(round(score))}/100" if score is not None else "N/D"
    return kpi_tile(label, value_text, score_label, styles)


def _text_widget(widget: dict, styles):
    label = widget.get("label") or ""
    items = widget.get("items") or []
    if not items and widget.get("text"):
        items = [widget.get("text")]
    inner = [[Paragraph(f"<b>{label}</b>", styles["body"])]]
    for it in items[:6]:
        inner.append([Paragraph(f"› {it}", styles["list"])])
    cell = Table(inner, colWidths=[None])
    cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (0, 0), 10),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
    ]))
    return cell


def _chart_placeholder(widget: dict, styles):
    label = widget.get("label") or widget.get("vizType")
    note = widget.get("placeholderNote") or "Représentation graphique disponible dans l'application."
    inner = [
        [Paragraph(f"<b>{label}</b>", styles["body"])],
        [Paragraph(note, styles["muted"])],
    ]
    cell = Table(inner, colWidths=[None])
    cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (0, 0), 12),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
    ]))
    return cell


def _unsupported_widget(viz_type: str, styles):
    return Paragraph(
        f"<i>Type de widget non supporté ({viz_type}). Sera disponible prochainement.</i>",
        styles["muted"],
    )
