#!/usr/bin/env python3
# coding: utf-8
"""
Vyzor — orchestrateur de génération de rapports PDF.

Lit un payload JSON sur stdin, écrit un PDF binaire sur stdout.
Modes supportés (champ `mode` du payload) :
  - "synthese" : 8 pages fixes (cover, sommaire, synthèse, bilan actif,
                  bilan passif, compte de résultat, analyse value/invest,
                  analyse financement/renta).
  - "dashboard" : cover + sommaire dynamique + 1 section par dashboard
                   sélectionné, chaque section listant ses widgets.

Architecture modulaire (cf. README à venir) :
  theme.py         — palette, styles, géométrie
  chrome.py        — header/footer (cover dédiée)
  components.py    — briques réutilisables (KPI tile, gauge, table, constat…)
  templates.py     — textes templatés (résumé exécutif, constats)
  pages/           — un fichier par page
"""
from __future__ import annotations

import io
import json
import os
import sys
from typing import Any

# Ajoute le dossier du script au PYTHONPATH pour permettre les imports relatifs
# sans paquet (le script est invoqué en standalone, pas via -m).
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, NextPageTemplate, PageBreak, PageTemplate,
)


# ─── PageMarker : enregistre le numéro de page d'une section ───────────────
class PageMarker(Flowable):
    """Flowable invisible qui pousse `canvas.getPageNumber()` dans un dict
    partagé. Utilisé en pass 1 pour recenser sur quelle page chaque section
    atterrit, puis en pass 2 pour fabriquer un sommaire avec les BONS
    numéros de page (au lieu d'un mapping figé 3-8)."""
    def __init__(self, key: str, registry: dict):
        Flowable.__init__(self)
        self.key = key
        self.registry = registry

    def draw(self):
        self.registry[self.key] = self.canv.getPageNumber()

    def wrap(self, *args):
        return (0, 0)

from theme import CREAM, MARGIN, PAGE_H, PAGE_W, build_styles
from chrome import draw_cover_chrome, draw_page_chrome
from pages.cover import build_cover
from pages.toc import build_toc
from pages.synthese.synthese import build_synthese
from pages.synthese.bilan_actif import build_bilan_actif
from pages.synthese.bilan_passif import build_bilan_passif
from pages.synthese.compte_resultat import build_compte_resultat
from pages.synthese.analyse_value import build_analyse_value
from pages.synthese.analyse_finance import build_analyse_finance


# ─── Page templates ────────────────────────────────────────────────────────
def _make_doc(buf: io.BytesIO, payload: dict[str, Any]) -> BaseDocTemplate:
    """Deux PageTemplates : `cover` (bandes or top/bottom) et `page` (chrome
    standard). Les pages basculent via NextPageTemplate dans le story."""

    doc = BaseDocTemplate(
        buf, pagesize=(PAGE_W, PAGE_H),
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=1.6 * cm,
        title="Rapport Vyzor",
        author="Vyzor",
    )

    # Cover : marges plus généreuses, fond crème.
    cover_frame = Frame(
        MARGIN, 1.0 * cm,
        PAGE_W - 2 * MARGIN, PAGE_H - MARGIN - 1.2 * cm,
        id="cover", showBoundary=0,
    )
    cover_template = PageTemplate(
        id="cover",
        frames=[cover_frame],
        onPage=lambda canvas, d: draw_cover_chrome(canvas, payload),
    )

    # Page courante : on laisse 2.5 cm en haut pour respirer entre le filet
    # doré du chrome (~1.35 cm depuis le haut) et le titre de page. Sans cette
    # marge, le titre venait coller le filet → impression de manque d'air.
    page_frame = Frame(
        MARGIN, 1.6 * cm,
        PAGE_W - 2 * MARGIN, PAGE_H - 4.1 * cm,
        id="content", showBoundary=0,
    )
    page_template = PageTemplate(
        id="page",
        frames=[page_frame],
        onPage=lambda canvas, d: draw_page_chrome(canvas, payload),
    )

    doc.addPageTemplates([cover_template, page_template])
    return doc


# ─── Story builders ────────────────────────────────────────────────────────
SYNTHESE_PAGE_KEYS = [
    ("synthese", "Synthèse Vyzor", "Score de santé financière et résumé exécutif", build_synthese),
    ("bilan_actif", "Bilan — Actif", "Détail des emplois de l'entreprise", build_bilan_actif),
    ("bilan_passif", "Bilan — Passif", "Détail des ressources de l'entreprise", build_bilan_passif),
    ("compte_resultat", "Compte de résultat", "Formation du résultat sur la période", build_compte_resultat),
    ("analyse_value", "Analyse — Création de valeur & Investissement", "Ratios opérationnels et gestion du BFR", build_analyse_value),
    ("analyse_finance", "Analyse — Financement & Rentabilité", "Structure financière et performance des capitaux", build_analyse_finance),
]


