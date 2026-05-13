# File: services/reports/python/pages/synthese/bilan_actif.py
# Role: Page 4 — Bilan Actif. Tableau comptable colonnes ACTIF | Brut |
# Amort. & Dép. | Net | Net N-1. Header doré, alternance lignes, totals
# avec fond or léger.

from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer

from theme import CONTENT_WIDTH, MUTED
from components import financial_table


def build_bilan_actif(payload: dict, styles) -> list:
    flow: list = []

    flow.append(Paragraph("Bilan — Actif", styles["h2"]))
    sub = "Présenté en euros"
    period_end = payload.get("periodEndLabel")
    if period_end:
        sub += f" · Exercice clos le {period_end}"
    flow.append(Paragraph(sub, styles["muted"]))
    flow.append(Spacer(1, 10))

    # Lignes attendues côté payload :
    # rows = [{ label, brut, amort, net, netN1, indent, is_section, is_total, is_emphasis }]
    bilan = payload.get("bilanActif") or []

    rows = []
    totals = set()
    emphasis = set()
    for i, r in enumerate(bilan):
        # Doctrine "zéro N/D" : on n'écrit rien pour les cellules manquantes.
        # L'œil du lecteur comprend l'absence sans qu'on l'explicite.
        rows.append({
            "label": r.get("label", ""),
            "values": [
                r.get("brut") or "",
                r.get("amort") or "",
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
        # Doctrine "zéro N/D" : si le bilan n'a aucune ligne exploitable, on
        # ne dit rien — pas de phrase de fallback. La page reste avec son
        # titre + chrome ; l'utilisateur comprend par l'absence.
        return flow

    col_widths = [
        CONTENT_WIDTH * 0.46,
        CONTENT_WIDTH * 0.135,
        CONTENT_WIDTH * 0.135,
        CONTENT_WIDTH * 0.135,
        CONTENT_WIDTH * 0.135,
    ]
    header = ["ACTIF", "Brut", "Amort. & Dép.", "Net", "Net N-1"]
    flow.append(financial_table(rows, col_widths, styles, header,
                                 totals_indices=totals, emphasis_indices=emphasis))
    return flow
