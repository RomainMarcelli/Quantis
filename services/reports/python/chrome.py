# File: services/reports/python/chrome.py
# Role: chrome de page (header + footer) commun à toutes les pages SAUF la
# cover qui a son propre traitement (bandes or top + bottom). Les pages
# courantes ont une bande or fine en haut, le brand "VYZOR" en or à gauche,
# "Société · Page X / N" à droite, un filet sépa, et un footer source en bas.

from reportlab.lib.units import cm

from theme import (
    PAGE_W, PAGE_H, MARGIN, BORDER, GOLD, GOLD_SOFT, INK, MUTED,
)


def draw_cover_chrome(canvas, payload: dict) -> None:
    """Cover : bandes or pleine largeur en haut et en bas, fond crème déjà
    couvert via la PageTemplate. Pas de pagination ni de header."""
    canvas.saveState()
    # Bande or top.
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_H - 0.45 * cm, PAGE_W, 0.45 * cm, fill=1, stroke=0)
    # Bande or bottom (plus fine).
    canvas.rect(0, 0, PAGE_W, 0.25 * cm, fill=1, stroke=0)
    canvas.restoreState()


def draw_page_chrome(canvas, payload: dict) -> None:
    """Pages courantes : header VYZOR + Société Page X/N, filet, footer."""
    canvas.saveState()
    page_num = canvas.getPageNumber()
    company = payload.get("companyName") or "Vyzor"

    # Bande or top fine.
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_H - 0.18 * cm, PAGE_W, 0.18 * cm, fill=1, stroke=0)

    # Header brand (gauche) — "VYZOR" en or, condensé.
    canvas.setFillColor(GOLD)
    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawString(MARGIN, PAGE_H - 1.0 * cm, "VYZOR")

    # Header pagination (droite) — "Société · Page X / N".
    total = payload.get("_pageTotal") or 0
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 9)
    label = f"{company} · Page {page_num} / {total}" if total else f"{company}"
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 1.0 * cm, label)

    # Filet séparateur sous le header.
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN, PAGE_H - 1.35 * cm, PAGE_W - MARGIN, PAGE_H - 1.35 * cm)

    # Footer — source + date + mention déterministe.
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7)
    source_label = (payload.get("source") or {}).get("providerLabel")
    report_date = payload.get("reportDate")
    parts = ["Rapport généré par Vyzor"]
    if report_date:
        parts.append(f"le {report_date}")
    if source_label:
        parts.append(f"Source : {source_label}")
    parts.append("Moteur de calcul audit-grade, déterministe. Templates factuels.")
    footer = ". ".join(parts) + "."
    canvas.drawString(MARGIN, 1.0 * cm, footer)

    canvas.restoreState()


def chrome_for(page_kind: str):
    """Retourne la bonne fonction de chrome selon le type de page."""
    if page_kind == "cover":
        return draw_cover_chrome
    return draw_page_chrome
