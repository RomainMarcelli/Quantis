// File: lib/dashboard/defaultDashboardLayouts.ts
// Role: source unique des layouts par défaut des onglets du Tableau de bord
// (création de valeur, investissement, financement, rentabilité). Référencés
// à la fois par les composants UI et par l'API d'export PDF — sinon l'API
// reçoit `null` quand Firestore n'a rien (utilisateur n'ayant pas customisé)
// et le rapport sort vide alors que l'écran montre les défauts.

import type { DashboardLayout, WidgetInstance } from "@/types/dashboard";

// Chart widgets dédiés à chaque onglet — placés en bas du layout par défaut.
// Pleine largeur (L) + hauteur L (point mort) ou M (les autres) pour rester
// lisibles. `kpiId` arbitraire pour les types non-KPI : on met une string
// non-vide pour passer le check `isKpiAvailable` qui n'évalue rien quand le
// vizType n'est pas un kpiCard / lineChart standard.

const VALUE_CREATION_DEFAULT: DashboardLayout = {
  id: "dashboard:creation_valeur",
  constrainedToCategory: "creation_valeur",
  widgets: [
    { id: "vc-ca", kpiId: "ca", vizType: "kpiCard", size: "S" },
    { id: "vc-tcam", kpiId: "tcam", vizType: "kpiCard", size: "S" },
    { id: "vc-ebe", kpiId: "ebe", vizType: "kpiCard", size: "S" },
    { id: "vc-va", kpiId: "va", vizType: "kpiCard", size: "S" },
    { id: "vc-marge-ebitda", kpiId: "marge_ebitda", vizType: "kpiCard", size: "S" },
    { id: "vc-point-mort", kpiId: "point_mort", vizType: "kpiCard", size: "S" },
    { id: "vc-break-even", kpiId: "point_mort", vizType: "breakEvenChart", size: "L", height: "L" },
  ] as WidgetInstance[],
};

const INVESTMENT_DEFAULT: DashboardLayout = {
  id: "dashboard:investissement",
  constrainedToCategory: "investissement",
  widgets: [
    { id: "inv-bfr", kpiId: "bfr", vizType: "kpiCard", size: "M" },
    { id: "inv-ratio-immo", kpiId: "ratio_immo", vizType: "kpiCard", size: "M" },
    { id: "inv-bfr-cycle", kpiId: "rot_bfr", vizType: "bfrCycle", size: "L", height: "M" },
  ] as WidgetInstance[],
};

const FINANCING_DEFAULT: DashboardLayout = {
  id: "dashboard:financement",
  constrainedToCategory: "financement",
  widgets: [
    { id: "fin-cap-remb", kpiId: "capacite_remboursement_annees", vizType: "kpiCard", size: "S" },
    { id: "fin-caf", kpiId: "caf", vizType: "kpiCard", size: "S" },
    { id: "fin-fte", kpiId: "fte", vizType: "kpiCard", size: "S" },
    { id: "fin-solva", kpiId: "solvabilite", vizType: "kpiCard", size: "S" },
    { id: "fin-gearing", kpiId: "gearing", vizType: "kpiCard", size: "S" },
    { id: "fin-tn", kpiId: "tn", vizType: "kpiCard", size: "S" },
    { id: "fin-liquidity", kpiId: "liq_gen", vizType: "liquidityRatios", size: "L", height: "M" },
  ] as WidgetInstance[],
};

const RENTABILITY_DEFAULT: DashboardLayout = {
  id: "dashboard:rentabilite",
  constrainedToCategory: "rentabilite",
  widgets: [
    { id: "rent-roe", kpiId: "roe", vizType: "kpiCard", size: "M" },
    { id: "rent-roce", kpiId: "roce", vizType: "kpiCard", size: "M" },
    { id: "rent-roe-roce-chart", kpiId: "roe", vizType: "roeRoceChart", size: "L", height: "M" },
  ] as WidgetInstance[],
};

/**
 * Mapping des layouts par défaut indexés par layoutId (= activeTab id côté
 * navigation). Les clefs DOIVENT correspondre aux ids passés au prop
 * `layoutId` du `CustomizableDashboard` — c'est cette clef qui sert de
 * doc-id dans Firestore (`users/{uid}/dashboards/{layoutId}`).
 */
export const DEFAULT_DASHBOARD_LAYOUTS: Record<string, DashboardLayout> = {
  "creation-valeur": VALUE_CREATION_DEFAULT,
  "investissement-bfr": INVESTMENT_DEFAULT,
  financement: FINANCING_DEFAULT,
  rentabilite: RENTABILITY_DEFAULT,
};

export function getDefaultDashboardLayout(layoutId: string): DashboardLayout | null {
  return DEFAULT_DASHBOARD_LAYOUTS[layoutId] ?? null;
}
