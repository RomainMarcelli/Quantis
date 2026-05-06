// File: lib/dashboard/tabs/valueCreationData.ts
// Role: prépare les jeux de données des graphiques de la section Création de valeur.

import type { MappedFinancialData } from "@/types/analysis";

export const VALUE_CREATION_MONTHS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc"
] as const;

export type ValueCreationMonthlyPoint = {
  month: (typeof VALUE_CREATION_MONTHS)[number];
  revenue: number;
  ebe: number;
  netResult: number;
};

// Index x-axis du dernier point du graphique point mort. Anciennement 12.6
// avec un point dédié "Clôture" au-delà du mois 12 ; demande produit : la
// courbe doit s'arrêter franchement au mois 12 sans label "Clôture" surnuméraire.
export const BREAK_EVEN_CLOSURE_INDEX = 12;

export type BreakEvenPoint = {
  month: string;
  monthIndex: number;
  ca: number;
  fixedCosts: number;
  totalCosts: number;
};

export type BreakEvenMetrics = {
  ca: number | null;
  chargesFixes: number | null;
  chargesVariables: number | null;
  mscv: number | null;
  tmscv: number | null;
  pointMort: number | null;
  pointMortDateDays: number | null;
  pointMortDateMonths: number | null;
};

export type BreakEvenIntersection = {
  monthIndex: number;
  value: number;
  dayIndex: number;
  withinFiscalYear: boolean;
};

export type BreakEvenSimulation = {
  adjustedFixedCosts: number;
  pointMort: number;
  pointMortDateDays: number;
  daysGained: number | null;
};

export type BreakEvenModel = {
  points: BreakEvenPoint[];
  metrics: BreakEvenMetrics;
  intersection: BreakEvenIntersection | null;
  simulation: BreakEvenSimulation | null;
  hasUsableData: boolean;
  closesAboveBreakEven: boolean | null;
  closureIndex: number;
  xTicks: number[];
};

export type TmscvPieSlice = {
  name: string;
  value: number;
  actualValue: number;
  color: string;
};

// Construit une série mensuelle à partir des KPI annuels.
// Le but est UX: rendre la tendance lisible même si la donnée source est agrégée.
export function buildMonthlyRevenueSeries(params: {
  ca: number | null;
  tcam: number | null;
  ebe: number | null;
  resultatNet: number | null;
}): ValueCreationMonthlyPoint[] {
  const annualRevenue = sanitizePositive(params.ca);
  const growthRatio = normalizePercentRatio(params.tcam);
  const monthlyGrowth = growthRatio / 12;
  const revenueStart =
    annualRevenue > 0 ? annualRevenue / Math.max(1 + monthlyGrowth * (VALUE_CREATION_MONTHS.length - 1), 0.1) : 0;

  const ebeMargin =
    annualRevenue > 0 && params.ebe !== null ? clamp(params.ebe / annualRevenue, -1, 1) : 0.15;
  const netMargin =
    annualRevenue > 0 && params.resultatNet !== null ? clamp(params.resultatNet / annualRevenue, -1, 1) : 0.08;

  return VALUE_CREATION_MONTHS.map((month, index) => {
    const revenue = Math.max(0, revenueStart * (1 + monthlyGrowth * index));
    return {
      month,
      revenue,
      ebe: revenue * ebeMargin,
      netResult: revenue * netMargin
    };
  });
}

