// File: lib/simulation/simulationEngine.ts
// Role: moteur de simulation "What-If" qui prend un MappedFinancialData courant,
// applique des deltas sur des leviers (variables 2033-SD), et recalcule les KPIs
// affectés via le pipeline existant (`computeKpis`).
//
// Principe : zéro nouvelle formule. On réutilise strictement la même fonction
// `computeKpis` que la production — la simulation est juste "computeKpis sur
// un mappedData modifié". Garantit qu'un What-If reflète la même logique que
// les chiffres affichés sur le dashboard.
//
// Limite connue : `kpiEngine.computeKpis` lit `resultat_net` directement depuis
// `mappedData.res_net` (donnée stockée, non recalculée). Donc bouger les
// salaires ou les ventes ne fera PAS bouger `resultat_net` ni le `healthScore`
// qui en dépend. Les scénarios listent volontairement uniquement les KPIs que
// la simulation peut faire évoluer aujourd'hui — on n'inclut pas `resultat_net`
// dans les `affectedKpis` tant qu'on n'a pas ajouté un cascade explicite vers
// `res_net` (à faire en MT, demande d'arbitrer entre approximation et fidélité).

import { computeKpis } from "@/services/kpiEngine";
import type { CalculatedKpis, MappedFinancialData } from "@/types/analysis";

export type SimulationLeverType = "percent" | "absolute";

export type SimulationLever = {
  /** Code de la variable mappedData impactée (ex. "salaires", "ventes_march"). */
  variableCode: keyof MappedFinancialData;
  /** Libellé affiché dans l'UI (ex. "Masse salariale"). */
  label: string;
  /**
   * Type de delta appliqué :
   *  - "percent" : delta en % (ex. +20 = +20%)
   *  - "absolute" : delta en € (ex. +45000 = +45 000 €)
   */
  type: SimulationLeverType;
  /** Valeur min du curseur. */
  min: number;
  /** Valeur max du curseur. */
  max: number;
  /** Pas du curseur. */
  step: number;
  /** Valeur de delta par défaut au chargement du scénario. */
  defaultDelta: number;
  /**
   * Levier "caché" : le moteur applique le delta mais l'UI ne montre pas de
   * slider. Sert à propager une variation sur les agrégats (ex. total_prod_expl)
   * en même temps que les variables racine (ventes_march, prod_vendue) — sans
   * polluer l'UI avec des champs techniques que le dirigeant n'a pas à voir.
   */
  hidden?: boolean;
};

export type SimulationScenario = {
  id: string;
  label: string;
  /** Description courte du cas d'usage métier. */
  description: string;
  /** Leviers utilisateur. */
  levers: SimulationLever[];
  /**
   * KPIs explicitement mis en avant comme "résultats du scénario".
   * Le moteur recalcule TOUS les KPIs (computeKpis est exhaustif), cette liste
   * sert juste à indiquer à l'UI lesquels mettre en évidence dans le widget.
   */
  affectedKpis: Array<keyof CalculatedKpis>;
};

export type SimulationResult = {
  /** mappedData après application des deltas — utile pour debug. */
  simulatedMappedData: MappedFinancialData;
  /** KPIs recalculés. */
  simulatedKpis: CalculatedKpis;
  /** KPIs avant simulation (= computeKpis sur le mappedData original). */
  baselineKpis: CalculatedKpis;
  /** Variations en € ou % par KPI affecté (uniquement les KPIs déclarés dans le scénario). */
  diffs: Array<{
    kpi: keyof CalculatedKpis;
    before: number | null;
    after: number | null;
    deltaAbsolute: number | null;
    deltaPercent: number | null;
  }>;
};

/**
 * Applique des deltas (par variableCode) sur un mappedData et retourne la
 * nouvelle structure. Pure function — ne mute pas l'input.
 *
 * Si une variable était `null` (donnée absente), un delta absolute est appliqué
 * comme s'il valait 0 ; un delta percent ne fait rien (impossible de calculer
 * un % sur null).
 */
export function applyLeverDeltas(
  base: MappedFinancialData,
  deltas: Record<string, { type: SimulationLeverType; value: number }>
): MappedFinancialData {
  const out = { ...base } as Record<string, number | null>;

  for (const [code, delta] of Object.entries(deltas)) {
    const current = out[code];
    if (delta.type === "absolute") {
      const baseline = current ?? 0;
      out[code] = baseline + delta.value;
    } else {
      // percent : impossible sur null (pas de baseline pour appliquer le ratio).
      if (current === null || current === undefined) continue;
      out[code] = current * (1 + delta.value / 100);
    }
  }

  return out as MappedFinancialData;
}

