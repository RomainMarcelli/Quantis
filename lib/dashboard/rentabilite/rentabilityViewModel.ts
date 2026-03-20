// File: lib/dashboard/rentabilite/rentabilityViewModel.ts
// Role: centralise la logique pure de la section Rentabilité (séries ROE/ROCE, tendance et interprétation levier).

export type RentabilityTrendDirection = "up" | "down" | "flat" | "na";

export type RentabilityTrend = {
  direction: RentabilityTrendDirection;
  delta: number | null;
  label: string;
};

export type RentabilitySeriesPoint = {
  month: string;
  value: number;
};

export type LeverageStatus = "good" | "warning" | "risk" | "na";

export type LeverageInterpretation = {
  status: LeverageStatus;
  label: string;
  helper: string;
};

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

// Normalise une entrée KPI pour obtenir un pourcentage exploitable en affichage.
// Exemple: 0.14 devient 14, alors que 14 reste 14.
export function normalizePercentInput(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) {
    return null;
  }
  return Math.abs(value) <= 1 ? value * 100 : value;
}

// Génère une série mensuelle "MVP" stable pour visualiser la trajectoire ROE/ROCE.
// Tant que le backend ne fournit pas d'historique mensuel, on dérive une évolution cohérente autour de la valeur courante.
export function buildRentabilitySeries(
  value: number | null,
  metric: "roe" | "roce"
): RentabilitySeriesPoint[] {
  const normalized = normalizePercentInput(value);
  const base = normalized ?? 0;
  const factors =
    metric === "roe"
      ? [0.76, 0.84, 0.9, 0.95, 1.02, 1.08, 1.12, 1.09, 1.04, 1.0, 0.96, 0.93]
      : [0.8, 0.86, 0.92, 0.98, 1.03, 1.07, 1.1, 1.06, 1.01, 0.97, 0.94, 0.9];

  return MONTHS.map((month, index) => ({
    month,
    value: round(base * factors[index], 2)
  }));
}

// Calcule la tendance à partir des deux derniers points de la série.
// La direction pilote ensuite l'icône et la couleur de lecture dans les cards KPI.
export function computeTrend(series: RentabilitySeriesPoint[]): RentabilityTrend {
  if (series.length < 2) {
    return {
      direction: "na",
      delta: null,
      label: "Tendance indisponible"
    };
  }

  const previous = series[series.length - 2]?.value ?? 0;
  const current = series[series.length - 1]?.value ?? 0;
  const delta = round(current - previous, 2);

  if (Math.abs(delta) < 0.01) {
    return {
      direction: "flat",
      delta: 0,
      label: "Stable"
    };
  }

  if (delta > 0) {
    return {
      direction: "up",
      delta,
      label: `Hausse ${formatDelta(delta)}`
    };
  }

  return {
    direction: "down",
    delta,
    label: `Baisse ${formatDelta(delta)}`
  };
}

// Détermine l'état visuel principal d'un KPI de rentabilité selon son signe.
// Règle produit: valeur positive = flèche haute verte, valeur négative = flèche basse rouge.
export function buildSignTrend(value: number | null): RentabilityTrend {
  const normalized = normalizePercentInput(value);
  if (normalized === null) {
    return {
      direction: "na",
      delta: null,
      label: "Indicateur indisponible"
    };
  }

  if (normalized > 0) {
    return {
      direction: "up",
      delta: normalized,
      label: "Rentabilité positive"
    };
  }

  if (normalized < 0) {
    return {
      direction: "down",
      delta: normalized,
      label: "Rentabilité négative"
    };
  }

  return {
    direction: "flat",
    delta: 0,
    label: "Équilibre"
  };
}

// Interprète le levier financier pour donner une lecture non-financière immédiate.
// Plus le levier est élevé, plus la dépendance aux financements externes augmente.
export function interpretLeverage(value: number | null): LeverageInterpretation {
  if (value === null || Number.isNaN(value)) {
    return {
      status: "na",
      label: "N/D",
      helper: "Levier financier indisponible."
    };
  }

  if (value < 1) {
    return {
      status: "good",
      label: "Autonomie forte",
      helper: "Structure majoritairement financée par ses ressources internes."
    };
  }

  if (value <= 2) {
    return {
      status: "warning",
      label: "Équilibre à suivre",
      helper: "Dépendance modérée à la dette, zone acceptable mais à surveiller."
    };
  }

  return {
    status: "risk",
    label: "Dépendance forte",
    helper: "Le financement externe pèse fortement sur la structure financière."
  };
}

// Classe visuelle partagée pour homogénéiser la lecture des tendances ROE/ROCE.
export function trendClass(direction: RentabilityTrendDirection): string {
  if (direction === "up") {
    return "border-emerald-400/35 bg-emerald-500/12 text-emerald-200";
  }
  if (direction === "down") {
    return "border-rose-400/35 bg-rose-500/12 text-rose-200";
  }
  if (direction === "flat") {
    return "border-amber-400/35 bg-amber-500/12 text-amber-200";
  }
  return "border-white/20 bg-white/5 text-white/75";
}

// Classe visuelle dédiée à la dépendance bancaire pour garder la même DA que les autres sections.
export function leverageClass(status: LeverageStatus): string {
  if (status === "good") {
    return "border-emerald-400/35 bg-emerald-500/12 text-emerald-200";
  }
  if (status === "warning") {
    return "border-amber-400/35 bg-amber-500/12 text-amber-200";
  }
  if (status === "risk") {
    return "border-rose-400/35 bg-rose-500/12 text-rose-200";
  }
  return "border-white/20 bg-white/5 text-white/75";
}

function formatDelta(delta: number): string {
  return `${Math.abs(delta).toFixed(2)} pt`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
