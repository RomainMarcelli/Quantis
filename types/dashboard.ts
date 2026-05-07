// File: types/dashboard.ts
// Role: schémas du système de dashboards personnalisables (Phase 1).
//
// Trois espaces visent ces types :
//   1. Synthèse — un layout 100% libre par utilisateur (id="synthese")
//   2. Tableau de bord — 4 sous-layouts contraints à leur catégorie
//      (id="dashboard:creation_valeur", "dashboard:investissement", etc.)
//   3. Custom — layouts ajoutés par l'utilisateur, id arbitraire (uuid)
//
// Persistance Firestore : `users/{uid}/dashboards/{layoutId}`.

// ─── Catégories de KPI exposées dans le picker ──────────────────────────
// Phase 2 : 5 catégories KPI registre + 1 "synthese" (widgets contextuels)
// + 2 catégories "bilan" / "compte_resultat" (variables MappedFinancialData
// brutes).
export type WidgetCategory =
  | "synthese"
  | "bilan"
  | "compte_resultat"
  | "creation_valeur"
  | "investissement"
  | "financement"
  | "rentabilite"
  | "tresorerie";

// ─── Types de visualisation ─────────────────────────────────────────────
// Phase 1 livre `kpiCard` et `lineChart` (KPIs du registre) + 4 viz dédiées
// à la Synthèse (sections cockpit). Les autres types (`barChart`, `gauge`,
// `donut`, `waterfall`, `comparison`) sont déclarés dès maintenant pour
// figer la matrice de compatibilité ; le rendu arrivera en Phase 2.
export type WidgetVizType =
  // KPIs du registre
  | "kpiCard"        // valeur unique + variation + benchmark (3 cercles)
  | "lineChart"      // évolution temporelle (Mensuel/Annuel)
  | "barChart"       // Phase 2
  | "gauge"          // Phase 2
  | "donut"          // Phase 2
  | "waterfall"      // Phase 2
  | "comparison"     // Phase 2
  // Sections "synthese" — widgets contextuels qui consomment le SyntheseViewModel
  | "quantisScore"     // gauge radiale + 4 piliers (rentabilité, solvabilité…)
  | "aiInsight"        // bandeau Recommandation stratégique (message IA + CTA)
  | "alertList"        // liste d'alertes (synthese.alerts)
  | "actionList"       // plan d'action détaillé (synthese.actions)
  | "evolutionChart";  // chart multi-séries CA + EBE + Résultat net (Synthèse)

// ─── Tailles Apple/PowerPoint-style ────────────────────────────────────
// Matrice 4×3 = 12 tailles possibles. L'utilisateur tire des poignées aux
// 8 extrémités du widget pour redimensionner.
//
// LARGEUR (4 paliers, mappés sur grille 12 col) :
//   - "XS" : col-3 (1/4 de la grille) — KPI compact
//   - "S"  : col-4 (1/3) — KpiCard standard
//   - "M"  : col-6 (1/2) — chart medium
//   - "L"  : col-12 (pleine largeur)
//
// HAUTEUR (3 paliers, mappés sur row-span avec auto-rows à 200 px) :
//   - "S" : 1 rangée (200 px)
//   - "M" : 2 rangées (420 px)
//   - "L" : 3 rangées (640 px)
//
// `WidgetSize` (3 valeurs) = type historique, conservé pour l'axe hauteur.
// `WidgetWidth` (4 valeurs) = nouveau type pour l'axe largeur. Comme
// `WidgetSize ⊂ WidgetWidth`, les layouts persistés avec `size: "S"|"M"|"L"`
// restent valides sans migration.
export type WidgetSize = "S" | "M" | "L";
export type WidgetWidth = "XS" | "S" | "M" | "L";

// ─── Instance de widget ─────────────────────────────────────────────────
export type WidgetInstance = {
  /** UUID stable — utilisé pour drag-drop reorder + delete. */
  id: string;
  /** id du KPI dans le registre central (lib/kpi/kpiRegistry.ts). */
  kpiId: string;
  vizType: WidgetVizType;
  /** Axe LARGEUR. 4 paliers (XS / S / M / L). */
  size: WidgetWidth;
  /** Axe HAUTEUR. Optionnel : défaut "S" (1 rangée). */
  height?: WidgetSize;
  /** Si true : widget non supprimable (X masqué dans WidgetFrame).
   *  Cas d'usage : Vyzor Score sur la Synthèse — toujours visible. */
  isFixed?: boolean;
};

// ─── Layout d'un dashboard ─────────────────────────────────────────────
export type DashboardLayout = {
  /** id stable du layout. "synthese" pour le cockpit principal,
   *  "dashboard:<category>" pour un sous-onglet du Tableau de bord,
   *  uuid pour un dashboard custom. */
  id: string;
  /** Nom affiché à l'utilisateur. Optionnel pour les layouts système. */
  name?: string;
  /** Pour les layouts contraints (sous-onglets dashboard) — limite le picker. */
  constrainedToCategory?: WidgetCategory;
  /** Liste ordonnée des widgets — l'ordre dicte le placement dans la grille. */
  widgets: WidgetInstance[];
  /** Timestamps Firestore. */
  createdAt?: string;
  updatedAt?: string;
};
