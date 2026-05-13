# File: services/reports/python/pages/synthese/compte_resultat.py
# Role: Page 6 — Compte de résultat. Colonnes Poste | Montant | % CA.

from reportlab.platypus import Paragraph, Spacer

from theme import CONTENT_WIDTH
from components import financial_table


def build_compte_resultat(payload: dict, styles) -> list:
    flow: list = []

    flow.append(Paragraph("Compte de résultat", styles["h2"]))
    sub_parts = []
    period = payload.get("periodLabel")
    if period:
        sub_parts.append(f"Période : {period}")
    sub_parts.append("Présenté en euros")
    flow.append(Paragraph(" · ".join(sub_parts), styles["muted"]))
    flow.append(Spacer(1, 10))

    cdr = payload.get("compteResultat") or []
    rows = []
    totals = set()
    emphasis = set()
    for i, r in enumerate(cdr):
        rows.append({
            "label": r.get("label", ""),
            "values": [
                r.get("montant") or "",
                r.get("pctCa") or "",
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
        CONTENT_WIDTH * 0.20,
        CONTENT_WIDTH * 0.14,
    ]
    header = ["", "Montant", "% CA"]
    flow.append(financial_table(rows, col_widths, styles, header,
                                 totals_indices=totals, emphasis_indices=emphasis))
    flow.append(Spacer(1, 10))
    flow.append(Paragraph(
        "Les pourcentages sont exprimés par rapport au chiffre d'affaires net.",
        styles["muted_sm"],
    ))
    return flow