/**
 * Lance un scénario : applique les deltas, recalcule les KPIs, retourne avant/après
 * + deltas sur les KPIs déclarés affectés par le scénario.
 */
export function runSimulation(
  scenario: SimulationScenario,
  base: MappedFinancialData,
  leverDeltas: Record<string, number>
): SimulationResult {
  const deltas: Record<string, { type: SimulationLeverType; value: number }> = {};
  for (const lever of scenario.levers) {
    const value = leverDeltas[lever.variableCode] ?? lever.defaultDelta;
    deltas[lever.variableCode] = { type: lever.type, value };
  }

  const simulatedMappedData = applyLeverDeltas(base, deltas);
  const baselineKpis = computeKpis(base);
  const simulatedKpis = computeKpis(simulatedMappedData);

  const diffs = scenario.affectedKpis.map((kpi) => {
    const before = baselineKpis[kpi] as number | null;
    const after = simulatedKpis[kpi] as number | null;
    const deltaAbsolute = before !== null && after !== null ? after - before : null;
    const deltaPercent =
      before !== null && before !== 0 && after !== null
        ? ((after - before) / Math.abs(before)) * 100
        : null;
    return { kpi, before, after, deltaAbsolute, deltaPercent };
  });

  return { simulatedMappedData, simulatedKpis, baselineKpis, diffs };
}

// ─────────────────────────────────────────────────────────────────────────
// Catalogue de 5 scénarios par défaut
// ─────────────────────────────────────────────────────────────────────────
//
// Volontairement minimaliste — chaque scénario expose 1 à 3 leviers que le
// dirigeant peut comprendre sans formation. Plus on multiplie les leviers,
// plus l'UI devient un tableur. On reste dans l'esprit "What-If exploratoire".

export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    id: "embauche",
    label: "Impact d'une embauche",
    description:
      "Recruter un salarié supplémentaire — voir comment la masse salariale et les charges sociales pèsent sur la rentabilité et la trésorerie.",
    levers: [
      {
        variableCode: "salaires",
        label: "Salaires bruts annuels supplémentaires",
        type: "absolute",
        min: 25_000,
        max: 150_000,
        step: 5_000,
        defaultDelta: 45_000,
      },
      {
        variableCode: "charges_soc",
        label: "Charges sociales associées",
        type: "absolute",
        min: 10_000,
        max: 70_000,
        step: 1_000,
        defaultDelta: 22_000,
      },
    ],
    affectedKpis: ["ebitda", "ebe", "marge_ebitda", "charges_fixes", "point_mort"],
  },

  {
    id: "hausse_prix",
    label: "Hausse des prix de vente",
    description:
      "Augmenter les prix de manière uniforme — quantifier l'effet sur la marge et la sensibilité du volume.",
    levers: [
      {
        variableCode: "ventes_march",
        label: "Ventes de marchandises",
        type: "percent",
        min: 0,
        max: 30,
        step: 1,
        defaultDelta: 5,
      },
      {
        variableCode: "prod_vendue",
        label: "Production vendue",
        type: "percent",
        min: 0,
        max: 30,
        step: 1,
        defaultDelta: 5,
      },
      {
        // Cascade : le pré-aggregat total_prod_expl est la source de la VA
        // (kpiEngine fallback). On le bump du même % pour que l'EBITDA suive.
        variableCode: "total_prod_expl",
        label: "Total production (cascade)",
        type: "percent",
        min: 0,
        max: 30,
        step: 1,
        defaultDelta: 5,
        hidden: true,
      },
    ],
    affectedKpis: ["ca", "va", "ebitda", "marge_ebitda", "mscv", "tmscv"],
  },

  {
    id: "reduction_charges",
    label: "Réduction des charges externes",
    description:
      "Renégocier loyers, énergie, sous-traitance — voir le retour direct sur l'EBITDA et le point mort.",
    levers: [
      {
        variableCode: "ace",
        label: "Autres charges externes",
        type: "percent",
        min: -30,
        max: 0,
        step: 1,
        defaultDelta: -10,
      },
    ],
    affectedKpis: ["va", "ebitda", "marge_ebitda", "charges_fixes", "point_mort"],
  },

  {
    id: "nouvel_emprunt",
    label: "Souscription d'un nouvel emprunt",
    description:
      "Injecter du cash via un emprunt bancaire — visualiser l'impact sur la trésorerie nette, le gearing et la solvabilité.",
    levers: [
      {
        variableCode: "emprunts",
        label: "Capital emprunté supplémentaire",
        type: "absolute",
        min: 50_000,
        max: 1_000_000,
        step: 25_000,
        defaultDelta: 200_000,
      },
      {
        variableCode: "dispo",
        label: "Cash injecté en banque",
        type: "absolute",
        min: 50_000,
        max: 1_000_000,
        step: 25_000,
        defaultDelta: 200_000,
      },
    ],
    affectedKpis: ["tn", "gearing", "solvabilite", "capacite_remboursement_annees", "liq_imm"],
  },

  {
    id: "perte_client",
    label: "Perte d'un client majeur",
    description:
      "Simuler la disparition d'un gros client — combien de CA perdu et quel impact sur la rentabilité et le BFR.",
    levers: [
      {
        variableCode: "prod_vendue",
        label: "Baisse du CA",
        type: "percent",
        min: -50,
        max: 0,
        step: 1,
        defaultDelta: -20,
      },
      {
        variableCode: "clients",
        label: "Baisse du poste clients (créances)",
        type: "percent",
        min: -50,
        max: 0,
        step: 1,
        defaultDelta: -20,
      },
      {
        // Cascade total_prod_expl pour propager à VA/EBITDA, et creances pour
        // garder la cohérence du BFR avec la baisse du poste clients.
        variableCode: "total_prod_expl",
        label: "Total production (cascade)",
        type: "percent",
        min: -50,
        max: 0,
        step: 1,
        defaultDelta: -20,
        hidden: true,
      },
      {
        variableCode: "creances",
        label: "Créances totales (cascade)",
        type: "percent",
        min: -50,
        max: 0,
        step: 1,
        defaultDelta: -20,
        hidden: true,
      },
    ],
    affectedKpis: ["ca", "va", "ebitda", "marge_ebitda", "bfr", "dso"],
  },
];

