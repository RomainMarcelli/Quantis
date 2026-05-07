// File: components/dashboard/widgets/CustomizableDashboard.tsx
// Role: container haut-niveau qui orchestre :
//   - le hook useDashboardLayout (load/save Firestore)
//   - le toggle mode édition (style Apple "wiggle")
//   - le bouton "Ajouter un widget" qui ouvre le KpiPickerDrawer
//   - le dispatcher de viz (rendu KpiCardWidget / LineChartWidget selon vizType)
//   - la grille drag-drop (WidgetGrid)
//
// Phase 1 : utilisé par /synthese seulement. Phase 3 ajoutera des instances
// pour les 4 sous-onglets du Tableau de bord avec `lockedCategory` set.
"use client";

import { Plus, SlidersHorizontal, Check, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { WidgetGrid } from "@/components/dashboard/widgets/WidgetGrid";
import { KpiPickerDrawer } from "@/components/dashboard/widgets/KpiPickerDrawer";
import { KpiCardWidget } from "@/components/dashboard/widgets/KpiCardWidget";
import { LineChartWidget } from "@/components/dashboard/widgets/LineChartWidget";
import { BarChartWidget } from "@/components/dashboard/widgets/BarChartWidget";
import { GaugeWidget } from "@/components/dashboard/widgets/GaugeWidget";
import { DonutWidget } from "@/components/dashboard/widgets/DonutWidget";
import { WaterfallWidget } from "@/components/dashboard/widgets/WaterfallWidget";
import { ComparisonWidget } from "@/components/dashboard/widgets/ComparisonWidget";
import { RawVariableWidget } from "@/components/dashboard/widgets/RawVariableWidget";
import { RecommendationWidget } from "@/components/dashboard/widgets/RecommendationWidget";
import { AlertsWidget } from "@/components/dashboard/widgets/AlertsWidget";
import { ActionPlanWidget } from "@/components/dashboard/widgets/ActionPlanWidget";
import { EvolutionChart } from "@/components/synthese/EvolutionChart";
import { VyzorScoreCard } from "@/components/dashboard/VyzorScoreCard";
import { isRawVariableId } from "@/lib/dashboard/rawVariableCatalog";
import type { AnalysisRecord, CalculatedKpis, MappedFinancialData } from "@/types/analysis";
import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";
import type {
  DashboardLayout,
  WidgetCategory,
  WidgetInstance
} from "@/types/dashboard";

type CustomizableDashboardProps = {
  userId: string | null;
  layoutId: string;
  defaultLayout: DashboardLayout;
  /** KPIs courants alimentent les widgets KpiCard. */
  kpis: CalculatedKpis;
  /** KPIs période précédente — pour la variation N vs N-1 dans KpiCardLayout. */
  previousKpis?: CalculatedKpis | null;
  /** Historique du dossier — alimente les LineChartWidget. */
  analyses: AnalysisRecord[];
  /** Analyse courante — son dailyAccounting alimente le mode mensuel des LineChart. */
  currentAnalysis: AnalysisRecord | null;
  /** Données mappées (variables Bilan/CDR brutes) — alimente RawVariable,
   *  Donut décomposition, Waterfall. Optionnel : sans elles, ces widgets
   *  affichent un état "données non disponibles" sans crasher. */
  mappedData?: MappedFinancialData | null;
  /** Si défini : le picker est limité à cette catégorie (sous-onglets dashboard). */
  lockedCategory?: WidgetCategory;
  /** Sélection click-to-highlight pour les widgets KpiCard. Sert au chart top
   *  des onglets dashboard qui se met à jour quand l'utilisateur clique sur
   *  une carte. Quand fourni, les KpiCard widgets deviennent cliquables avec
   *  un anneau or sur la carte sélectionnée. */
  kpiSelection?: {
    selectedKpiId: string;
    onSelect: (kpiId: string) => void;
  };
  /**
   * SyntheseViewModel — alimente les widgets contextuels Synthèse
   *   (Recommandation, Alertes, Plan d'action). Optionnel : pour les
   *   tableaux de bord hors-synthèse, ces widgets ne sont pas exposés.
   */
  synthese?: SyntheseViewModel | null;
  /**
   * Slot rendu en haut de la grille, AVANT les widgets. Utilisé pour la
   * Vyzor Score qui reste visible en permanence (non personnalisable
   * en V1 — sa forme variera en Phase 2).
   */
  pinnedHeaderSlot?: ReactNode;
  /**
   * Bouton(s) à intégrer dans la zone d'actions à droite du toggle
   * Personnaliser. Permet aux pages parents (Synthèse) d'ajouter leurs
   * propres CTA (Télécharger PDF, Exporter…) dans le même bandeau.
   */
  trailingActions?: ReactNode;
  /** Override visuel du toggle Personnaliser : si présent, on ne rend pas
   *  le sous-titre "X widgets affichés" — l'appelant gère son propre header. */
  hideHeaderTitle?: boolean;
  /** Mode contrôlé : si fourni, l'état d'édition est piloté par le parent.
   *  Permet au SyntheseDashboard de mettre le toggle Personnaliser dans son
   *  bandeau meta haut tout en pilotant la grille customizable en dessous. */
  controlledIsEditing?: boolean;
  onEditingChange?: (next: boolean) => void;
};

export function CustomizableDashboard({
  userId,
  layoutId,
  defaultLayout,
  kpis,
  previousKpis,
  analyses,
  currentAnalysis,
  mappedData,
  lockedCategory,
  kpiSelection,
  synthese,
  pinnedHeaderSlot,
  trailingActions,
  hideHeaderTitle,
  controlledIsEditing,
  onEditingChange
}: CustomizableDashboardProps) {
  const {
    layout,
    isLoading,
    isSaving,
    addWidget,
    removeWidget,
    reorderWidgets,
    updateWidget
  } = useDashboardLayout({ userId, layoutId, defaultLayout });

  const [internalEditing, setInternalEditing] = useState(false);
  const isEditing = controlledIsEditing ?? internalEditing;
  const setIsEditing = (next: boolean) => {
    if (onEditingChange) {
      onEditingChange(next);
    } else {
      setInternalEditing(next);
    }
  };
  const [pickerOpen, setPickerOpen] = useState(false);

  // Dispatcher de rendu : selon le `vizType` du widget, choisit le composant.
  // Phase 1 :
  //   - `kpiCard` (registre KPI), `lineChart` (registre KPI)
  //   - `aiInsight`, `alertList`, `actionList` (widgets Synthèse contextuels)
  // Pour les autres (barChart, gauge, donut, waterfall, comparison) on retombe
  // sur KpiCardWidget — l'utilisateur ne peut pas les sélectionner en V1
  // (filterPhase1VizTypes filtre ces choix dans le picker).
  function renderWidget(widget: WidgetInstance) {
    // Variables brutes Bilan/CDR : tracées via RawVariableWidget peu importe
    // le vizType demandé (compat = ["kpiCard"] uniquement de toute façon).
    if (isRawVariableId(widget.kpiId)) {
      return <RawVariableWidget kpiId={widget.kpiId} mappedData={mappedData ?? null} />;
    }

    switch (widget.vizType) {
      case "lineChart":
        return (
          <LineChartWidget
            kpiId={widget.kpiId}
            analyses={analyses}
            currentAnalysis={currentAnalysis}
          />
        );
      case "barChart":
        return (
          <BarChartWidget
            kpiId={widget.kpiId}
            analyses={analyses}
            currentAnalysis={currentAnalysis}
          />
        );
      case "gauge":
        return <GaugeWidget kpiId={widget.kpiId} kpis={kpis} />;
      case "donut":
        return <DonutWidget kpiId={widget.kpiId} mappedData={mappedData ?? null} />;
      case "waterfall":
        return <WaterfallWidget kpiId={widget.kpiId} mappedData={mappedData ?? null} />;
      case "comparison":
        return <ComparisonWidget kpiId={widget.kpiId} kpis={kpis} />;
      case "aiInsight":
        return (
          <RecommendationWidget
            message={
              synthese?.actions[0] ??
              "Maintenir la trajectoire actuelle et suivre les KPI chaque semaine."
            }
          />
        );
      case "alertList":
        return <AlertsWidget alerts={synthese?.alerts ?? []} />;
      case "actionList":
        return <ActionPlanWidget actions={synthese?.actions ?? []} />;
      case "evolutionChart":
        return <EvolutionChart analyses={analyses} currentAnalysis={currentAnalysis} />;
      case "quantisScore":
        return synthese ? (
          <VyzorScoreCard
            score={synthese.score}
            scoreLabel={synthese.scoreLabel}
            scorePiliers={synthese.scorePiliers}
            alerteInvestissement={synthese.alerteInvestissement}
            searchId="synthese-quantis-score"
          />
        ) : null;
      case "kpiCard":
      default:
        return (
          <KpiCardWidget
            kpiId={widget.kpiId}
            kpis={kpis}
            previousKpis={previousKpis}
            onSelect={kpiSelection ? () => kpiSelection.onSelect(widget.kpiId) : undefined}
            isSelected={kpiSelection?.selectedKpiId === widget.kpiId}
            isEditing={isEditing}
          />
        );
    }
  }

  return (
    <section className="space-y-4">
      {/* Bandeau d'actions du dashboard. Le sous-titre "X widgets" peut être
          masqué via `hideHeaderTitle` quand le parent (SyntheseDashboard)
          intègre déjà le toggle Personnaliser dans son propre header consolidé.
          Quand masqué : on continue de rendre le bouton "+ Ajouter un widget"
          en mode édition pour ne pas perdre l'accès au picker. */}
      {!hideHeaderTitle ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Mes widgets</h2>
            <p className="text-xs text-white/55">
              {isEditing
                ? "Glisse pour réordonner, redimensionne, ou supprime un widget."
                : `${layout.widgets.length} widget${layout.widgets.length > 1 ? "s" : ""} affiché${layout.widgets.length > 1 ? "s" : ""}.`}
            </p>
          </div>

          <DashboardActions
            isEditing={isEditing}
            isSaving={isSaving}
            onToggleEditing={() => setIsEditing(!isEditing)}
            onOpenPicker={() => setPickerOpen(true)}
            trailingActions={trailingActions}
          />
        </div>
      ) : isEditing ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-white/55">
            Glisse pour réordonner, redimensionne, ou supprime un widget.
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-quantis-gold/30 bg-quantis-gold/10 px-3 py-1.5 text-xs font-medium text-quantis-gold hover:bg-quantis-gold/20"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un widget
          </button>
        </div>
      ) : null}

      {/* Slot pinned : Vyzor Score reste affiché tout le temps en V1. */}
      {pinnedHeaderSlot}

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-xs text-white/55">
          Chargement de votre dashboard…
        </div>
      ) : (
        <WidgetGrid
          layout={layout}
          isEditing={isEditing}
          renderWidget={renderWidget}
          onReorder={reorderWidgets}
          onRemove={removeWidget}
          onUpdateWidget={updateWidget}
        />
      )}

      <KpiPickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={(kpiId, vizType) => addWidget(kpiId, vizType, "M")}
        lockedCategory={lockedCategory}
      />
    </section>
  );
}