def _build_synthese_story(payload: dict[str, Any], styles, page_refs: dict) -> list:
    """Mode synthèse : 8 pages fixes. Chaque page commence par un PageMarker
    qui enregistre son numéro effectif → permet un sommaire dynamique."""
    story: list = []
    # Page 1 — Cover.
    story += build_cover(payload, styles)
    story.append(NextPageTemplate("page"))
    story.append(PageBreak())
    # Page 2 — Sommaire.
    story.append(PageMarker("toc", page_refs))
    story += build_toc(payload, styles)

    for key, _title, _desc, builder in SYNTHESE_PAGE_KEYS:
        story.append(PageBreak())
        story.append(PageMarker(key, page_refs))
        story += builder(payload, styles)

    return story


def _build_dashboard_story(payload: dict[str, Any], styles, page_refs: dict) -> list:
    """Mode dashboard : cover + sommaire + une section par dashboard.
    Chaque section porte un PageMarker pour le sommaire dynamique."""
    from pages.dashboard.dashboard_section import build_dashboard_section

    story: list = []
    story += build_cover(payload, styles)
    story.append(NextPageTemplate("page"))
    story.append(PageBreak())
    story.append(PageMarker("toc", page_refs))
    story += build_toc(payload, styles)

    sections = payload.get("dashboards") or []
    for i, section in enumerate(sections):
        story.append(PageBreak())
        story.append(PageMarker(f"dashboard:{i}", page_refs))
        story += build_dashboard_section(section, payload, styles)
    return story


def _build_story(payload: dict[str, Any], styles, page_refs: dict) -> list:
    mode = payload.get("mode") or "synthese"
    if mode == "dashboard":
        return _build_dashboard_story(payload, styles, page_refs)
    # Default + "synthese".
    return _build_synthese_story(payload, styles, page_refs)


def _resolve_dynamic_toc(payload: dict[str, Any], page_refs: dict) -> None:
    """Remplace le `toc` du payload par des numéros de page calculés à partir
    de `page_refs` (rempli en pass 1). Garantit que le sommaire reflète la
    pagination réelle, même si une section a débordé sur 2 pages."""
    mode = payload.get("mode") or "synthese"
    if mode == "synthese":
        toc = []
        for i, (key, title, desc, _) in enumerate(SYNTHESE_PAGE_KEYS, start=1):
            page = page_refs.get(key)
            if page is None:
                # Pass 1 pas encore lancée — on conservera l'éventuel
                # toc déjà fourni par TS pour ne rien casser.
                return
            toc.append({"num": i, "title": title, "description": desc, "page": page})
        payload["toc"] = toc
        return
    if mode == "dashboard":
        sections = payload.get("dashboards") or []
        toc = []
        for i, section in enumerate(sections):
            page = page_refs.get(f"dashboard:{i}")
            if page is None:
                return
            toc.append({
                "num": i + 1,
                "title": section.get("title", ""),
                "description": section.get("description", "") or "",
                "page": page,
            })
        payload["toc"] = toc


# ─── Build pipeline 2-pass ─────────────────────────────────────────────────
def build_document(payload: dict[str, Any]) -> bytes:
    """Pass 1 : compte les pages ET enregistre le numéro de page de chaque
    section via PageMarker → on peut bâtir un sommaire dynamique au lieu
    d'un mapping figé.
    Pass 2 : injecte `_pageTotal` + `toc` recalculé et produit le PDF final."""
    styles = build_styles()

    # Pass 1 — page count + page_refs.
    payload.setdefault("_pageTotal", 0)
    page_refs: dict = {}
    counter_buf = io.BytesIO()
    counter_doc = _make_doc(counter_buf, payload)
    counter_doc.build(_build_story(payload, styles, page_refs))
    payload["_pageTotal"] = max(counter_doc.page, 1)

    # Recompose le sommaire à partir des positions réelles.
    _resolve_dynamic_toc(payload, page_refs)

    # Pass 2 — rendu final avec chrome + TOC corrects.
    out_buf = io.BytesIO()
    out_doc = _make_doc(out_buf, payload)
    out_doc.build(_build_story(payload, styles, {}))
    return out_buf.getvalue()


def main() -> int:
    raw = sys.stdin.buffer.read()
    if not raw:
        sys.stderr.write("Empty stdin\n")
        return 2
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"Invalid JSON on stdin: {exc}\n")
        return 2
    try:
        pdf = build_document(payload)
    except Exception as exc:  # noqa: BLE001
        import traceback
        sys.stderr.write(f"PDF build failed: {type(exc).__name__}: {exc}\n")
        traceback.print_exc(file=sys.stderr)
        return 3
    sys.stdout.buffer.write(pdf)
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
