// File: lib/dashboard/investment/investmentViewModel.ts
// Role: centralise la logique métier pure de la section Investissement (BFR, rotation, délais clients/fournisseurs, état matériel).

export type BfrVariationPoint = {
  month: string;
  value: number;
};

export type ClientsVsSuppliersComparison = {
  status: "risk" | "positive" | "balanced" | "na";
  message: string;
  deltaDays: number | null;
};

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

// Le BFR est montré en tendance mensuelle simulée pour donner un repère visuel,
// même si la donnée source fournie est un agrégat ponctuel.
export function buildBfrVariationSeries(bfr: number | null): BfrVariationPoint[] {
  const base = sanitizeNumber(bfr);
  const multipliers = [0.88, 0.92, 0.95, 0.98, 1.01, 1.03, 1.06, 1.04, 1.02, 1.0, 0.97, 0.94];

  return MONTHS.map((month, index) => ({
    month,
    value: base * multipliers[index]
  }));
}

// Compare DSO/DPO pour qualifier rapidement le risque de trésorerie.
// DSO > DPO => l'entreprise avance plus de cash qu'elle n'en reçoit.
export function buildClientsVsSuppliersComparison(
  dso: number | null,
  dpo: number | null
): ClientsVsSuppliersComparison {
  if (dso === null || dpo === null) {
    return {
      status: "na",
      message: "Données DSO/DPO incomplètes pour interpréter le risque.",
      deltaDays: null
    };
  }

  const delta = dso - dpo;

  if (delta > 0) {
    return {
      status: "risk",
      message: "Risque: les clients paient plus tard que les fournisseurs.",
      deltaDays: delta
    };
  }

  if (delta < 0) {
    return {
      status: "positive",
      message: "Positif: les fournisseurs financent une partie du cycle.",
      deltaDays: delta
    };
  }

  return {
    status: "balanced",
    message: "Équilibré: délais clients et fournisseurs alignés.",
    deltaDays: 0
  };
}

// L'indice matériel est borné entre 0 et 100 pour piloter un radial chart stable.
export function normalizeEquipmentState(value: number | null): number {
  if (value === null || Number.isNaN(value)) {
    return 0;
  }

  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return Math.min(Math.max(normalized, 0), 100);
}

function sanitizeNumber(value: number | null): number {
  if (value === null || Number.isNaN(value)) {
    return 0;
  }
  return value;
}
