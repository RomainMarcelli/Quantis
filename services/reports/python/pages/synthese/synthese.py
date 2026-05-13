# File: services/reports/python/pages/synthese/synthese.py
# Role: Page 3 — Synthèse Vyzor. Bandeau contextuel, verdict + variation N-1,
# gauge circulaire à gauche + 4 sub-scores en barres à droite, seuil de
# rentabilité, résumé exécutif templaté, grille 3x3 KPI compactes, constats.

from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

from theme import (
    CONTENT_WIDTH, GOLD_LIGHT, GREEN, INK, LIGHT, MUTED, RED, hex_str, score_color,
)
from components import (
    constats_list, context_band, horizontal_score_bar, kpi_grid,
    kpi_tile_compact, progress_bar, score_gauge, section_title,
)


def build_synthese(payload: dict, styles) -> list:
    flow: list = []
    company = payload.get("companyName") or "Vyzor"

    # ── Titre + bandeau contextuel ──
    flow.append(Paragraph("Synthèse Vyzor", styles["h2"]))
    flow.append(Spacer(1, 6))

    company_info = payload.get("companyInfo") or {}
    naf = []
    if company_info.get("nafCode") and company_info.get("nafLabel"):
        naf.append(f"NAF : {company_info['nafCode']} — {company_info['nafLabel']}")
    elif company_info.get("nafCode"):
        naf.append(f"NAF : {company_info['nafCode']}")

    effectif_parts = []
    if company_info.get("effectif") is not None:
        effectif_parts.append(f"Effectif : {company_info['effectif']}")
        if company_info.get("effectifBracket"):
            effectif_parts[-1] += f" ({company_info['effectifBracket']})"

    period = payload.get("periodLabel") or ""
    band_items = []
    if naf:
        band_items.append(naf[0])
    if effectif_parts:
        band_items.append(effectif_parts[0])
    if period:
        band_items.append(f"Exercice : {period}")
    if band_items:
        flow.append(context_band(
            [Paragraph(it, styles["muted"]) for it in band_items], styles
        ))
        flow.append(Spacer(1, 14))

    # ── Verdict + variation N-1 ──
    score_data = payload.get("score") or {}
    score = score_data.get("value")
    score_label = score_data.get("label") or ""
    color, _ = score_color(score)
    verdict = score_data.get("verdict") or ""
    if verdict:
        # Verdict avec label coloré inline.
        if score_label and score_label in verdict:
            verdict_html = verdict.replace(
                score_label,
                f"<font color='{hex_str(color)}'><b>{score_label}</b></font>",
            )
        else:
            verdict_html = verdict
        flow.append(Paragraph(verdict_html, styles["body_lg"]))
        flow.append(Spacer(1, 4))

    variation = score_data.get("variation") or {}
    var_text = variation.get("text") or ""
    var_severity = variation.get("severity") or "neutral"
    if var_text:
        var_color = MUTED
        if var_severity == "positive":
            var_color = GREEN
        elif var_severity == "risk":
            var_color = RED
        flow.append(Paragraph(
            f"<font color='{hex_str(var_color)}'>{var_text}</font>", styles["muted"]
        ))
    flow.append(Spacer(1, 14))

    # ── Gauge à gauche + sub-scores à droite ──
    gauge = score_gauge(score, score_label, size=4.2 * cm)

    pillars = score_data.get("piliers") or []
    bars = []
    for p in pillars[:4]:
        bars.append(horizontal_score_bar(
            p.get("label", ""),
            p.get("value"),
            p.get("valueLabel") or "N/D",
            width=CONTENT_WIDTH * 0.55,
        ))
        bars.append(Spacer(1, 6))

    bars_inner = Table([[b] for b in bars], colWidths=[CONTENT_WIDTH * 0.55])
    bars_inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    grid = Table(
        [[gauge, bars_inner]],
        colWidths=[CONTENT_WIDTH * 0.4, CONTENT_WIDTH * 0.6],
    )
    grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow.append(grid)
    flow.append(Spacer(1, 16))

    # ── Seuil de rentabilité ──
    breakeven = payload.get("breakeven") or {}
    ca = breakeven.get("ca")
    point_mort = breakeven.get("pointMort")
    ratio = breakeven.get("ratio")  # 0-1
    ecart = breakeven.get("ecart")  # peut être négatif (atteint) ou positif (à combler)
    if ca is not None and point_mort is not None and ratio is not None:
        flow += section_title("Seuil de rentabilité", styles)
        bar_color = GREEN if ratio >= 1 else RED
        flow.append(progress_bar(ratio, bar_color, width=CONTENT_WIDTH))
        flow.append(Spacer(1, 4))
        # Ligne info CA + Point mort.
        ca_label = breakeven.get("caLabel") or ""
        pm_label = breakeven.get("pointMortLabel") or ""
        info_left = Paragraph(f"CA : <b>{ca_label}</b>", styles["muted"])
        info_right = Paragraph(
            f"<para align='right'>Point mort : <b>{pm_label}</b></para>",
            styles["muted"],
        )
        info_table = Table([[info_left, info_right]], colWidths=[HALF := CONTENT_WIDTH / 2, CONTENT_WIDTH / 2])
        info_table.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        flow.append(info_table)

        # Ligne "X % du point mort atteint — écart de Y € à combler".
        ratio_pct = int(round(ratio * 100))
        ecart_label = breakeven.get("ecartLabel") or ""
        if ratio < 1:
            txt = f"<b>{ratio_pct} % du point mort atteint</b> — écart de {ecart_label} à combler"
        else:
            txt = f"<b>{ratio_pct} % du point mort</b> — point mort dépassé de {ecart_label}"
        flow.append(Paragraph(txt, styles["body"]))
        flow.append(Spacer(1, 14))

    # ── Résumé exécutif ──
    summary = payload.get("executiveSummary") or ""
    if summary:
        flow += section_title("Résumé exécutif", styles)
        flow.append(Paragraph(summary, styles["body"]))
        flow.append(Spacer(1, 14))

    # ── Indicateurs clés (grille 3x3) ──
    # On évite d'imprimer le titre si AUCUN tile n'est rendu (donnée non
    # disponible) — sinon on aurait un titre orphelin sans contenu.
    key_kpis = payload.get("keyKpis") or []
    cards = []
    for k in key_kpis:
        color_value = None
        sig = k.get("signal")
        if sig == "positive":
            color_value = GREEN
        elif sig == "risk":
            color_value = RED
        tile = kpi_tile_compact(
            k.get("label", ""),
            k.get("valueLabel"),
            styles,
            value_color=color_value,
        )
        if tile is not None:
            cards.append(tile)
    if cards:
        flow += section_title("Indicateurs clés", styles)
        grid_widget = kpi_grid(cards, cols=3)
        if grid_widget is not None:
            flow.append(grid_widget)
        flow.append(Spacer(1, 14))

    # ── Constats ──
    constats = payload.get("constats") or []
    if constats:
        flow += section_title("Constats", styles)
        flow += constats_list(constats, styles)

    return flow
