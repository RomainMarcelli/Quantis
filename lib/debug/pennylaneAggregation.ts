// Helpers d'agrégation pour la page de debug Pennylane.
// - Agrège les DailyAccountingEntry par mois
// - Calcule les KPI à partir des formules PM (côté front, sans appeler le back)
//
// Volontairement simple et sans dépendances : c'est de la logique de présentation.

import type {
  AnalysisRecord
} from "@/types/analysis";
import type {
  BalanceSheetSnapshot,
  BalanceSheetVariableCode,
  DailyAccountingEntry,
  PnlVariableCode,
} from "@/types/connectors";

export type Granularity = "day" | "week" | "month" | "quarter" | "year";

export const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "Jour",
  week: "Semaine",
  month: "Mois",
  quarter: "Trimestre",
  year: "Année",
};

export type PnlAggregate = {
  // Clé de période lisible. Format selon granularité :
  // day = "YYYY-MM-DD" | week = "YYYY-Www" | month = "YYYY-MM" | quarter = "YYYY-Q1" | year = "YYYY"
  period: string;
  values: Record<PnlVariableCode, number>;
  daysWithEntries: number;
};

// Conservé pour compatibilité.
export type MonthlyPnlAggregate = PnlAggregate & { month: string };

const PNL_CODES: readonly PnlVariableCode[] = [
  "ventes_march", "prod_biens", "prod_serv", "prod_vendue",
  "prod_stockee", "prod_immo", "subv_expl", "autres_prod_expl",
  "total_prod_expl",
  "achats_march", "var_stock_march", "achats_mp", "var_stock_mp", "ace",
  "impots_taxes", "salaires", "charges_soc", "dap", "dprov",
  "autres_charges_expl", "total_charges_expl",
  "ebit",
  "prod_fin", "charges_fin", "prod_excep", "charges_excep",
  "is_impot", "resultat_exercice",
];

function emptyPnlValues(): Record<PnlVariableCode, number> {
  const v = {} as Record<PnlVariableCode, number>;
  for (const code of PNL_CODES) v[code] = 0;
  return v;
}

// Calcule la clé de période pour un YYYY-MM-DD selon la granularité demandée.
export function periodKeyFor(date: string, granularity: Granularity): string {
  if (granularity === "day") return date;
  if (granularity === "year") return date.slice(0, 4);

  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;

  if (granularity === "month") {
    return date.slice(0, 7);
  }
  if (granularity === "quarter") {
    const month = d.getUTCMonth(); // 0-11
    const q = Math.floor(month / 3) + 1;
    return `${d.getUTCFullYear()}-Q${q}`;
  }
  // ISO week (start Monday). Format "YYYY-Www".
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const weekNr = 1 + Math.round((firstThursday - target.valueOf()) / 604_800_000);
  const isoYear = new Date(firstThursday).getUTCFullYear();
  return `${isoYear}-W${String(weekNr).padStart(2, "0")}`;
}

export function aggregateDailyByGranularity(
  daily: DailyAccountingEntry[],
  granularity: Granularity
): PnlAggregate[] {
  const byPeriod = new Map<string, PnlAggregate>();

  for (const day of daily) {
    const period = periodKeyFor(day.date, granularity);
    let agg = byPeriod.get(period);
    if (!agg) {
      agg = { period, values: emptyPnlValues(), daysWithEntries: 0 };
      byPeriod.set(period, agg);
    }
    agg.daysWithEntries += 1;
    for (const code of PNL_CODES) {
      agg.values[code] += day.values[code] ?? 0;
    }
  }

  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
}

// Compat (utilisé ailleurs avant).
export function aggregateDailyByMonth(
  daily: DailyAccountingEntry[]
): MonthlyPnlAggregate[] {
  return aggregateDailyByGranularity(daily, "month").map((p) => ({
    ...p,
    month: p.period,
  }));
}

// ─── KPI front-side (formules PM) ──────────────────────────────────────────

export type FrontComputedKpis = {
  ca: number;
  va: number;
  ebitda: number;
  marge_ebitda: number | null;
  bfr: number | null;
  dso: number | null;
  solvabilite: number | null;
};

// Pour calculer un KPI annuel : on agrège dailyAccounting sur toute la période.
function aggregateTotal(daily: DailyAccountingEntry[]): Record<PnlVariableCode, number> {
  const total = emptyPnlValues();
  for (const day of daily) {
    for (const code of PNL_CODES) {
      total[code] += day.values[code] ?? 0;
    }
  }
  return total;
}

export function computeFrontKpis(
  daily: DailyAccountingEntry[],
  snapshot: BalanceSheetSnapshot | null
): FrontComputedKpis {
  const total = aggregateTotal(daily);

  const ca = total.ventes_march + total.prod_vendue;
  const va = total.total_prod_expl - total.achats_march - total.achats_mp - total.ace;
  const ebitda = va - total.impots_taxes - total.salaires - total.charges_soc;
  const marge_ebitda = ca > 0 ? (ebitda / ca) * 100 : null;

  // Bilan : null si pas de snapshot (source statique ou sync sans trial balance).
  let bfr: number | null = null;
  let dso: number | null = null;
  let solvabilite: number | null = null;

  if (snapshot) {
    const v = snapshot.values;
    bfr = v.total_stocks + v.creances - (v.fournisseurs + v.dettes_fisc_soc);
    dso = ca > 0 ? (v.clients * 365) / (ca * 1.2) : null;
    solvabilite = v.total_passif > 0 ? v.total_cp / v.total_passif : null;
  }

  return { ca, va, ebitda, marge_ebitda, bfr, dso, solvabilite };
}

// ─── Sélection du dernier sync dynamique ──────────────────────────────────

export function pickLatestDynamicAnalysis(
  analyses: AnalysisRecord[]
): AnalysisRecord | null {
  return (
    analyses
      .filter((a) => a.sourceMetadata?.type === "dynamic" && Array.isArray(a.dailyAccounting))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

// Variables bilan à mettre en avant dans le tableau récap.
export const HIGHLIGHTED_BALANCE_CODES: BalanceSheetVariableCode[] = [
  "clients",
  "creances",
  "dispo",
  "total_actif_circ",
  "total_actif",
  "capital",
  "ran",
  "res_net",
  "total_cp",
  "emprunts",
  "fournisseurs",
  "dettes_fisc_soc",
  "total_dettes",
  "total_passif",
];

// Variables P&L à mettre en avant dans le tableau mensuel.
export const HIGHLIGHTED_PNL_CODES: PnlVariableCode[] = [
  "ventes_march",
  "prod_vendue",
  "total_prod_expl",
  "achats_march",
  "ace",
  "salaires",
  "charges_soc",
  "impots_taxes",
  "dap",
  "total_charges_expl",
  "ebit",
  "resultat_exercice",
];
