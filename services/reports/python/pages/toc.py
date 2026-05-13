# File: services/reports/python/pages/toc.py
# Role: Page 2 — Sommaire. Liste les entrées avec pastille numérotée or,
# titre, description, points pointillés, numéro de page. Trois encadrés
# de groupement en bas (Synthèse Vyzor, États financiers, Analyse).

from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

from theme import (
    BORDER, CONTENT_WIDTH, GOLD, GOLD_LIGHT, INK, MUTED, PAPER, SURFACE, hex_str,
)
from components import dotted_leader, gold_rule, numbered_pastille


def build_toc(payload: dict, styles) -> list:
    """payload['toc'] = liste d'items { num, title, description, page, group }
       payload['tocGroups'] = liste optionnelle de boîtes groupement
                              [{ title, description }]"""
    flow: list = []

    flow.append(Paragraph("Sommaire", styles["h2"]))
    flow.append(Spacer(1, 12))

    items = payload.get("toc") or []
    rows = []
    leader_width = CONTENT_WIDTH * 0.30
    for item in items:
        num = numbered_pastille(int(item.get("num", 0)), size=20)
        title = Paragraph(f"<b>{item.get('title','')}</b>", styles["body"])
        # Description en sous-ligne grise.
        description = Paragraph(item.get("description", "") or "", styles["muted"])
        # Trait pointillé vectoriel — single-line, ne wrap jamais.
        leader = dotted_leader(leader_width, height=10)
        page_num = Paragraph(
            f"<para align='right'><b>{item.get('page','')}</b></para>",
            styles["body"],
        )

        # Ligne 1 : num | titre | leader | page
        rows.append([num, title, leader, page_num])
        # Ligne 2 : (vide) | description | (vide) | (vide)
        rows.append(["", description, "", ""])
        # Ligne séparatrice fine.
        rows.append(["", "", "", ""])

    if rows:
        col_widths = [0.9 * cm, CONTENT_WIDTH * 0.55, leader_width, 1.5 * cm]
        table = Table(rows, colWidths=col_widths)
        # On stylise les groupes de 3 lignes par item.
        style_cmds = [
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]
        for i in range(0, len(rows), 3):
            # Ligne 1 (titre) : haut padding plus grand.
            style_cmds.append(("TOPPADDING", (0, i), (-1, i), 8))
            # Ligne 2 (description) : décalée sous le titre, plus petit padding.
            style_cmds.append(("TOPPADDING", (0, i + 1), (-1, i + 1), 0))
            style_cmds.append(("BOTTOMPADDING", (0, i + 1), (-1, i + 1), 6))
            # Ligne séparatrice : fin de l'entrée.
            style_cmds.append(("LINEBELOW", (0, i + 2), (-1, i + 2), 0.3, BORDER))
        table.setStyle(TableStyle(style_cmds))
        flow.append(table)

    # Les encadrés de groupement (Synthèse Vyzor / États financiers / Analyse
    # financière) ont été supprimés — redondants avec le TOC ci-dessus.
    return flow
