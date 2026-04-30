// File: lib/dashboard/financement/financingViewModel.ts
// Role: regroupe la logique métier pure de la section Financement (capacité, liquidité, levier, cash flow).

export type FinancingSeverity = "good" | "warning" | "risk" | "na";

export type FinancingIndicator = {
  label: string;
  value: number | null;
  severity: FinancingSeverity;
  helper: string;
  /** id KPI dans le registre — déclenche le KpiTooltip côté UI. */
  kpiId?: string;
};

export type FinancingInterpretation = {
  severity: FinancingSeverity;
  label: string;
  helper: string;
};

export type CashFlowPoint = {
  month: string;
  value: number;
};

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

// Interprète la capacité de remboursement (en années).
// Plus le nombre d'années est faible, meilleure est la situation de remboursement.
export function interpretDebtCapacity(years: number | null): FinancingInterpretation {
  if (years === null || Number.isNaN(years)) {
    return {
      severity: "na",
      label: "N/D",
      helper: "Capacité de remboursement indisponible."
    };
  }

  if (years <= 3) {
    return {
      severity: "good",
      label: "Bonne capacité",
      helper: "Le niveau d'endettement reste absorbable à horizon court."
    };
  }

  if (years <= 5) {
    return {
      severity: "warning",
      label: "Sous surveillance",
      helper: "La dette reste finançable, mais réduit la marge de manœuvre."
    };
  }

  return {
    severity: "risk",
    label: "Risque élevé",
    helper: "Le délai de remboursement est long et fragilise la flexibilité financière."
  };
}

// Interprète les ratios de liquidité pour juger la sécurité court terme.
// Seuils utilisés: >=1.2 bon, [1;1.2[ vigilance, <1 risque.
export function interpretLiquidity(value: number | null): FinancingInterpretation {
  if (value === null || Number.isNaN(value)) {
    return {
      severity: "na",
      label: "N/D",
      helper: "Ratio indisponible."
    };
  }

  if (value >= 1.2) {
    return {
      severity: "good",
      label: "Solide",
      helper: "Couverture confortable des dettes à court terme."
    };
  }

  if (value >= 1) {
    return {
      severity: "warning",
      label: "Vigilance",
      helper: "Équilibre fragile, à suivre sur les prochains mois."
    };
  }

  return {
    severity: "risk",
    label: "Tension",
    helper: "Risque de tension de trésorerie à court terme."
  };
}

// Interprète le levier financier: plus il est élevé, plus la dépendance bancaire est forte.
export function interpretLeverage(value: number | null): FinancingInterpretation {
  if (value === null || Number.isNaN(value)) {
    return {
      severity: "na",
      label: "N/D",
      helper: "Levier financier indisponible."
    };
  }

  if (value < 1) {
    return {
      severity: "good",
      label: "Autonomie élevée",
      helper: "Structure peu dépendante des financements externes."
    };
  }

  if (value <= 2) {
    return {
      severity: "warning",
      label: "Dépendance modérée",
      helper: "L'entreprise reste dépendante mais dans une zone maîtrisable."
    };
  }

  return {
    severity: "risk",
    label: "Dépendance forte",
    helper: "Le financement externe pèse fortement sur la structure financière."
  };
}

export function buildLiquidityIndicators(params: {
  liquiditeGenerale: number | null;
  liquiditeReduite: number | null;
  liquiditeImmediate: number | null;
}): FinancingIndicator[] {
  return [
    {
      label: "Générale",
      value: params.liquiditeGenerale,
      severity: interpretLiquidity(params.liquiditeGenerale).severity,
      helper: "Actif circulant / dettes court terme",
      kpiId: "liq_gen"
    },
    {
      label: "Réduite",
      value: params.liquiditeReduite,
      severity: interpretLiquidity(params.liquiditeReduite).severity,
      helper: "(Actif circulant - stocks) / dettes court terme",
      kpiId: "liq_red"
    },
    {
      label: "Immédiate",
      value: params.liquiditeImmediate,
      severity: interpretLiquidity(params.liquiditeImmediate).severity,
      helper: "Trésorerie / dettes court terme",
      kpiId: "liq_imm"
    }
  ];
}

// Série d'évolution simulée du cash flow net pour un repère visuel MVP.
export function buildCashFlowSeries(cashFlow: number | null): CashFlowPoint[] {
  const base = cashFlow === null || Number.isNaN(cashFlow) ? 0 : cashFlow;
  const factors = [0.82, 0.9, 0.96, 1.02, 1.05, 1.08, 1.12, 1.1, 1.03, 0.98, 0.94, 0.9];

  return MONTHS.map((month, index) => ({
    month,
    value: base * factors[index]
  }));
}

export function severityClass(severity: FinancingSeverity): string {
  if (severity === "good") {
    return "border-emerald-400/35 bg-emerald-500/12 text-emerald-200";
  }
  if (severity === "warning") {
    return "border-amber-400/35 bg-amber-500/12 text-amber-200";
  }
  if (severity === "risk") {
    return "border-rose-400/35 bg-rose-500/12 text-rose-200";
  }
  return "border-white/20 bg-white/5 text-white/75";
}
