// Snapshot bilan en variables 2033-SD : on rejoue trialBalanceAggregator + bridge
// existants sur la trial balance fournie par Pennylane, puis on extrait les variables
// du bilan.
//
// Cohérence garantie avec l'upload PDF statique : mêmes formules de bridge, même
// vocabulaire de variables côté front.

import { aggregateTrialBalanceToParsedFinancialData } from "@/services/integrations/aggregations/trialBalanceAggregator";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import type { MappedFinancialData } from "@/types/analysis";
import type {
  BalanceSheetSnapshot,
  BalanceSheetVariableCode,
  NormalizedTrialBalanceEntry,
} from "@/types/connectors";

const BS_CODES: readonly BalanceSheetVariableCode[] = [
  // Actif
  "immob_incorp",
  "immob_corp",
  "immob_fin",
  "total_actif_immo",
  "stocks_mp",
  "stocks_march",
  "total_stocks",
  "avances_vers_actif",
  "clients",
  "autres_creances",
  "creances",
  "vmp",
  "dispo",
  "cca",
  "total_actif_circ",
  "total_actif",
  // Passif
  "capital",
  "ecarts_reeval",
  "reserve_legale",
  "reserves_reglem",
  "autres_reserves",
  "ran",
  "res_net",
  "subv_invest",
  "prov_reglem",
  "total_cp",
  "total_prov",
  "emprunts",
  "avances_recues_passif",
  "fournisseurs",
  "dettes_fisc_soc",
  "cca_passif",
  "autres_dettes",
  "pca",
  "total_dettes",
  "total_passif",
  "tva_collectee",
  "tva_deductible",
];

/**
 * Calcule les soldes TVA depuis la trial balance brute. Le PCG sépare :
 *   - 4457 (et sous-comptes 44571/44572/...) : TVA collectée — solde naturel CRÉDITEUR
 *   - 4456 (44562/44566/44567/...) : TVA déductible — solde naturel DÉBITEUR
 * On somme tout ce qui commence par ces préfixes. Retourne 0 si aucun match
 * (entreprise hors champ TVA ou trial balance partielle).
 */
function computeVatBalances(
  trialBalance: NormalizedTrialBalanceEntry[]
): { collectee: number; deductible: number } {
  let collectee = 0;
  let deductible = 0;
  for (const entry of trialBalance) {
    const acc = (entry.accountNumber || "").trim();
    if (!acc) continue;
    const debit = Number.isFinite(entry.debit) ? entry.debit : 0;
    const credit = Number.isFinite(entry.credit) ? entry.credit : 0;
    if (acc.startsWith("4457")) {
      collectee += credit - debit;
    } else if (acc.startsWith("4456")) {
      deductible += debit - credit;
    }
  }
  return { collectee, deductible };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildBalanceSheetSnapshot(
  trialBalance: NormalizedTrialBalanceEntry[],
  asOfDate: string,
  periodStart: string
): BalanceSheetSnapshot {
  const parsed = aggregateTrialBalanceToParsedFinancialData(trialBalance);
  const mapped = mapParsedFinancialDataToMappedFinancialData(parsed);

  const vat = computeVatBalances(trialBalance);

  const values = {} as Record<BalanceSheetVariableCode, number>;
  for (const code of BS_CODES) {
    if (code === "tva_collectee") {
      values[code] = roundMoney(vat.collectee);
      continue;
    }
    if (code === "tva_deductible") {
      values[code] = roundMoney(vat.deductible);
      continue;
    }
    const v = mapped[code as keyof MappedFinancialData];
    values[code] = typeof v === "number" && Number.isFinite(v) ? roundMoney(v) : 0;
  }

  return {
    asOfDate,
    periodStart,
    values,
  };
}
