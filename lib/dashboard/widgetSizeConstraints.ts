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
const HEIGHT_ORDER: Record<WidgetSize, number> = { S: 0, M: 1, L: 2, XL: 3 };

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
  actionList: { minWidth: "M" },

  // Widgets riches des onglets dashboard catégorisés. Tous nécessitent la
  // pleine largeur (L) — chart point mort, trio DSO/DIO/DPO, trio liquidité,
  // courbes ROE/ROCE — et au moins une hauteur M pour rester lisibles. Le
  // point mort débute à L mais peut grandir jusqu'à XL (4 rangées) car le
  // chart Recharts profite réellement de l'espace vertical supplémentaire.
  breakEvenChart: { minWidth: "L", minHeight: "M" },
  bfrCycle: { minWidth: "L", minHeight: "M" },
  liquidityRatios: { minWidth: "L", minHeight: "M" },
  roeRoceChart: { minWidth: "L", minHeight: "M" }
};

// Le set de hauteurs autorisées par défaut (S, M, L, XL). Les widgets non
// compatibles XL (KpiCard, listes…) sont écrémés ci-dessous via la table.
const DEFAULT_ALLOWED_HEIGHTS: WidgetSize[] = ["S", "M", "L", "XL"];

// Hauteur max raisonnable par viz. XL n'a vraiment de sens que pour les charts
// riches qui exploitent la place verticale (axes, légendes, tooltips). Pour
// les autres widgets (KpiCard, listes, agents, jauges) on plafonne à L pour
// éviter des cases vides énormes au milieu du dashboard.
const MAX_HEIGHTS: Partial<Record<WidgetVizType, WidgetSize>> = {
  kpiCard: "L",
  gauge: "L",
  comparison: "L",
  aiInsight: "L",
  alertList: "L",
  actionList: "L",
  quantisScore: "L",
};

function getMaxHeight(viz: WidgetVizType): WidgetSize {
  return MAX_HEIGHTS[viz] ?? "XL";
}

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
  const max = getMaxHeight(viz);
  if (HEIGHT_ORDER[requested] < HEIGHT_ORDER[min]) return min;
  if (HEIGHT_ORDER[requested] > HEIGHT_ORDER[max]) return max;
  return requested;
}

export function getAllowedWidths(viz: WidgetVizType): WidgetWidth[] {
  const min = getMinWidth(viz);
  return (["XS", "S", "M", "L"] as WidgetWidth[]).filter((s) => WIDTH_ORDER[s] >= WIDTH_ORDER[min]);
}

export function getAllowedHeights(viz: WidgetVizType): WidgetSize[] {
  const min = getMinHeight(viz);
  const max = getMaxHeight(viz);
  return DEFAULT_ALLOWED_HEIGHTS.filter(
    (s) => HEIGHT_ORDER[s] >= HEIGHT_ORDER[min] && HEIGHT_ORDER[s] <= HEIGHT_ORDER[max],
  );
}
