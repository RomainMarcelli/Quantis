// File: lib/dashboard/tabs/valueCreationData.ts
// Role: prépare les jeux de données des graphiques de la section Création de valeur.

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

export type BreakEvenPoint = {
  volume: number;
  ca: number;
  couts: number;
  marge: number;
};

export type BreakEvenModel = {
  points: BreakEvenPoint[];
  pointMortVolume: number;
  pointMortValeur: number;
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

// Modèle du point mort (break-even) avec 3 courbes:
// - CA (bleu)
// - Coûts (rouge)
// - Marge (orange)
export function buildBreakEvenModel(params: {
  ca: number | null;
  chargesFixes: number | null;
  chargesVariables: number | null;
  pointMort: number | null;
}): BreakEvenModel {
  const annualRevenue = sanitizePositive(params.ca);
  const chargesFixes = sanitizePositive(params.chargesFixes);

  const variableRateFromKpi =
    params.chargesVariables === null ? null : clamp(normalizePercentRatio(params.chargesVariables), 0.05, 0.95);

  const defaultVolume = annualRevenue > 0 ? annualRevenue * 1.2 : 100000;
  const pointMortVolume = sanitizePositive(params.pointMort) || defaultVolume * 0.55;

  // Si point mort connu, on force un taux variable qui croise la ligne CA au bon endroit.
  const inferredVariableRate =
    pointMortVolume > 0 ? clamp(1 - chargesFixes / pointMortVolume, 0.05, 0.95) : 0.65;

  const variableRate = variableRateFromKpi ?? inferredVariableRate;
  const maxVolume = Math.max(defaultVolume, pointMortVolume * 1.35, 50000);

  const points: BreakEvenPoint[] = Array.from({ length: 8 }, (_, index) => {
    const volume = (maxVolume / 7) * index;
    const ca = volume;
    const couts = chargesFixes + volume * variableRate;
    return {
      volume,
      ca,
      couts,
      marge: ca - couts
    };
  });

  return {
    points,
    pointMortVolume,
    pointMortValeur: pointMortVolume
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
