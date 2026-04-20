import type { MappedFinancialData } from "@/types/analysis";
import { createEmptyMappedFinancialData } from "@/services/mapping/financialDataMapper";
import type { DocumentAIExtractionResult } from "@/services/documentAI";
import type { VisionFinancialData } from "@/services/pdf-analysis/visionExtractor";

export function extractRawTextFromDocumentAI(extraction: DocumentAIExtractionResult): string {
  const rawText = extraction.rawText ?? "";
  console.log(`[V2 Mapper] Texte brut Document AI — longueur: ${rawText.length} chars`);
  return rawText;
}

type LlmDataInput = Partial<MappedFinancialData> & {
  unite?: "euros" | "milliers_euros" | string | null;
  fiscal_year?: number | null;
};

const NUMERIC_FIELDS: (keyof MappedFinancialData)[] = [
  "immob_incorp", "immob_corp", "immob_fin", "total_actif_immo",
  "total_actif_immo_brut", "total_actif_immo_net",
  "stocks_mp", "stocks_march", "total_stocks", "avances_vers_actif",
  "clients", "autres_creances", "creances", "vmp", "dispo", "cca",
  "total_actif_circ", "total_actif",
  "capital", "ecarts_reeval", "reserve_legale", "reserves_reglem",
  "autres_reserves", "ran", "res_net", "subv_invest", "prov_reglem",
  "total_cp", "total_prov",
  "emprunts", "avances_recues_passif", "fournisseurs", "dettes_fisc_soc",
  "cca_passif", "autres_dettes", "pca", "total_dettes", "total_passif",
  "ventes_march", "prod_biens", "prod_serv", "prod_vendue",
  "prod_stockee", "prod_immo", "subv_expl", "autres_prod_expl", "total_prod_expl",
  "achats_march", "var_stock_march", "achats_mp", "var_stock_mp",
  "ace", "impots_taxes", "salaires", "charges_soc",
  "dap", "dprov", "autres_charges_expl", "total_charges_expl",
  "ebit", "prod_fin", "charges_fin", "prod_excep", "charges_excep",
  "is_impot", "resultat_exercice", "ca_n_minus_1", "n", "delta_bfr"
];

export function mapLlmDataToMappedFinancialData(llmData: LlmDataInput): MappedFinancialData {
  const multiplier = llmData.unite === "milliers_euros" ? 1000 : 1;
  if (multiplier === 1000) {
  }

  const mapped = createEmptyMappedFinancialData();

  for (const key of NUMERIC_FIELDS) {
    const val = (llmData as Record<string, unknown>)[key];
    if (typeof val === "number" && Number.isFinite(val)) {
      (mapped as Record<string, number | null>)[key] = val * multiplier;
    }
  }

  if (mapped.total_actif_immo !== null) {
    mapped.total_actif_immo_net ??= mapped.total_actif_immo;
  }

  if (mapped.clients !== null || mapped.autres_creances !== null) {
    mapped.creances ??= (mapped.clients ?? 0) + (mapped.autres_creances ?? 0);
  }

  if (mapped.stocks_mp !== null || mapped.stocks_march !== null) {
    mapped.total_stocks ??= (mapped.stocks_mp ?? 0) + (mapped.stocks_march ?? 0);
  }

  if (mapped.prod_vendue !== null) {
    mapped.prod_serv ??= mapped.prod_vendue;
  }

  if (mapped.res_net !== null) {
    mapped.resultat_exercice ??= mapped.res_net;
  } else if (mapped.resultat_exercice !== null) {
    mapped.res_net ??= mapped.resultat_exercice;
  }

  validateTotals(mapped);
  validateCaVsBilan(mapped);

  return mapped;
}

const VISION_TO_MAPPED: Record<string, keyof MappedFinancialData> = {
  ca: "prod_vendue",
  prod_vendue: "prod_vendue",
  ventes_march: "ventes_march",
  autres_prod_expl: "autres_prod_expl",
  total_prod_expl: "total_prod_expl",
  ace: "ace",
  salaires: "salaires",
  charges_soc: "charges_soc",
  dap: "dap",
  dprov: "dprov",
  impots_taxes: "impots_taxes",
  autres_charges_expl: "autres_charges_expl",
  total_charges_expl: "total_charges_expl",
  charges_fin: "charges_fin",
  prod_fin: "prod_fin",
  prod_excep: "prod_excep",
  charges_excep: "charges_excep",
  is_impot: "is_impot",
  resultat_net: "res_net",
  total_actif_immo: "total_actif_immo",
  immob_incorp: "immob_incorp",
  immob_corp: "immob_corp",
  immob_fin: "immob_fin",
  clients: "clients",
  autres_creances: "autres_creances",
  stocks_mp: "stocks_mp",
  dispo: "dispo",
  vmp: "vmp",
  total_actif_circ: "total_actif_circ",
  total_actif: "total_actif",
  total_cp: "total_cp",
  emprunts: "emprunts",
  fournisseurs: "fournisseurs",
  dettes_fisc_soc: "dettes_fisc_soc",
  autres_dettes: "autres_dettes",
  total_dettes: "total_dettes"
};

export function mapVisionDataToMappedFinancialData(
  visionData: Partial<VisionFinancialData>
): MappedFinancialData {
  const partial: Record<string, number | null> = {};
  const multiplier = visionData.unite === "milliers_euros" ? 1000 : 1;

  for (const [visionKey, mappedKey] of Object.entries(VISION_TO_MAPPED)) {
    const val = visionData[visionKey as keyof VisionFinancialData];
    if (typeof val === "number" && Number.isFinite(val)) {
      partial[mappedKey] = val * multiplier;
    }
  }

  return mapLlmDataToMappedFinancialData({ ...partial, unite: "euros" });
}

function validateTotals(mapped: MappedFinancialData): void {
  if (mapped.total_actif !== null && mapped.total_passif !== null) {
    const ecart = Math.abs(mapped.total_actif - mapped.total_passif);
    const tolerance = Math.max(Math.abs(mapped.total_actif) * 0.01, 1000);
    if (ecart > tolerance) {
      console.warn(`[V2] Bilan déséquilibré: actif=${mapped.total_actif} passif=${mapped.total_passif}`);
    }
  }
}

function validateCaVsBilan(mapped: MappedFinancialData): void {
  const ca = mapped.ventes_march ?? mapped.prod_vendue;
  if (ca !== null && mapped.total_actif !== null && mapped.total_actif > 0) {
    const ratio = ca / mapped.total_actif;
    if (ratio < 0.05) {
      console.warn(`[V2] CA suspect — ratio CA/bilan: ${ratio.toFixed(3)} — CA: ${ca} — bilan: ${mapped.total_actif}`);
    }
  }
}
