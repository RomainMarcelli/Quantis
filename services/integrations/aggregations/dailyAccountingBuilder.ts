// Agrège les écritures comptables jour par jour, en variables 2033-SD du compte de résultat.
//
// Stratégie : on regroupe les entries par date, et pour chaque date on rejoue la chaîne
// existante pcgAggregator → parsedFinancialDataBridge. Cela garantit que les variables
// produites ici utilisent EXACTEMENT les mêmes conventions que le mappedData annuel
// que le front utilise déjà via les uploads PDF (zéro divergence de formule).
//
// Sortie : un tableau trié par date croissante, chaque entrée contient un objet `values`
// avec toutes les variables 2033-SD du P&L (28 codes), même celles à 0. Cela donne au
// front un contrat stable sans avoir à gérer des absences de clés.

import { aggregateEntriesToParsedFinancialData } from "@/services/integrations/aggregations/pcgAggregator";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import type { MappedFinancialData } from "@/types/analysis";
import type {
  AccountingEntry,
  DailyAccountingEntry,
  PnlVariableCode,
} from "@/types/connectors";

const PNL_CODES: readonly PnlVariableCode[] = [
  "ventes_march",
  "prod_biens",
  "prod_serv",
  "prod_vendue",
  "prod_stockee",
  "prod_immo",
  "subv_expl",
  "autres_prod_expl",
  "total_prod_expl",
  "achats_march",
  "var_stock_march",
  "achats_mp",
  "var_stock_mp",
  "ace",
  "impots_taxes",
  "salaires",
  "charges_soc",
  "dap",
  "dprov",
  "autres_charges_expl",
  "total_charges_expl",
  "ebit",
  "prod_fin",
  "charges_fin",
  "prod_excep",
  "charges_excep",
  "is_impot",
  "resultat_exercice",
];

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildDailyAccounting(entries: AccountingEntry[]): DailyAccountingEntry[] {
  // 1. Regroupement par date YYYY-MM-DD (skip écritures sans date valide).
  const byDate = new Map<string, AccountingEntry[]>();
  let skippedNoDate = 0;
  for (const entry of entries) {
    const dateIso = (entry.date || "").slice(0, 10);
    if (!dateIso || Number.isNaN(new Date(dateIso).getTime())) {
      skippedNoDate++;
      continue;
    }
    const list = byDate.get(dateIso);
    if (list) list.push(entry);
    else byDate.set(dateIso, [entry]);
  }

  if (skippedNoDate > 0) {
    console.warn(`[dailyAccountingBuilder] skipped ${skippedNoDate} entries without valid date`);
  }

  // 2. Pour chaque jour : rejouer la chaîne pcgAggregator → bridge → extraire les variables P&L.
  const result: DailyAccountingEntry[] = [];
  for (const [date, dayEntries] of byDate.entries()) {
    const periodStart = new Date(`${date}T00:00:00.000Z`);
    const periodEnd = new Date(`${date}T23:59:59.999Z`);

    const parsed = aggregateEntriesToParsedFinancialData(dayEntries, {
      periodStart,
      periodEnd,
    });
    const mapped = mapParsedFinancialDataToMappedFinancialData(parsed);

    const values = extractPnlValues(mapped);
    result.push({
      date,
      values,
      entryCount: dayEntries.length,
    });
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

function extractPnlValues(mapped: MappedFinancialData): Record<PnlVariableCode, number> {
  // Initialise toutes les clés à 0 — contrat stable pour le front.
  const values = {} as Record<PnlVariableCode, number>;
  for (const code of PNL_CODES) {
    const v = mapped[code as keyof MappedFinancialData];
    values[code] = typeof v === "number" && Number.isFinite(v) ? roundMoney(v) : 0;
  }
  return values;
}