// Données pie chart TMSCV:
// - TMSCV positif: marge + décomposition des coûts variables.
// - TMSCV négatif: déficit de marge + répartition de la pression coûts.
// Les "value" pilotent la géométrie du donut, "actualValue" garde la valeur métier exacte.
export function buildTmscvPieData(tmscv: number | null): TmscvPieSlice[] {
  const ratio = normalizePercentRatio(tmscv);
  const percent = clamp(Math.abs(ratio) * 100, 0, 100);

  if (ratio >= 0) {
    const margeReelle = clamp(ratio * 100, 0, 100);
    const margeVisuelle = margeReelle > 0 && margeReelle < 7 ? 7 : margeReelle;
    const coutsVisuels = Math.max(0, 100 - margeVisuelle);
    const coutsOptimisablesVisuels = coutsVisuels * 0.45;
    const coutsIncompressiblesVisuels = coutsVisuels - coutsOptimisablesVisuels;
    const coutsOptimisablesReels = (100 - margeReelle) * 0.45;
    const coutsIncompressiblesReels = (100 - margeReelle) - coutsOptimisablesReels;

    return [
      {
        name: "Marge sur coûts variables",
        value: margeVisuelle,
        actualValue: margeReelle,
        color: "#d4af37"
      },
      {
        name: "Coûts variables optimisables",
        value: coutsOptimisablesVisuels,
        actualValue: Math.max(0, coutsOptimisablesReels),
        color: "#60a5fa"
      },
      {
        name: "Coûts variables incompressibles",
        value: coutsIncompressiblesVisuels,
        actualValue: Math.max(0, coutsIncompressiblesReels),
        color: "#a78bfa"
      }
    ];
  }

  const deficitReel = percent;
  const deficitVisuel = deficitReel > 0 && deficitReel < 7 ? 7 : Math.min(deficitReel, 70);
  const couvertureVisuelle = Math.max(0, 100 - deficitVisuel);
  const couvertureStructurelleVisuelle = couvertureVisuelle * 0.6;
  const couvertureOptimisableVisuelle = couvertureVisuelle - couvertureStructurelleVisuelle;
  const couvertureReelle = Math.max(0, 100 - deficitReel);

  return [
    {
      name: "Déficit de marge",
      value: deficitVisuel,
      actualValue: deficitReel,
      color: "#f87171"
    },
    {
      name: "Coûts variables couverts",
      value: couvertureStructurelleVisuelle,
      actualValue: couvertureReelle * 0.6,
      color: "#38bdf8"
    },
    {
      name: "Pression sur coûts variables",
      value: couvertureOptimisableVisuelle,
      actualValue: couvertureReelle * 0.4,
      color: "#c084fc"
    }
  ];
}

// Calcule les grandeurs métier du point mort à partir du mapping 2033SD demandé.
export function computeBreakEvenMetrics(
  input: Pick<
    MappedFinancialData,
    | "ventes_march"
    | "prod_vendue"
    | "ace"
    | "salaires"
    | "charges_soc"
    | "dap"
    | "achats_march"
    | "achats_mp"
    | "var_stock_march"
    | "var_stock_mp"
  >
): BreakEvenMetrics {
  const ca = sumAvailable(input.ventes_march, input.prod_vendue);
  const chargesFixes = sumAvailable(input.ace, input.salaires, input.charges_soc, input.dap);
  const chargesVariables = sumAvailable(
    input.achats_march,
    input.achats_mp,
    input.var_stock_march,
    input.var_stock_mp
  );
  const mscv = subtract(ca, chargesVariables);
  const tmscv = divide(mscv, ca);
  const pointMort = computeBreakEvenVolume(chargesFixes, tmscv);
  const pointMortDateDays = computeBreakEvenTiming(pointMort, ca, 365);
  const pointMortDateMonths = computeBreakEvenTiming(pointMort, ca, 12);

  return {
    ca,
    chargesFixes,
    chargesVariables,
    mscv,
    tmscv,
    pointMort,
    pointMortDateDays,
    pointMortDateMonths
  };
}

// Génère les points mensuels demandés par le cahier des charges: 12 mois + clôture.
export function buildBreakEvenChartPoints(metrics: BreakEvenMetrics): BreakEvenPoint[] {
  const annualRevenue = metrics.ca ?? 0;
  const chargesFixes = metrics.chargesFixes ?? 0;
  const chargesVariables = metrics.chargesVariables ?? 0;

  const monthlyRevenue = annualRevenue / 12;
  const monthlyVariableCosts = chargesVariables / 12;

  // Suppression du point "Clôture" surnuméraire (anciennement à monthIndex
  // 12.6) — la courbe s'arrête au mois 12 et le dernier point reflète la
  // valeur annuelle. annualRevenue est utilisé pour caler la valeur du dernier
  // mois sur le total de l'exercice.
  const points = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const isLastMonth = month === 12;
    return {
      month: `Mois ${month}`,
      monthIndex: month,
      ca: isLastMonth ? annualRevenue : monthlyRevenue * month,
      fixedCosts: chargesFixes,
      totalCosts: isLastMonth
        ? chargesFixes + chargesVariables
        : chargesFixes + monthlyVariableCosts * month
    };
  });

  return points;
}

