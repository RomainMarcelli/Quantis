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
import { Check, Search, Sparkles, X } from "lucide-react";
import {
  WIDGET_CATEGORIES,
  WIDGET_CATEGORY_GROUPS,
  listAllPickerKpis,
  listKpisByCategory,
  type PickerEntry
} from "@/lib/kpi/kpiCategoryMap";
import {
  filterPhase1VizTypes,
  getAllowedVizTypes,
  getDefaultVizType
} from "@/lib/kpi/widgetCompatibility";
import {
  isKpiAvailable,
  unavailabilityReason,
  type KpiAvailabilityContext
} from "@/lib/kpi/kpiAvailability";
import { WidgetPreview } from "@/components/dashboard/widgets/WidgetPreview";
import type {
  CustomChartConfig, CustomChartMode, CustomChartType,
  WidgetCategory, WidgetVizType,
} from "@/types/dashboard";

const VIZ_LABELS: Record<WidgetVizType, string> = {
  kpiCard: "Carte valeur",
  lineChart: "Courbe d'évolution",
  barChart: "Histogramme",
  gauge: "Jauge",
  donut: "Donut",
  waterfall: "Cascade",
  comparison: "Comparaison marché",
  quantisScore: "Score Vyzor (radial)",
  aiInsight: "Recommandation IA",
  alertList: "Liste d'alertes",
  actionList: "Plan d'action",
  evolutionChart: "Évolution multi-séries",
  breakEvenChart: "Seuil de rentabilité",
  bfrCycle: "Cycle d'exploitation",
  liquidityRatios: "Ratios de liquidité",
  roeRoceChart: "ROE vs ROCE",
  customChart: "Personnalisé"
};

type KpiPickerDrawerProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Callback ajout widget. `customConfig` est uniquement présent quand
   * vizType === "customChart" (widget construit via le builder Personnalisé).
   */
  onAdd: (
    kpiId: string,
    vizType: WidgetVizType,
    customConfig?: CustomChartConfig,
  ) => void;
  /** Si défini : seul cette catégorie est disponible (Phase 3 — sous-onglets contraints). */
  lockedCategory?: WidgetCategory;
  /**
   * Contexte d'availability — sert à griser les KPIs dont la donnée n'est
   * pas calculable pour l'analyse courante. Sans ce contexte, tout est
   * réputé disponible (mode "preview" hors-analyse).
   */
  availabilityCtx?: KpiAvailabilityContext;
  /**
   * Années disponibles pour le mode "Comparaison annuelle" du builder
   * personnalisé (extraites de l'historique des analyses du dossier).
   */
  availableYears?: number[];
};

