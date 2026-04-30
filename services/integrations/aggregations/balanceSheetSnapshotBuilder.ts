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
];

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

  const values = {} as Record<BalanceSheetVariableCode, number>;
  for (const code of BS_CODES) {
    const v = mapped[code as keyof MappedFinancialData];
    values[code] = typeof v === "number" && Number.isFinite(v) ? roundMoney(v) : 0;
  }

  return {
    asOfDate,
    periodStart,
    values,
  };
}