export function buildBreakEvenModel(
  input: Pick<
    MappedFinancialData,
    | "ventes_march"
    | "prod_vendue"
    | "ace"
    | "salaires"
    | "charges_soc"
    | "dap"
    | "achats_march"
    | "achats_mp"
    | "var_stock_march"
    | "var_stock_mp"
  >
): BreakEvenModel {
  const metrics = computeBreakEvenMetrics(input);
  const points = buildBreakEvenChartPoints(metrics);
  const hasUsableData = [metrics.ca, metrics.chargesFixes, metrics.chargesVariables].some(
    (value) => value !== null
  );
  const closesAboveBreakEven =
    metrics.ca === null || metrics.chargesFixes === null || metrics.chargesVariables === null
      ? null
      : metrics.ca > metrics.chargesFixes + metrics.chargesVariables;

  const intersection =
    metrics.pointMort === null ||
    metrics.pointMortDateDays === null ||
    metrics.pointMortDateMonths === null
      ? null
      : {
          monthIndex: metrics.pointMortDateMonths,
          value: metrics.pointMort,
          dayIndex: metrics.pointMortDateDays,
          withinFiscalYear: metrics.pointMortDateDays <= 365
        };

  const simulation = buildBreakEvenSimulation(metrics);

  return {
    points,
    metrics,
    intersection,
    simulation,
    hasUsableData,
    closesAboveBreakEven,
    closureIndex: BREAK_EVEN_CLOSURE_INDEX,
    xTicks: Array.from({ length: 12 }, (_, index) => index + 1)
  };
}

function sanitizePositive(value: number | null): number {
  if (value === null || Number.isNaN(value) || value <= 0) {
    return 0;
  }
  return value;
}

function normalizePercentRatio(value: number | null): number {
  if (value === null || Number.isNaN(value)) {
    return 0;
  }
  if (Math.abs(value) <= 1) {
    return value;
  }
  return value / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sumAvailable(...values: Array<number | null>): number | null {
  const presentValues = values.filter((value): value is number => value !== null && !Number.isNaN(value));
  if (!presentValues.length) {
    return null;
  }
  return presentValues.reduce((acc, value) => acc + value, 0);
}

function subtract(left: number | null, right: number | null): number | null {
  if (left === null || right === null) {
    return null;
  }
  return left - right;
}

function divide(left: number | null, right: number | null): number | null {
  if (left === null || right === null || right === 0) {
    return null;
  }
  return left / right;
}

function computeBreakEvenVolume(chargesFixes: number | null, tmscv: number | null): number | null {
  if (chargesFixes === null || tmscv === null || tmscv <= 0) {
    return null;
  }
  return chargesFixes / tmscv;
}

function computeBreakEvenTiming(
  pointMort: number | null,
  annualRevenue: number | null,
  periodUnits: number
): number | null {
  if (pointMort === null || annualRevenue === null || annualRevenue <= 0) {
    return null;
  }

  return pointMort / (annualRevenue / periodUnits);
}

function buildBreakEvenSimulation(metrics: BreakEvenMetrics): BreakEvenSimulation | null {
  if (
    metrics.ca === null ||
    metrics.ca <= 0 ||
    metrics.chargesFixes === null ||
    metrics.tmscv === null ||
    metrics.tmscv <= 0
  ) {
    return null;
  }

  const adjustedFixedCosts = metrics.chargesFixes * 0.97;
  const pointMort = adjustedFixedCosts / metrics.tmscv;
  const pointMortDateDays = pointMort / (metrics.ca / 365);

  return {
    adjustedFixedCosts,
    pointMort,
    pointMortDateDays,
    daysGained:
      metrics.pointMortDateDays === null ? null : Math.max(metrics.pointMortDateDays - pointMortDateDays, 0)
  };
}
