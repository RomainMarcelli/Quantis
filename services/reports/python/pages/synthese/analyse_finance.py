# File: services/reports/python/pages/synthese/analyse_finance.py
# Role: Page 8 — Analyse : Financement & Rentabilité. Deux sections, +
# constats, + note de fin sur la légende N/C.

from reportlab.platypus import Paragraph, Spacer

from components import constats_list, kpi_grid, kpi_tile, section_title_lg
from theme import GREEN, RED


def _signal_color(signal: str):
    if signal == "positive":
        return GREEN
    if signal == "risk":
        return RED
    return None


def _build_tiles(items: list, styles) -> list:
    cards = []
    for it in items:
        cards.append(kpi_tile(
            it.get("label", ""),
            it.get("valueLabel"),
            it.get("description", ""),
            styles,
            value_color=_signal_color(it.get("signal")),
        ))
    return cards


def build_analyse_finance(payload: dict, styles) -> list:
    flow: list = []

    cards = [c for c in _build_tiles(payload.get("financingItems") or [], styles) if c is not None]
    if cards:
        flow += section_title_lg("Financement", styles)
        grid = kpi_grid(cards, cols=2)
        if grid is not None:
            flow.append(grid)

    cards2 = [c for c in _build_tiles(payload.get("profitabilityItems") or [], styles) if c is not None]
    if cards2:
        if flow:
            flow.append(Spacer(1, 12))
        flow += section_title_lg("Rentabilité", styles)
        grid2 = kpi_grid(cards2, cols=2)
        if grid2 is not None:
            flow.append(grid2)

    constats = payload.get("constatsFinancing") or []
    if constats:
        if flow:
            flow.append(Spacer(1, 12))
        flow += section_title_lg("Constats", styles)
        flow += constats_list(constats, styles)

    if flow:
        flow.append(Spacer(1, 8))
        flow.append(Paragraph(
            "Les seuils sont des repères standards PME françaises. "
            "Constats produits par templates factuels.",
            styles["muted_sm"],
        ))
    return flow
