# File: services/reports/python/pages/cover.py
# Role: Page 1 — Couverture. Bandes or top + bottom (chrome dédié), fond
# crème, brand VYZOR + tagline, filet décoratif, bloc société, bloc titre
# rapport en encadré doré, mention confidentielle.

from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

from theme import (
    BORDER, CONTENT_WIDTH, CREAM, GOLD, GOLD_LIGHT, INK, MARGIN, PAPER, SOFT_INK,
)
from components import gold_rule


def build_cover(payload: dict, styles) -> list:
    flow: list = []
    company = payload.get("companyName") or "Vyzor"
    company_info = payload.get("companyInfo") or {}
    period_label = payload.get("periodLabel") or ""
    report_date = payload.get("reportDate") or ""

    # Brand bloc.
    flow.append(Paragraph("VYZOR", styles["cover_brand"]))
    flow.append(Paragraph("INTELLIGENCE FINANCIÈRE POUR PME", styles["cover_tagline"]))
    flow.append(Spacer(1, 18))
    flow.append(gold_rule(width=CONTENT_WIDTH * 0.35, height=2))
    flow.append(Spacer(1, 28))

    # Société.
    flow.append(Paragraph(company, styles["cover_company"]))

    legal_lines = []
    if company_info.get("legalForm") and company_info.get("capital"):
        legal_lines.append(f"{company_info['legalForm']} au capital de {company_info['capital']}")
    elif company_info.get("legalForm"):
        legal_lines.append(company_info["legalForm"])

    address = company_info.get("address")
    postal = company_info.get("postalCode")
    city = company_info.get("city")
    if address:
        legal_lines.append(f"Siège social : {address}")
    if postal or city:
        legal_lines.append(" ".join(filter(None, [postal, city])))
    if company_info.get("rcs"):
        legal_lines.append(company_info["rcs"])

    for line in legal_lines:
        flow.append(Paragraph(line, styles["cover_meta"]))

    flow.append(Spacer(1, 36))

    # Bloc titre rapport — encadré doré léger avec accent bar or à gauche.
    title = payload.get("reportTitle") or "Rapport d'analyse financière"
    period_meta = []
    if period_label:
        period_meta.append(f"Période : {period_label}")
    if report_date:
        period_meta.append(f"Généré le {report_date}")

    title_inner = [[Paragraph(f"<b>{title}</b>", styles["report_title"])]]
    for p in period_meta:
        title_inner.append([Paragraph(p, styles["report_meta"])])

    title_block = Table(title_inner, colWidths=[CONTENT_WIDTH - 1.4 * cm])
    title_block.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GOLD_LIGHT),
        ("LINEBEFORE", (0, 0), (0, -1), 4, GOLD),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING", (0, 0), (0, 0), 14),
        ("TOPPADDING", (0, 1), (-1, -1), 0),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -2), 4),
    ]))
    flow.append(title_block)

    flow.append(Spacer(1, 36))

    # Spacer flexible pour pousser la mention confidentielle vers le bas.
    flow.append(Spacer(1, 12 * cm))

    # Mention confidentielle bas de page.
    flow.append(gold_rule(width=CONTENT_WIDTH, height=0.4))
    flow.append(Spacer(1, 6))
    flow.append(Paragraph(
        "Document confidentiel — Usage réservé au dirigeant et à son expert-comptable.",
        styles["report_meta"],
    ))
    source_label = (payload.get("source") or {}).get("providerLabel")
    if source_label:
        flow.append(Paragraph(
            f"Source : {source_label} · Moteur Vyzor (audit-grade, déterministe)",
            styles["muted_sm"],
        ))
    return flow
