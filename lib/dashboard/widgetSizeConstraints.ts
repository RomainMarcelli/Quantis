// File: lib/dashboard/widgetSizeConstraints.ts
// Role: contraintes de taille minimale par type de visualisation. Les charts
// et listes ont besoin d'une largeur/hauteur plancher pour rester lisibles —
// on bloque le snap en deçà pour ne pas proposer une taille non réalisable.
//
// Matrice 4×3 : largeur ∈ {XS, S, M, L} ; hauteur ∈ {S, M, L}.
// Convention : si une viz n'apparaît pas dans le map, pas de contrainte
// (toutes les tailles sont autorisées).

import type { WidgetSize, WidgetVizType, WidgetWidth } from "@/types/dashboard";

const WIDTH_ORDER: Record<WidgetWidth, number> = { XS: 0, S: 1, M: 2, L: 3 };
const HEIGHT_ORDER: Record<WidgetSize, number> = { S: 0, M: 1, L: 2 };

type Constraint = { minWidth?: WidgetWidth; minHeight?: WidgetSize };

const CONSTRAINTS: Partial<Record<WidgetVizType, Constraint>> = {
  // KPI scalaire : valeur unique tient même en XS (col-3). Pas de contrainte.
  kpiCard: {},

  // Charts : axes lisibles à partir de M de large, hauteur M minimum.
  lineChart: { minWidth: "M", minHeight: "M" },
  barChart: { minWidth: "M", minHeight: "M" },
  donut: { minWidth: "M", minHeight: "M" },
  comparison: { minWidth: "M", minHeight: "M" },
  waterfall: { minWidth: "M", minHeight: "M" },
  evolutionChart: { minWidth: "M", minHeight: "M" },

  // Jauge bornée : besoin de hauteur pour l'arc + libellés.
  gauge: { minHeight: "M" },

  // Vyzor Score : composé jauge + 4 piliers + message d'état (~560 px
  // natif) → exige hauteur L pour ne pas écraser la mise en page.
  quantisScore: { minWidth: "M", minHeight: "L" },

  // Bandeau IA + listes : largeur M minimum (sinon le texte wrap mal).
  aiInsight: { minWidth: "M" },
  alertList: { minWidth: "M" },
  actionList: { minWidth: "M" }
};

export function getMinWidth(viz: WidgetVizType): WidgetWidth {
  return CONSTRAINTS[viz]?.minWidth ?? "XS";
}

export function getMinHeight(viz: WidgetVizType): WidgetSize {
  return CONSTRAINTS[viz]?.minHeight ?? "S";
}

export function clampWidth(viz: WidgetVizType, requested: WidgetWidth): WidgetWidth {
  const min = getMinWidth(viz);
  return WIDTH_ORDER[requested] >= WIDTH_ORDER[min] ? requested : min;
}

export function clampHeight(viz: WidgetVizType, requested: WidgetSize): WidgetSize {
  const min = getMinHeight(viz);
  return HEIGHT_ORDER[requested] >= HEIGHT_ORDER[min] ? requested : min;
}

export function getAllowedWidths(viz: WidgetVizType): WidgetWidth[] {
  const min = getMinWidth(viz);
  return (["XS", "S", "M", "L"] as WidgetWidth[]).filter((s) => WIDTH_ORDER[s] >= WIDTH_ORDER[min]);
}

export function getAllowedHeights(viz: WidgetVizType): WidgetSize[] {
  const min = getMinHeight(viz);
  return (["S", "M", "L"] as WidgetSize[]).filter((s) => HEIGHT_ORDER[s] >= HEIGHT_ORDER[min]);
}
