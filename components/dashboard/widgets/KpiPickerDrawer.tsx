// File: components/dashboard/widgets/KpiPickerDrawer.tsx
// Role: drawer modal pour ajouter un widget. L'utilisateur :
//   1. Choisit une catégorie (5 onglets en Phase 1)
//   2. Sélectionne un KPI dans la liste filtrée
//   3. Choisit un type de visualisation parmi celles compatibles
//   4. Clique "Ajouter"
//
// Recherche globale dans la barre du haut — traverse toutes les catégories.
// Le picker peut aussi être contraint à une catégorie donnée (props
// `lockedCategory`) pour les sous-onglets du Tableau de bord (Phase 3).
"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import {
  WIDGET_CATEGORIES,
  listAllPickerKpis,
  listKpisByCategory,
  type PickerEntry
} from "@/lib/kpi/kpiCategoryMap";
import {
  filterPhase1VizTypes,
  getAllowedVizTypes,
  getDefaultVizType
} from "@/lib/kpi/widgetCompatibility";
import { WidgetPreview } from "@/components/dashboard/widgets/WidgetPreview";
import type { WidgetCategory, WidgetVizType } from "@/types/dashboard";

const VIZ_LABELS: Record<WidgetVizType, string> = {
  kpiCard: "Carte valeur",
  lineChart: "Courbe d'évolution",
  barChart: "Histogramme",
  gauge: "Jauge",
  donut: "Donut",
  waterfall: "Cascade",
  comparison: "Comparaison marché",
  quantisScore: "Score Quantis (radial)",
  aiInsight: "Recommandation IA",
  alertList: "Liste d'alertes",
  actionList: "Plan d'action",
  evolutionChart: "Évolution multi-séries"
};

type KpiPickerDrawerProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (kpiId: string, vizType: WidgetVizType) => void;
  /** Si défini : seul cette catégorie est disponible (Phase 3 — sous-onglets contraints). */
  lockedCategory?: WidgetCategory;
};

export function KpiPickerDrawer({ open, onClose, onAdd, lockedCategory }: KpiPickerDrawerProps) {
  const initialCategory: WidgetCategory = lockedCategory ?? WIDGET_CATEGORIES[0].id;
  const [activeCategory, setActiveCategory] = useState<WidgetCategory>(initialCategory);
  const [search, setSearch] = useState("");
  const [selectedKpiId, setSelectedKpiId] = useState<string | null>(null);
  const [selectedVizType, setSelectedVizType] = useState<WidgetVizType>("kpiCard");

  // Liste filtrée : recherche prend le pas sur la catégorie active.
  const visibleKpis: PickerEntry[] = useMemo(() => {
    if (search.trim().length > 1) {
      const q = search.toLowerCase();
      return listAllPickerKpis().filter(
        (def) =>
          def.label.toLowerCase().includes(q) ||
          def.shortLabel.toLowerCase().includes(q) ||
          def.id.toLowerCase().includes(q)
      );
    }
    return listKpisByCategory(activeCategory);
  }, [search, activeCategory]);

  // Sélection d'un KPI : on positionne aussi la viz par défaut côté détail.
  // Pattern alternatif au useEffect "set default viz on selection change" qui
  // déclenchait un avertissement React 19 (set-state-in-effect).
  function selectKpi(kpiId: string) {
    setSelectedKpiId(kpiId);
    setSelectedVizType(getDefaultVizType(kpiId));
  }

  // Reset des sélections internes — appelé sur close/confirm pour ne pas
  // garder une sélection orpheline entre deux ouvertures.
  function resetAndClose() {
    setSelectedKpiId(null);
    setSelectedVizType("kpiCard");
    setSearch("");
    setActiveCategory(lockedCategory ?? WIDGET_CATEGORIES[0].id);
    onClose();
  }

  if (!open) return null;

  const allowedVizTypes = selectedKpiId
    ? filterPhase1VizTypes(getAllowedVizTypes(selectedKpiId))
    : [];

  function handleConfirm() {
    if (!selectedKpiId) return;
    onAdd(selectedKpiId, selectedVizType);
    resetAndClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter un widget"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
      onClick={resetAndClose}
    >
      <div
        className="precision-card relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">Ajouter</p>
            <h2 className="text-lg font-semibold text-white">Sélectionner un KPI</h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Fermer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-white/65 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Search */}
        <div className="border-b border-white/10 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un KPI dans toutes les catégories…"
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/35 focus:border-quantis-gold/40 focus:outline-none"
            />
          </div>
        </div>

        {/* Onglets catégories — masqués si lockedCategory + pas de recherche */}
        {!lockedCategory && search.trim().length <= 1 ? (
          <nav className="border-b border-white/10 px-5 py-2">
            <ul className="flex flex-wrap gap-1">
              {WIDGET_CATEGORIES.map((cat) => (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    aria-pressed={activeCategory === cat.id}
                    className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition ${
                      activeCategory === cat.id
                        ? "bg-quantis-gold/15 text-quantis-gold"
                        : "text-white/55 hover:bg-white/5 hover:text-white/80"
                    }`}
                  >
                    {cat.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {/* Liste KPI + détail viz à droite */}
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/2 overflow-y-auto border-r border-white/10 px-3 py-2">
            {visibleKpis.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-white/45">
                Aucun KPI ne correspond à ta recherche.
              </p>
            ) : (
              <ul className="space-y-1">
                {visibleKpis.map((def) => (
                  <li key={def.id}>
                    <button
                      type="button"
                      onClick={() => selectKpi(def.id)}
                      aria-pressed={selectedKpiId === def.id}
                      className={`w-full rounded-md px-3 py-2 text-left transition ${
                        selectedKpiId === def.id
                          ? "bg-quantis-gold/10 ring-1 ring-quantis-gold/40"
                          : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <p className="text-sm font-medium text-white">{def.label}</p>
                      <p className="mt-0.5 text-[11px] text-white/55">{def.shortLabel}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex w-1/2 flex-col overflow-y-auto px-5 py-4">
            {selectedKpiId ? (
              <div className="flex flex-1 flex-col gap-4">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
                    Type de visualisation
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {allowedVizTypes.map((viz) => (
                      <li key={viz}>
                        <button
                          type="button"
                          onClick={() => setSelectedVizType(viz)}
                          aria-pressed={selectedVizType === viz}
                          className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                            selectedVizType === viz
                              ? "border-quantis-gold/50 bg-quantis-gold/10 text-quantis-gold"
                              : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {VIZ_LABELS[viz]}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {allowedVizTypes.length === 0 ? (
                    <p className="mt-3 text-xs text-white/55">
                      Aucun type de visualisation disponible pour ce KPI en V1.
                    </p>
                  ) : null}
                </div>

                {/* Aperçu visuel du widget — mini-illustration stylisée
                    de la viz sélectionnée pour aider au choix sans avoir
                    à valider et tester. */}
                {allowedVizTypes.length > 0 ? (
                  <WidgetPreview vizType={selectedVizType} kpiId={selectedKpiId} />
                ) : null}
              </div>
            ) : (
              <p className="m-auto text-center text-xs text-white/45">
                <Sparkles className="mx-auto mb-2 h-5 w-5 text-quantis-gold/60" />
                Sélectionne un KPI à gauche pour configurer sa visualisation.
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={resetAndClose}
                className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/65 hover:bg-white/5 hover:text-white"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!selectedKpiId || allowedVizTypes.length === 0}
                className="flex-1 rounded-lg border border-quantis-gold/40 bg-quantis-gold/15 px-3 py-2 text-sm font-medium text-quantis-gold hover:bg-quantis-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
