# File: services/reports/python/pages/synthese/analyse_value.py
# Role: Page 7 — Analyse : Création de valeur & Investissement. Deux
# sections de KPI tiles en grille 2 colonnes, + bloc constats.

from reportlab.platypus import Spacer

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


def build_analyse_value(payload: dict, styles) -> list:
    """Doctrine : on n'imprime PAS le titre d'une section si elle ne contient
    aucun tile rendu — un titre orphelin transmettrait l'idée que la donnée
    existe mais qu'on n'a pas su la calculer."""
    flow: list = []

    cards = [c for c in _build_tiles(payload.get("valueCreationItems") or [], styles) if c is not None]
    if cards:
        flow += section_title_lg("Création de valeur & Rentabilité opérationnelle", styles)
        grid = kpi_grid(cards, cols=2)
        if grid is not None:
            flow.append(grid)

    cards2 = [c for c in _build_tiles(payload.get("investmentItems") or [], styles) if c is not None]
    if cards2:
        if flow:
            flow.append(Spacer(1, 12))
        flow += section_title_lg("Investissement & Gestion du Besoin en Fonds de Roulement", styles)
        grid2 = kpi_grid(cards2, cols=2)
        if grid2 is not None:
            flow.append(grid2)

    constats = payload.get("constatsValueCreation") or []
    if constats:
        if flow:
            flow.append(Spacer(1, 12))
        flow += section_title_lg("Constats", styles)
        flow += constats_list(constats, styles)

    return flow
