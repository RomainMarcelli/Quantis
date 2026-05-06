// File: lib/kpi/widgetCompatibility.ts
// Role: matrice KPI ↔ types de visualisation autorisés. Garantit la cohérence
// du picker : un Score (0-100) peut être rendu en KpiCard ou Gauge mais pas
// en Donut. Une marge en % peut être en KpiCard ou LineChart mais pas en
// Waterfall. Une décomposition (BFR = stocks + créances - fournisseurs) peut
// être en BarChart ou Donut mais le ratio ROCE non.
//
// La matrice s'appuie sur l'`unit` du KpiDefinition + des règles métier
// par id pour les cas où l'unit ne suffit pas (ex. BFR euro mais waterfall OK
// car décomposable, alors que CA euro non décomposable → pas waterfall).
//
// Phase 1 : seuls "kpiCard" et "lineChart" sont implémentés côté rendu.
// Le reste de la matrice est figé maintenant pour ne pas avoir à réviser
// le mapping quand on ajoutera les viz Phase 2.

import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import {
  getSyntheseWidgetDefinition,
  isSyntheseWidgetId
} from "@/lib/dashboard/syntheseWidgetCatalog";
import { isRawVariableId } from "@/lib/dashboard/rawVariableCatalog";
import type { WidgetVizType } from "@/types/dashboard";

// ─── Types de viz disponibles ──────────────────────────────────────────
// Phase 2 : tous les types sont implémentés.
// Pour les KPIs registre : kpiCard + lineChart + barChart + gauge + donut +
// waterfall + comparison (selon compatibilité du KPI).
// Pour les widgets Synthèse : leur viz dédiée (aiInsight / alertList /
// actionList / evolutionChart / quantisScore) — chacune n'autorise qu'un
// seul type, c'est volontaire.
export const PHASE_1_VIZ_TYPES: WidgetVizType[] = [
  "kpiCard",
  "lineChart",
  "barChart",
  "gauge",
  "donut",
  "waterfall",
  "comparison",
  "quantisScore",
  "aiInsight",
  "alertList",
  "actionList",
  "evolutionChart"
];

// KPIs intrinsèquement temporels (= ont un sens à être tracés sur la durée).
// Pour ces KPIs on autorise lineChart en plus de kpiCard.
const TEMPORAL_KPI_IDS = new Set([
  "ca", "va", "ebitda", "ebe", "marge_ebitda", "mscv", "tmscv",
  "resultat_net", "netProfit", "tcam",
  "bfr", "rot_bfr", "dso", "dpo", "rot_stocks",
  "caf", "fte", "tn", "disponibilites", "monthlyBurnRate", "cashRunwayMonths",
  "solvabilite", "gearing", "liq_gen", "liq_red", "liq_imm",
  "roce", "roe", "effet_levier", "capacite_remboursement_annees",
  "ratio_immo", "ratio_masse_salariale", "grossMarginRate",
  "tva_a_payer", "provision_is"
]);

// KPIs décomposables (somme de sous-postes) → autorisent BarChart + Waterfall + Donut.
// Phase 1 : info figée pour préparer Phase 2 ; pas utilisée pour le rendu actuel.
const DECOMPOSABLE_KPI_IDS = new Set([
  "bfr",          // = stocks + créances - fournisseurs - dettes_fisc_soc
  "ebitda",       // = VA - charges personnel
  "va",           // = total_prod - achats_match - achats_mp - ace
  "caf",          // = résultat_net + DAP
  "charges_var",
  "charges_fixes"
]);

// KPIs bornés (ratios, scores, %) qui ont du sens en jauge.
// Phase 1 : info figée pour Phase 2.
const GAUGE_FRIENDLY_KPI_IDS = new Set([
  "healthScore", "marge_ebitda", "tmscv", "grossMarginRate", "ratio_immo",
  "etat_materiel_indice", "solvabilite", "liq_gen", "liq_red", "liq_imm",
  "marge_nette", "roe", "roce", "ratio_masse_salariale"
]);

// Détermine si un KPI peut être benchmarké contre un panel sectoriel.
// Réutilise la même logique que le picker Vyzor — KPIs avec un mapping dans
// kpiMapping.ts. Phase 1 : info figée pour Phase 2.
import { KPI_BENCHMARK_MAPPING, type BenchmarkableKpiKey } from "@/lib/benchmark/kpiMapping";

function canBenchmark(kpiId: string): boolean {
  return Boolean(KPI_BENCHMARK_MAPPING[kpiId as BenchmarkableKpiKey]);
}

// ─── API publique ──────────────────────────────────────────────────────

// Retourne la liste des viz autorisées pour un KPI donné. La 1re entrée
// est la viz par défaut quand l'utilisateur ajoute un widget sans préciser.
export function getAllowedVizTypes(kpiId: string): WidgetVizType[] {
  // Cas spécial : les widgets Synthèse imposent leur viz unique (aiInsight,
  // alertList, actionList). Pas de KpiCard fallback — ces blocs n'ont pas
  // de "valeur" numérique à afficher.
  if (isSyntheseWidgetId(kpiId)) {
    const syntheseDef = getSyntheseWidgetDefinition(kpiId);
    return syntheseDef ? [syntheseDef.vizType] : [];
  }

  // Variables brutes (Bilan / CDR) : uniquement kpiCard. Pas de seuil ni
  // d'historique chargé pour ces variables individuellement.
  if (isRawVariableId(kpiId)) {
    return ["kpiCard"];
  }

  const def = getKpiDefinition(kpiId);
  if (!def) return ["kpiCard"]; // fallback safe — toute carte sait afficher une valeur

  const allowed: WidgetVizType[] = ["kpiCard"];

  if (TEMPORAL_KPI_IDS.has(kpiId)) {
    allowed.push("lineChart");
  }

  if (DECOMPOSABLE_KPI_IDS.has(kpiId)) {
    allowed.push("barChart");
    allowed.push("waterfall");
    allowed.push("donut");
  }

  if (GAUGE_FRIENDLY_KPI_IDS.has(kpiId)) {
    allowed.push("gauge");
  }

  if (canBenchmark(kpiId)) {
    allowed.push("comparison");
  }

  return allowed;
}

// Filtre un set de viz par celles qui sont **rendables** en Phase 1.
// Le picker présente la matrice complète (matrix figée) mais limite la
// sélection aux viz effectivement rendues.
export function filterPhase1VizTypes(types: WidgetVizType[]): WidgetVizType[] {
  return types.filter((t) => PHASE_1_VIZ_TYPES.includes(t));
}

// Détermine la viz par défaut pour un KPI — la 1re viz autorisée qui est
// rendable Phase 1.
export function getDefaultVizType(kpiId: string): WidgetVizType {
  const allowed = filterPhase1VizTypes(getAllowedVizTypes(kpiId));
  return allowed[0] ?? "kpiCard";
}