export function KpiPickerDrawer({ open, onClose, onAdd, lockedCategory, availabilityCtx, availableYears }: KpiPickerDrawerProps) {
  const initialCategory: WidgetCategory = lockedCategory ?? WIDGET_CATEGORIES[0].id;
  const [activeCategory, setActiveCategory] = useState<WidgetCategory>(initialCategory);
  const [search, setSearch] = useState("");
  // Multi-sélection : on coche plusieurs widgets et chaque widget a SA viz
  // configurée individuellement (vizMap). Le focus pilote l'affichage du
  // panneau de droite (config détaillée + preview du widget focus).
  const [selectedKpiIds, setSelectedKpiIds] = useState<Set<string>>(() => new Set());
  const [vizMap, setVizMap] = useState<Map<string, WidgetVizType>>(() => new Map());
  const [lastFocusedKpiId, setLastFocusedKpiId] = useState<string | null>(null);

  // ── État builder du widget personnalisé (onglet "Personnalisé") ──
  const [builderTitle, setBuilderTitle] = useState("");
  const [builderMode, setBuilderMode] = useState<CustomChartMode>("series");
  const [builderChartType, setBuilderChartType] = useState<CustomChartType>("lineChart");
  const [builderSeries, setBuilderSeries] = useState<Set<string>>(() => new Set());
  const [builderYears, setBuilderYears] = useState<Set<number>>(() => new Set());
  // Type d'affichage par série quand chartType === "mixed" (line OU bar).
  // Default = "line" pour les nouvelles séries cochées.
  const [builderSeriesType, setBuilderSeriesType] = useState<Map<string, "line" | "bar">>(() => new Map());

  function toggleBuilderSeries(kpiId: string) {
    setBuilderSeries((prev) => {
      const next = new Set(prev);
      if (next.has(kpiId)) next.delete(kpiId);
      else if (next.size < 5) next.add(kpiId);
      return next;
    });
    setBuilderSeriesType((prev) => {
      const next = new Map(prev);
      if (next.has(kpiId)) next.delete(kpiId);
      else next.set(kpiId, "line");
      return next;
    });
  }

  function setSeriesDisplayType(kpiId: string, type: "line" | "bar") {
    setBuilderSeriesType((prev) => new Map(prev).set(kpiId, type));
  }

  function toggleBuilderYear(year: number) {
    setBuilderYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else if (next.size < 5) next.add(year);
      return next;
    });
  }

  function resetBuilder() {
    setBuilderTitle("");
    setBuilderMode("series");
    setBuilderChartType("lineChart");
    setBuilderSeries(new Set());
    setBuilderSeriesType(new Map());
    setBuilderYears(new Set());
  }

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

  // Toggle d'un widget dans la multi-sélection. Quand on coche : on ajoute
  // l'entrée dans vizMap avec la viz par défaut. Quand on décoche : on
  // retire l'entrée. Le focus passe sur le widget juste cliqué (s'il est
  // coché) — sinon focus null.
  function toggleKpi(kpiId: string) {
    if (availabilityCtx && !isKpiAvailable(kpiId, availabilityCtx)) return;
    const isAlreadySelected = selectedKpiIds.has(kpiId);
    setSelectedKpiIds((prev) => {
      const next = new Set(prev);
      if (next.has(kpiId)) next.delete(kpiId);
      else next.add(kpiId);
      return next;
    });
    setVizMap((prev) => {
      const next = new Map(prev);
      if (isAlreadySelected) next.delete(kpiId);
      else next.set(kpiId, getDefaultVizType(kpiId));
      return next;
    });
    setLastFocusedKpiId(isAlreadySelected ? null : kpiId);
  }

  /**
   * Click sur un widget DÉJÀ coché → on focus seulement (sans toggle).
   * Permet à l'utilisateur de revenir sur la config viz d'un widget déjà
   * dans la sélection sans devoir le décocher/recocher.
   */
  function focusKpi(kpiId: string) {
    if (availabilityCtx && !isKpiAvailable(kpiId, availabilityCtx)) return;
    if (!selectedKpiIds.has(kpiId)) {
      toggleKpi(kpiId);
      return;
    }
    setLastFocusedKpiId(kpiId);
  }

  function setVizForKpi(kpiId: string, viz: WidgetVizType) {
    setVizMap((prev) => {
      const next = new Map(prev);
      next.set(kpiId, viz);
      return next;
    });
  }

  /**
   * Pour chaque KPI visible, on précalcule sa disponibilité — utile pour
   * trier les indisponibles à la fin de la liste et pour styler chaque entry.
   */
  const kpiStates = useMemo(() => {
    if (!availabilityCtx) return new Map<string, { available: true }>();
    const m = new Map<string, { available: boolean; reason?: string }>();
    for (const def of visibleKpis) {
      const available = isKpiAvailable(def.id, availabilityCtx);
      m.set(def.id, available
        ? { available: true }
        : { available: false, reason: unavailabilityReason(def.id, availabilityCtx) }
      );
    }
    return m;
  }, [visibleKpis, availabilityCtx]);

  // Tri : disponibles en haut, indisponibles en bas (mais toujours visibles
  // pour signaler à l'utilisateur QU'ils existent — règle UX "discoverability").
  const sortedKpis = useMemo(() => {
    if (!availabilityCtx) return visibleKpis;
    const arr = [...visibleKpis];
    arr.sort((a, b) => {
      const av = kpiStates.get(a.id)?.available ? 1 : 0;
      const bv = kpiStates.get(b.id)?.available ? 1 : 0;
      return bv - av; // disponibles d'abord
    });
    return arr;
  }, [visibleKpis, kpiStates, availabilityCtx]);

  /**
   * Tous les widgets cochés à travers TOUTES les catégories — résolus via
   * `listAllPickerKpis` (pas via `sortedKpis` qui se limite à la catégorie
   * active). Sans ça, changer de catégorie "perdrait" les widgets cochés
   * dans les autres onglets côté preview ET côté confirm.
   *
   * NB : ce hook DOIT rester avant le `if (!open) return null` — sinon
   * React détecte un changement d'ordre des hooks entre renders (open
   * passe de false → true) et crashe.
   */
  const allSelectedDefs = useMemo(() => {
    return listAllPickerKpis().filter((def) => selectedKpiIds.has(def.id));
  }, [selectedKpiIds]);

  // Reset des sélections internes — appelé sur close/confirm pour ne pas
  // garder une sélection orpheline entre deux ouvertures.
  function resetAndClose() {
    setSelectedKpiIds(new Set());
    setVizMap(new Map());
    setLastFocusedKpiId(null);
    resetBuilder();
    setSearch("");
    setActiveCategory(lockedCategory ?? WIDGET_CATEGORIES[0].id);
    onClose();
  }

  /**
   * Soumet le widget personnalisé : construit la CustomChartConfig depuis
   * l'état builder, génère un kpiId unique `custom:<uuid>`, et appelle onAdd.
   */
  function submitCustomBuilder() {
    // Mode yearly : besoin d'1 KPI + au moins 1 année.
    // Mode series : besoin d'au moins 1 KPI.
    if (builderMode === "yearly") {
      if (builderSeries.size !== 1 || builderYears.size === 0) return;
    } else if (builderSeries.size === 0) return;

    const seriesArray = Array.from(builderSeries);
    const yearsArray = Array.from(builderYears).sort((a, b) => a - b);
    const config: CustomChartConfig = {
      title: builderTitle.trim() || (
        builderMode === "yearly"
          ? `Comparaison annuelle (${yearsArray.length} années)`
          : `Widget personnalisé (${seriesArray.length} séries)`
      ),
      chartType: builderChartType,
      mode: builderMode,
      series: seriesArray.map((kpiId) => ({
        kpiId,
        displayType: builderSeriesType.get(kpiId) ?? "line",
      })),
      ...(builderMode === "yearly" ? { years: yearsArray } : {}),
    };
    const customId = `custom:${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)
    }`;
    onAdd(customId, "customChart", config);
    resetBuilder();
    onClose();
  }

  if (!open) return null;

  const focusKpiId = lastFocusedKpiId && selectedKpiIds.has(lastFocusedKpiId)
    ? lastFocusedKpiId
    : null;
  const focusVizType: WidgetVizType = focusKpiId
    ? vizMap.get(focusKpiId) ?? getDefaultVizType(focusKpiId)
    : "kpiCard";
  const allowedVizTypes = focusKpiId
    ? filterPhase1VizTypes(getAllowedVizTypes(focusKpiId))
    : [];
  const selectionSize = selectedKpiIds.size;

  function handleConfirm() {
    if (selectionSize === 0) return;
    // On boucle sur la sélection GLOBALE (cross-catégorie). Chaque widget
    // est ajouté avec sa viz configurée dans vizMap.
    for (const def of allSelectedDefs) {
      const viz = vizMap.get(def.id) ?? getDefaultVizType(def.id);
      onAdd(def.id, viz);
    }
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
            <h2 className="text-lg font-semibold text-white">Sélectionner des widgets</h2>
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
              placeholder="Rechercher un widget dans toutes les catégories…"
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/35 focus:border-quantis-gold/40 focus:outline-none"
            />
          </div>
        </div>

        {/* Navigation 2 niveaux :
              - Niveau 1 (top) : 3 onglets principaux (Indicateurs / États
                financiers / Pilotage)
              - Niveau 2 (dessous) : sous-onglets de la catégorie active
            Masqués si lockedCategory + pas de recherche. */}
        {!lockedCategory && search.trim().length <= 1 ? (
          (() => {
            const activeGroup =
              WIDGET_CATEGORIES.find((c) => c.id === activeCategory)?.group ?? "indicateurs";
            const subTabs = WIDGET_CATEGORIES.filter((c) => c.group === activeGroup);

            return (
              <>
                {/* Niveau 1 : onglets principaux */}
                <nav className="border-b border-white/10 px-5 pt-3">
                  <ul className="flex gap-1">
                    {WIDGET_CATEGORY_GROUPS.map((group) => {
                      const isActive = group.id === activeGroup;
                      return (
                        <li key={group.id}>
                          <button
                            type="button"
                            onClick={() => {
                              // Bascule sur la 1re sous-cat du groupe choisi.
                              const first = WIDGET_CATEGORIES.find((c) => c.group === group.id);
                              if (first) setActiveCategory(first.id);
                            }}
                            aria-pressed={isActive}
                            className={`relative rounded-t-md px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                              isActive
                                ? "text-white"
                                : "text-white/40 hover:text-white/70"
                            }`}
                          >
                            {group.label}
                            {isActive ? (
                              <span className="absolute bottom-[-1px] left-3 right-3 h-[2px] bg-quantis-gold" />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </nav>

                {/* Niveau 2 : sous-onglets de la cat active. Masqué si une
                    seule sous-cat (cas Pilotage) — pas de bruit visuel. */}
                {subTabs.length > 1 ? (
                  <nav className="border-b border-white/10 bg-white/[0.02] px-5 py-2">
                    <ul className="flex flex-wrap gap-1">
                      {subTabs.map((cat) => (
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
              </>
            );
          })()
        ) : null}

        {/* Liste KPI + détail viz à droite. Mode "personnalise" : on bascule
            sur le BUILDER de widget custom (multi-séries). */}
        <div className="flex flex-1 overflow-hidden">
          {activeCategory === "personnalise" ? (
            <CustomBuilderPanes
              builderTitle={builderTitle}
              setBuilderTitle={setBuilderTitle}
              builderMode={builderMode}
              setBuilderMode={setBuilderMode}
              builderChartType={builderChartType}
              setBuilderChartType={setBuilderChartType}
              builderSeries={builderSeries}
              toggleBuilderSeries={toggleBuilderSeries}
              builderSeriesType={builderSeriesType}
              setSeriesDisplayType={setSeriesDisplayType}
              builderYears={builderYears}
              toggleBuilderYear={toggleBuilderYear}
              availableYears={availableYears ?? []}
              availabilityCtx={availabilityCtx}
              onCancel={resetAndClose}
              onSubmit={submitCustomBuilder}
            />
          ) : (
            <>
          <div className="w-1/2 overflow-y-auto border-r border-white/10 px-3 py-2">
            {sortedKpis.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-white/45">
                Aucun widget ne correspond à ta recherche.
              </p>
            ) : (
              <ul className="space-y-1">
                {sortedKpis.map((def) => {
                  const state = kpiStates.get(def.id);
                  const isUnavailable = state?.available === false;
                  const isChecked = selectedKpiIds.has(def.id);
                  const isFocused = lastFocusedKpiId === def.id && isChecked;
                  // La checkbox toggle ; le RESTE de la ligne focus
                  // (sans toggler) — permet de revenir sur la config viz
                  // d'un widget déjà coché sans le décocher.
                  const rowBg = isUnavailable
                    ? "opacity-40 cursor-not-allowed"
                    : isFocused
                    ? "bg-quantis-gold/10 ring-1 ring-quantis-gold/40"
                    : isChecked
                    ? "bg-quantis-gold/[0.06]"
                    : "hover:bg-white/[0.04]";
                  return (
                    <li key={def.id}>
                      <div
                        className={`flex w-full items-start gap-3 rounded-md px-3 py-2 transition ${rowBg}`}
                        title={isUnavailable ? state?.reason : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => !isUnavailable && toggleKpi(def.id)}
                          aria-pressed={isChecked}
                          aria-label={isChecked ? "Décocher" : "Cocher"}
                          disabled={isUnavailable}
                          className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                            isChecked
                              ? "border-quantis-gold bg-quantis-gold/80 text-quantis-base"
                              : "border-white/25 hover:border-white/50"
                          }`}
                        >
                          {isChecked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => !isUnavailable && focusKpi(def.id)}
                          disabled={isUnavailable}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="text-sm font-medium text-white">{def.label}</p>
                          <p className="mt-0.5 text-[11px] text-white/55">
                            {isUnavailable
                              ? (state?.reason ?? "Donnée non disponible.")
                              : def.shortLabel}
                          </p>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Panneau de droite — structure 4 strates :
                1) header sticky (compteur)
                2) liste des widgets sélectionnés (scrollable)
                3) aperçu du widget focus (figé)
                4) footer Annuler / Ajouter (figé)
              La liste scrolle, le reste reste à l'écran sans scroll. */}
          <div className="flex w-1/2 flex-col overflow-hidden">
            {selectionSize === 0 ? (
              <div className="flex flex-1 items-center justify-center px-5 py-4 text-center text-xs text-white/45">
                <span>
                  <Sparkles className="mx-auto mb-2 h-5 w-5 text-quantis-gold/60" />
                  Cochez un ou plusieurs widgets à gauche pour les configurer.
                </span>
              </div>
            ) : (
              <>
                {/* Header sticky */}
                <div className="flex items-baseline justify-between border-b border-white/10 px-5 py-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
                    Widgets à ajouter ({selectionSize})
                  </p>
                  <p className="text-[10px] text-white/45">Configurez le format de chacun</p>
                </div>

                {/* Liste scrollable — cross-catégorie via allSelectedDefs.
                    Changer d'onglet à gauche ne perd PAS la sélection ici. */}
                <ul className="flex-1 space-y-1.5 overflow-y-auto px-5 py-3">
                  {allSelectedDefs.map((def) => {
                    const allowed = filterPhase1VizTypes(getAllowedVizTypes(def.id));
                    const currentViz = vizMap.get(def.id) ?? getDefaultVizType(def.id);
                    const isFocused = lastFocusedKpiId === def.id;
                    return (
                      <li
                        key={def.id}
                        className={`flex items-center gap-2 rounded-md border px-2.5 py-2 ${
                          isFocused
                            ? "border-quantis-gold/40 bg-quantis-gold/[0.06]"
                            : "border-white/10 bg-white/[0.02]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setLastFocusedKpiId(def.id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="truncate text-sm font-medium text-white">{def.label}</p>
                        </button>
                        <select
                          value={currentViz}
                          onChange={(e) => setVizForKpi(def.id, e.target.value as WidgetVizType)}
                          onFocus={() => setLastFocusedKpiId(def.id)}
                          className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white focus:border-quantis-gold/40 focus:outline-none"
                        >
                          {allowed.map((viz) => (
                            <option key={viz} value={viz} className="bg-quantis-base">
                              {VIZ_LABELS[viz]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => toggleKpi(def.id)}
                          aria-label="Retirer de la sélection"
                          className="shrink-0 rounded-md p-1 text-white/40 hover:bg-white/5 hover:text-white/80"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {/* Aperçu figé — toujours visible quand un widget a le focus */}
                {focusKpiId && allowedVizTypes.length > 0 ? (
                  <div className="border-t border-white/10 px-5 py-3">
                    <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
                      Aperçu du widget focus
                    </p>
                    <WidgetPreview vizType={focusVizType} kpiId={focusKpiId} />
                  </div>
                ) : null}
              </>
            )}

            {/* Footer figé — toujours visible, indépendamment du scroll. */}
            <div className="flex gap-2 border-t border-white/10 px-5 py-3">
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
                disabled={selectionSize === 0}
                className="flex-1 rounded-lg border border-quantis-gold/40 bg-quantis-gold/15 px-3 py-2 text-sm font-medium text-quantis-gold hover:bg-quantis-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {selectionSize > 1 ? `Ajouter (${selectionSize})` : "Ajouter"}
              </button>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Builder de widget personnalisé ───────────────────────────────────────
type CustomBuilderProps = {
  builderTitle: string;
  setBuilderTitle: (s: string) => void;
  builderMode: CustomChartMode;
  setBuilderMode: (m: CustomChartMode) => void;
  builderChartType: CustomChartType;
  setBuilderChartType: (t: CustomChartType) => void;
  builderSeries: Set<string>;
  toggleBuilderSeries: (kpiId: string) => void;
  builderSeriesType: Map<string, "line" | "bar">;
  setSeriesDisplayType: (kpiId: string, type: "line" | "bar") => void;
  builderYears: Set<number>;
  toggleBuilderYear: (year: number) => void;
  availableYears: number[];
  availabilityCtx?: KpiAvailabilityContext;
  onCancel: () => void;
  onSubmit: () => void;
};

function CustomBuilderPanes(props: CustomBuilderProps) {
  const {
    builderTitle, setBuilderTitle,
    builderMode, setBuilderMode,
    builderChartType, setBuilderChartType,
    builderSeries, toggleBuilderSeries,
    builderSeriesType, setSeriesDisplayType,
    builderYears, toggleBuilderYear, availableYears,
    availabilityCtx, onCancel, onSubmit,
  } = props;

  // KPIs proposés au choix de séries — uniquement les KPIs calculés (pas les
  // raw variables, pas les widgets contextuels). On filtre sur availability.
  const availableSeries = useMemo(() => {
    return listAllPickerKpis()
      .filter((def) =>
        !def.id.startsWith("synthese:") && !def.id.startsWith("raw:")
      )
      .filter((def) => !availabilityCtx || isKpiAvailable(def.id, availabilityCtx));
  }, [availabilityCtx]);

  const seriesCount = builderSeries.size;
  // En mode yearly : 1 SEUL KPI autorisé (la comparaison se fait sur les années).
  // En mode séries : jusqu'à 5 KPIs.
  const maxSeries = builderMode === "yearly" ? 1 : 5;
  const reachedMax = seriesCount >= maxSeries;
  const canSubmit = builderMode === "yearly"
    ? seriesCount === 1 && builderYears.size >= 1
    : seriesCount >= 1;

  return (
    <>
      {/* Panneau gauche : choix des séries (multi-check) */}
      <div className="flex w-1/2 flex-col overflow-hidden border-r border-white/10">
        <div className="border-b border-white/10 px-5 py-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
            {builderMode === "yearly" ? "KPI à comparer" : "Séries du widget"}
          </p>
          <p className="mt-1 text-xs text-white/55">
            {builderMode === "yearly"
              ? "Choisissez 1 KPI à comparer entre années."
              : `Cochez les KPIs à combiner (${seriesCount}/5).${reachedMax ? " Limite atteinte." : ""}`}
          </p>
        </div>
        <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {availableSeries.map((def) => {
            const isChecked = builderSeries.has(def.id);
            const disabled = !isChecked && reachedMax;
            return (
              <li key={def.id}>
                <button
                  type="button"
                  onClick={() => !disabled && toggleBuilderSeries(def.id)}
                  disabled={disabled}
                  aria-pressed={isChecked}
                  className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition ${
                    disabled
                      ? "opacity-40 cursor-not-allowed"
                      : isChecked
                      ? "bg-quantis-gold/[0.06]"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  <span
                    className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      isChecked
                        ? "border-quantis-gold bg-quantis-gold/80 text-quantis-base"
                        : "border-white/25"
                    }`}
                  >
                    {isChecked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  </span>
                  <span className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{def.label}</p>
                    <p className="mt-0.5 text-[11px] text-white/55">{def.shortLabel}</p>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Panneau droite : configuration + bouton ajouter */}
      <div className="flex w-1/2 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Toggle mode d'analyse — "Comparaison annuelle" requiert au
              moins 2 années avec dailyAccounting (sources dynamiques). */}
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
            Mode d'analyse
          </p>
          {(() => {
            const yearlyDisabled = availableYears.length < 2;
            const yearlyTooltip = yearlyDisabled
              ? "Mode disponible uniquement avec ≥ 2 analyses dynamiques (Pennylane / MyUnisoft / FEC)."
              : undefined;
            return (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  { value: "series", label: "Multi-séries", hint: "N KPIs sur axe temps", disabled: false },
                  { value: "yearly", label: "Comparaison annuelle", hint: "1 KPI × N années", disabled: yearlyDisabled },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => !opt.disabled && setBuilderMode(opt.value)}
                    aria-pressed={builderMode === opt.value}
                    aria-disabled={opt.disabled}
                    disabled={opt.disabled}
                    title={opt.value === "yearly" ? yearlyTooltip : undefined}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                      opt.disabled
                        ? "opacity-40 cursor-not-allowed border-white/10 bg-white/[0.02] text-white/40"
                        : builderMode === opt.value
                        ? "border-quantis-gold/50 bg-quantis-gold/10 text-quantis-gold"
                        : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20"
                    }`}
                  >
                    <p className="font-medium">{opt.label}</p>
                    <p className="mt-0.5 text-[10px] text-white/55">
                      {opt.disabled ? "Pas d'historique mensuel" : opt.hint}
                    </p>
                  </button>
                ))}
              </div>
            );
          })()}

          <p className="mt-5 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
            Titre du widget
          </p>
          <input
            type="text"
            value={builderTitle}
            onChange={(e) => setBuilderTitle(e.target.value)}
            placeholder={
              builderMode === "yearly" ? "Ex. CA 2024 vs 2025 vs 2026" : "Ex. CA vs EBE vs Résultat net"
            }
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-quantis-gold/40 focus:outline-none"
          />

          {/* Sélecteur d'années — uniquement en mode yearly */}
          {builderMode === "yearly" ? (
            <>
              <p className="mt-5 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
                Années à comparer ({builderYears.size})
              </p>
              {availableYears.length === 0 ? (
                <p className="mt-2 text-xs text-white/55">
                  Pas d&apos;historique disponible. Importez plusieurs analyses pour activer la comparaison.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {availableYears.map((year) => {
                    const isOn = builderYears.has(year);
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => toggleBuilderYear(year)}
                        aria-pressed={isOn}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                          isOn
                            ? "border-quantis-gold/50 bg-quantis-gold/10 text-quantis-gold"
                            : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20"
                        }`}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}

          <p className="mt-5 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
            Type de graphique
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([
              { value: "lineChart", label: "Courbes" },
              { value: "barChart", label: "Barres" },
              { value: "mixed", label: "Mixte" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBuilderChartType(opt.value)}
                aria-pressed={builderChartType === opt.value}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  builderChartType === opt.value
                    ? "border-quantis-gold/50 bg-quantis-gold/10 text-quantis-gold"
                    : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {builderChartType === "mixed" ? (
            <p className="mt-2 text-[11px] text-white/55">
              Chaque série choisit son type ci-dessous (courbe ou barres).
            </p>
          ) : null}

          {seriesCount > 0 ? (
            <>
              <p className="mt-5 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
                Séries sélectionnées
              </p>
              <ul className="mt-2 space-y-1">
                {Array.from(builderSeries).map((id) => {
                  const def = availableSeries.find((d) => d.id === id);
                  const seriesType = builderSeriesType.get(id) ?? "line";
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs">
                      <span className="flex-1 truncate text-white/85">{def?.label ?? id}</span>
                      {/* En mode mixte : toggle line/bar par série */}
                      {builderChartType === "mixed" ? (
                        <div className="inline-flex shrink-0 overflow-hidden rounded border border-white/10">
                          {(["line", "bar"] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setSeriesDisplayType(id, t)}
                              aria-pressed={seriesType === t}
                              className={`px-2 py-0.5 text-[10px] font-medium transition ${
                                seriesType === t
                                  ? "bg-quantis-gold/15 text-quantis-gold"
                                  : "text-white/55 hover:bg-white/[0.04]"
                              }`}
                            >
                              {t === "line" ? "Courbe" : "Barre"}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleBuilderSeries(id)}
                        aria-label="Retirer"
                        className="shrink-0 rounded p-0.5 text-white/40 hover:bg-white/5 hover:text-white/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mt-5 text-center text-xs text-white/45">
              Cochez à gauche les KPIs à inclure dans le widget.
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/65 hover:bg-white/5 hover:text-white"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="flex-1 rounded-lg border border-quantis-gold/40 bg-quantis-gold/15 px-3 py-2 text-sm font-medium text-quantis-gold hover:bg-quantis-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Ajouter le widget
          </button>
        </div>
      </div>
    </>
  );
}