/**
 * Helper de lecture : retourne le scénario par id ou null.
 */
export function getSimulationScenario(id: string): SimulationScenario | null {
  return SIMULATION_SCENARIOS.find((s) => s.id === id) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Bornes dynamiques des sliders
// ─────────────────────────────────────────────────────────────────────────
//
// Les `min/max/step` statiques d'un `SimulationLever` ne sont qu'une valeur
// par défaut. En production, on veut que les bornes s'ajustent à l'échelle
// réelle de l'entreprise — un slider "Salaires ±150 k€" n'a aucun sens si
// la masse salariale réelle est de 192 k€ (le scénario ne représente plus
// rien) ou de 8 k€ (le slider couvre 20× la valeur, illisible).
//
// Règle :
//   - Levier `absolute` : bornes = ±50 % de la valeur de base réelle
//     (mappedData[variableCode]). Step = 0,05 % de la base × 100, plancher 100.
//   - Levier `percent`  : bornes statiques (un % reste un % indépendamment
//     de l'échelle de l'entreprise).

export type LeverBounds = { min: number; max: number; step: number };

export function computeDynamicLeverBounds(
  lever: SimulationLever,
  baseValue: number | null | undefined
): LeverBounds {
  if (lever.type === "percent") {
    // Pas de dynamique sur les % — la grandeur du slider est intrinsèque.
    return { min: lever.min, max: lever.max, step: lever.step };
  }

  // `absolute` : on a besoin de la valeur de base réelle. À défaut on retombe
  // sur les bornes statiques pour ne pas casser la simulation.
  if (baseValue === null || baseValue === undefined || !Number.isFinite(baseValue) || baseValue === 0) {
    return { min: lever.min, max: lever.max, step: lever.step };
  }

  const magnitude = Math.abs(baseValue);
  const range = Math.round(magnitude * 0.5);
  // Step = 0,05 % × magnitude, arrondi au 100 le plus proche, plancher 100.
  const rawStep = Math.round((magnitude * 0.05) / 100) * 100;
  const step = Math.max(100, rawStep);

  return {
    min: -range,
    max: range,
    step,
  };
}

/**
 * Clamp un delta dans les bornes dynamiques. Utile quand on re-calcule les
 * bornes pendant qu'un slider est actif et que sa valeur courante sortirait
 * de la nouvelle fenêtre.
 */
export function clampLeverDelta(value: number, bounds: LeverBounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, value));
}
