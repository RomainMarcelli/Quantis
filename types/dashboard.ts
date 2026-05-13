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
  | "tresorerie"
  | "personnalise";

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
  | "evolutionChart"   // chart multi-séries CA + EBE + Résultat net (Synthèse)
  // Widgets dédiés aux onglets dashboard catégorisés (Création de valeur,
  // Investissement, Financement, Rentabilité). Composants riches (chart +
  // métriques) auto-suffisants : ils prennent toute la largeur et lisent
  // les données via mappedData / kpis. L'utilisateur peut les déplacer,
  // les redimensionner, les supprimer comme n'importe quel widget.
  | "breakEvenChart"   // Création de valeur — point mort (CA / coûts fixes / coûts totaux + cards résumé)
  | "bfrCycle"         // Investissement — rotation BFR + DSO/DIO/DPO trio
  | "liquidityRatios"  // Financement — trio liquidité (générale / réduite / immédiate)
  | "roeRoceChart"     // Rentabilité — comparatif ROE vs ROCE + écart effet de levier
  // Widgets personnalisés (onglet Personnalisé du picker)
  | "customChart";     // chart libre construit par l'utilisateur — multi-séries

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
// HAUTEUR (4 paliers, mappés sur row-span avec auto-rows à 200 px) :
//   - "S"  : 1 rangée (200 px)
//   - "M"  : 2 rangées (420 px)
//   - "L"  : 3 rangées (640 px)
//   - "XL" : 4 rangées (860 px) — réservé aux charts riches (point mort,
//             chart custom multi-séries) qui méritent plus de place verticale.
//
// `WidgetSize` (4 valeurs) = type historique étendu, conservé pour l'axe
// hauteur. `WidgetWidth` (4 valeurs) = type pour l'axe largeur. Les layouts
// persistés avec `size: "S"|"M"|"L"` restent valides sans migration.
export type WidgetSize = "S" | "M" | "L" | "XL";
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
  /**
   * Position explicite dans la grille 12 colonnes — colonne de départ
   * (0-indexée, 0..11). Optionnel : si absent, le widget est placé en
   * auto-flow (compatibilité layouts pré-coordonnées). Permet à l'utilisateur
   * de POSER un widget où il veut, avec des trous éventuels.
   */
  col?: number;
  /**
   * Position explicite dans la grille — rangée de départ (0-indexée).
   * Optionnel : voir `col`.
   */
  row?: number;
  /** Si true : widget non supprimable (X masqué dans WidgetFrame).
   *  Cas d'usage : Vyzor Score sur la Synthèse — toujours visible. */
  isFixed?: boolean;
  /**
   * Configuration des widgets PERSONNALISÉS (vizType === "customChart").
   * Construite par l'utilisateur via le builder de l'onglet Personnalisé.
   * Pour les widgets standards (kpiCard, lineChart, …) ce champ est absent.
   */
  customConfig?: CustomChartConfig;
};

// ─── Configuration des widgets personnalisés ───────────────────────────
/** Type global du chart custom. "mixed" = chaque série choisit son type
 *  (line ou bar) individuellement via `series[].displayType`. */
export type CustomChartType = "lineChart" | "barChart" | "mixed";

/** Mode d'analyse du widget custom :
 *  - "series" : N KPIs superposés sur un axe temporel commun (Jan-Dec ou
 *    historique annuel). Mode par défaut.
 *  - "yearly" : 1 SEUL KPI tracé sur Jan-Dec, avec une courbe par année
 *    sélectionnée → lecture year-over-year (ex. CA 2024 vs 2025 vs 2026). */
export type CustomChartMode = "series" | "yearly";

export type CustomChartSeries = {
  /** id du KPI dans le registre (lib/kpi/kpiRegistry.ts). */
  kpiId: string;
  /** Couleur de la série (hex) — si null, palette auto. */
  color?: string;
  /**
   * Type d'affichage de cette série quand `chartType === "mixed"`.
   * Ignoré sinon (toutes les séries prennent le type global).
   */
  displayType?: "line" | "bar";
};

export type CustomChartConfig = {
  /** Titre affiché en haut du widget (libre, choisi par l'utilisateur). */
  title: string;
  /** Type de chart — courbe, barres, ou mixte (par série). */
  chartType: CustomChartType;
  /** Mode d'analyse (séries multi-KPI ou comparaison annuelle). Default : "series". */
  mode?: CustomChartMode;
  /**
   * Liste des KPIs à tracer en série superposée. Ordre = ordre des séries
   * dans la légende. Min 1, max 5 séries pour rester lisible.
   * Le multi-axes est automatique : si plusieurs unités distinctes (€, %,
   * jours, ratio…) sont mélangées, on rend deux Y-axes (gauche + droite).
   * En mode "yearly" : on lit `series[0].kpiId` uniquement, et on superpose
   * une courbe par année listée dans `years`.
   */
  series: CustomChartSeries[];
  /** Mode "yearly" uniquement : années à comparer (ex. [2024, 2025, 2026]). */
  years?: number[];
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
