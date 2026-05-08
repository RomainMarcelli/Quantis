// File: lib/kpi/kpiAvailability.ts
// Role: déterminer si un KPI est "disponible" pour l'analyse courante.
// Un KPI est disponible si sa valeur calculée est un nombre fini (pas null,
// pas undefined, pas NaN). Cette information sert à :
//   - masquer les widgets dont la donnée manque (CustomizableDashboard)
//   - griser les KPIs non disponibles dans le picker (KpiPickerDrawer)
//   - filtrer les lignes/sections vides dans le rapport PDF
//
// Source unique de vérité — toutes les surfaces consomment ce helper pour
// éviter qu'un endroit affiche "N/D" et un autre masque sans aligner les
// règles.

import type { AnalysisRecord, CalculatedKpis, MappedFinancialData } from "@/types/analysis";
import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";
import { getRawVariableDefinition, isRawVariableId } from "@/lib/dashboard/rawVariableCatalog";

export type KpiAvailabilityContext = {
  /** KPIs calculés pour l'analyse courante. null = aucune analyse. */
  kpis: CalculatedKpis | null;
  /** Données mappées (Bilan/CdR bruts) — alimente les widgets RawVariable. */
  mappedData?: MappedFinancialData | null;
  /** ViewModel synthèse — alimente les widgets `synthese:*`. */
  synthese?: SyntheseViewModel | null;
  /** Analyse courante — utilisée pour les widgets qui ont besoin de
   *  l'historique mensuel (evolutionChart sur dailyAccounting). */
  currentAnalysis?: AnalysisRecord | null;
};

/**
 * Renvoie true si le KPI a une valeur exploitable dans le contexte donné.
 * Un nombre fini (incluant 0 et négatifs) est considéré comme disponible.
 * null / undefined / NaN / Infinity → indisponible.
 */
export function isKpiAvailable(kpiId: string, ctx: KpiAvailabilityContext): boolean {
  // Widgets contextuels synthèse : règles dédiées par type.
  if (kpiId.startsWith("synthese:")) {
    return isSyntheseWidgetAvailable(kpiId, ctx);
  }

  // Variables brutes Bilan / CdR — la valeur vient de mappedData[field].
  if (isRawVariableId(kpiId)) {
    if (!ctx.mappedData) return false;
    const def = getRawVariableDefinition(kpiId);
    if (!def) return false;
    const value = (ctx.mappedData as unknown as Record<string, number | null | undefined>)[def.field];
    if (value === null || value === undefined) return false;
    return Number.isFinite(value);
  }

  // KPI standard : on lit la valeur calculée.
  if (!ctx.kpis) return false;
  const value = (ctx.kpis as unknown as Record<string, number | null | undefined>)[kpiId];
  if (value === null || value === undefined) return false;
  return Number.isFinite(value);
}

function isSyntheseWidgetAvailable(kpiId: string, ctx: KpiAvailabilityContext): boolean {
  const synthese = ctx.synthese ?? null;
  if (!synthese) return false;

  switch (kpiId) {
    case "synthese:score":
      return synthese.score !== null && synthese.score !== undefined;
    case "synthese:evolution":
      // Au minimum CA ou EBE non-null pour tracer une courbe.
      return ctx.kpis !== null && (ctx.kpis.ca !== null || ctx.kpis.ebe !== null);
    case "synthese:recommendation":
      return Array.isArray(synthese.actions) && synthese.actions.length > 0;
    case "synthese:alerts":
      return Array.isArray(synthese.alerts) && synthese.alerts.length > 0;
    case "synthese:actions":
      return Array.isArray(synthese.actions) && synthese.actions.length > 0;
    default:
      return true;
  }
}

/**
 * Raison textuelle quand un KPI est indisponible — affichée dans le tooltip
 * du picker. Volontairement court et factuel.
 */
export function unavailabilityReason(kpiId: string, ctx: KpiAvailabilityContext): string {
  if (!ctx.kpis && !kpiId.startsWith("synthese:")) {
    return "Aucune analyse chargée — importez ou sélectionnez une analyse.";
  }
  if (kpiId.startsWith("synthese:")) {
    if (kpiId === "synthese:recommendation" || kpiId === "synthese:actions") {
      return "Aucune action recommandée pour cette analyse.";
    }
    if (kpiId === "synthese:alerts") {
      return "Aucune alerte détectée pour cette analyse.";
    }
    if (kpiId === "synthese:score") {
      return "Score Vyzor non calculable — données insuffisantes.";
    }
  }
  return "Donnée non disponible pour cette analyse.";
}
