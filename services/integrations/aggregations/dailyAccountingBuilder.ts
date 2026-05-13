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
  // On collecte aussi le DELTA cash du jour (mvts nets classe 5x hors 519) pour pouvoir
  // calculer ensuite le solde cumulé en un 2ᵉ passage.
  type DayDraft = DailyAccountingEntry & { cashDelta: number };
  const result: DayDraft[] = [];
  for (const [date, dayEntries] of byDate.entries()) {
    const periodStart = new Date(`${date}T00:00:00.000Z`);
    const periodEnd = new Date(`${date}T23:59:59.999Z`);

    const parsed = aggregateEntriesToParsedFinancialData(dayEntries, {
      periodStart,
      periodEnd,
    });
    const mapped = mapParsedFinancialDataToMappedFinancialData(parsed);

    const values = extractPnlValues(mapped);
    // mapped.dispo agrégé sur les seules entries du jour = mouvement net du
    // jour sur les comptes de trésorerie (classe 5 hors 519, conformément à
    // BS_MAPPING dans pcgAggregator). On ne convertit pas en absolu : la
    // valeur peut être négative si les sorties dépassent les entrées.
    const cashDelta =
      typeof mapped.dispo === "number" && Number.isFinite(mapped.dispo) ? mapped.dispo : 0;
    result.push({
      date,
      values,
      entryCount: dayEntries.length,
      cashBalance: 0, // hydraté en 3ᵉ passage
      cashDelta,
    });
  }

  // 3. Tri chronologique puis cumul des deltas pour produire le solde fin de
  // jour. Hypothèse : entries d'à-nouveau incluses dans le sync (cas
  // MyUnisoft post-fix 12 mois — l'écriture d'à-nouveau de l'exercice est
  // dans les entries puisque le sync remonte 36 mois). Si ce n'est pas le
  // cas, le solde est relatif au début du dailyAccounting.
  result.sort((a, b) => a.date.localeCompare(b.date));
  let runningCash = 0;
  for (const day of result) {
    runningCash += day.cashDelta;
    day.cashBalance = roundMoney(runningCash);
  }

  // On droppe `cashDelta` du résultat final — c'était un champ de travail
  // interne, pas exposé au front (le front a besoin du solde, pas du delta).
  return result.map(({ cashDelta: _drop, ...entry }) => entry);
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
