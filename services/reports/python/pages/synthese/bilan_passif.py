# File: services/reports/python/pages/synthese/bilan_passif.py
# Role: Page 5 — Bilan Passif. Colonnes PASSIF | Net | Net N-1.

from reportlab.platypus import Paragraph, Spacer

from theme import CONTENT_WIDTH
from components import financial_table


def build_bilan_passif(payload: dict, styles) -> list:
    flow: list = []

    flow.append(Paragraph("Bilan — Passif", styles["h2"]))
    sub = "Présenté en euros"
    period_end = payload.get("periodEndLabel")
    if period_end:
        sub += f" · Exercice clos le {period_end}"
    flow.append(Paragraph(sub, styles["muted"]))
    flow.append(Spacer(1, 10))

    bilan = payload.get("bilanPassif") or []
    rows = []
    totals = set()
    emphasis = set()
    for i, r in enumerate(bilan):
        rows.append({
            "label": r.get("label", ""),
            "values": [
                r.get("net") or "",
                r.get("netN1") or "",
            ],
            "indent": r.get("indent", 0),
            "is_section": r.get("kind") == "section",
        })
        if r.get("kind") == "total":
            totals.add(i)
        elif r.get("kind") == "grand_total":
            emphasis.add(i)

    if not rows:
        # Doctrine "zéro N/D" : page laissée vide (titre + chrome uniquement).
        return flow

    col_widths = [
        CONTENT_WIDTH * 0.66,
        CONTENT_WIDTH * 0.17,
        CONTENT_WIDTH * 0.17,
    ]
    header = ["PASSIF", "Net", "Net N-1"]
    flow.append(financial_table(rows, col_widths, styles, header,
                                 totals_indices=totals, emphasis_indices=emphasis))
    return flow
