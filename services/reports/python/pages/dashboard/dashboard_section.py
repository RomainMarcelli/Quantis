# File: services/reports/python/pages/dashboard/dashboard_section.py
# Role: rend une section "tableau de bord" dans le rapport mode dashboard.
# Une section = titre + intro + N widgets disposés en grille 2-cols.

from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

from components import gold_rule, kpi_grid
from theme import HALF_WIDTH, KPI_CARD_HEIGHT
from widgets.registry import render_widget


def build_dashboard_section(section: dict, payload: dict, styles) -> list:
    flow: list = []
    title = section.get("title") or "Tableau de bord"
    description = section.get("description") or ""

    flow.append(Paragraph(title, styles["h2"]))
    if description:
        flow.append(Paragraph(description, styles["muted"]))
    flow.append(Spacer(1, 6))
    flow.append(gold_rule())
    flow.append(Spacer(1, 12))

    widgets = section.get("widgets") or []
    rendered = []
    for w in widgets:
        r = render_widget(w, styles)
        if r is not None:
            rendered.append(r)

    if not rendered:
        flow.append(Paragraph("Ce tableau de bord ne contient aucun widget exportable.", styles["muted"]))
        return flow

    # Grille 2 cols par défaut (les widgets full-width comme alerteList peuvent
    # être groupés sur leur ligne en passant span=2 — non implémenté V1).
    grid = kpi_grid(rendered, cols=2)
    if grid is not None:
        flow.append(grid)
    return flow