// ─── Sub-component : group d'actions du dashboard ───────────────────────
// Extrait pour pouvoir être rendu seul par le parent (SyntheseDashboard) qui
// veut intégrer Personnaliser dans son bandeau meta haut.
export type DashboardActionsProps = {
  isEditing: boolean;
  isSaving: boolean;
  onToggleEditing: () => void;
  onOpenPicker: () => void;
  trailingActions?: ReactNode;
  /** Affiche le bouton "+ Ajouter un widget" en mode édition. Défaut true.
   *  Mettre à false quand le parent l'affiche déjà ailleurs (évite les
   *  doublons de bouton — cas SyntheseDashboard qui fait son propre header). */
  showAddButton?: boolean;
};

export function DashboardActions({
  isEditing,
  isSaving,
  onToggleEditing,
  onOpenPicker,
  trailingActions,
  showAddButton = true
}: DashboardActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isSaving ? (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-white/55">
          <Loader2 className="h-3 w-3 animate-spin" />
          Sauvegarde…
        </span>
      ) : null}

      {isEditing && showAddButton ? (
        <button
          type="button"
          onClick={onOpenPicker}
          className="inline-flex items-center gap-1.5 rounded-lg border border-quantis-gold/30 bg-quantis-gold/10 px-3 py-1.5 text-xs font-medium text-quantis-gold hover:bg-quantis-gold/20"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un widget
        </button>
      ) : null}

      <button
        type="button"
        onClick={onToggleEditing}
        aria-pressed={isEditing}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          isEditing
            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
            : "border-white/15 bg-white/[0.03] text-white/75 hover:bg-white/5 hover:text-white"
        }`}
      >
        {isEditing ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Terminer
          </>
        ) : (
          <>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Personnaliser
          </>
        )}
      </button>

      {trailingActions}
    </div>
  );
}
