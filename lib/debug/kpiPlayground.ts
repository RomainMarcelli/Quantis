import type { CalculatedKpis, MappedFinancialData } from "@/types/analysis";
import { createEmptyMappedFinancialData } from "@/services/mapping/financialDataMapper";

export type JsonMappedDataParseResult =
  | { success: true; data: MappedFinancialData }
  | { success: false; error: string; data: MappedFinancialData };

export function parseMappedDataJson(input: string): JsonMappedDataParseResult {
  const base = createEmptyMappedFinancialData();

  if (!input.trim()) {
    return { success: true, data: base };
  }

  try {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        success: false,
        error: "Le JSON doit etre un objet cle/valeur.",
        data: base
      };
    }

    const data = { ...base };
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (!(key in data)) {
        return;
      }

      if (value === null) {
        data[key as keyof MappedFinancialData] = null;
        return;
      }

      if (typeof value === "number" && Number.isFinite(value)) {
        data[key as keyof MappedFinancialData] = value;
      }
    });

    return { success: true, data };
  } catch {
    return {
      success: false,
      error: "JSON invalide. Verifiez la syntaxe (accolades, virgules, guillemets).",
      data: base
    };
  }
}

export function getNonNullMappedEntries(
  data: MappedFinancialData
): Array<{ key: string; value: number }> {
  return Object.entries(data)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => ({ key, value: value as number }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function getNonNullKpiEntries(kpis: CalculatedKpis): Array<{ key: string; value: number }> {
  return Object.entries(kpis)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => ({ key, value: value as number }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function getPlaygroundDefaultInput(): string {
  return JSON.stringify(
    {
      total_prod_expl: 584707.14,
      ca_n_minus_1: 500000,
      n: 1,
      achats_march: 143193.59,
      achats_mp: 47731.19,
      ace: 119327.99,
      impots_taxes: 15910.4,
      salaires: 198879.98,
      charges_soc: 83529.59,
      var_stock_march: 7955.2,
      var_stock_mp: 0,
      dap: 39776,
      total_actif_immo: 222745.58,
      total_actif: 453645.24,
      total_stocks: 63641.6,
      creances: 103616.47,
      fournisseurs: 113421.26,
      dettes_fisc_soc: 75614.17,
      clients: 87706.07,
      res_net: -83529.6,
      delta_bfr: 1000,
      dispo: 63641.59,
      emprunts: 189035.43,
      total_cp: 75574.38,
      total_passif: 453645.24,
      total_actif_circ: 230899.66,
      ebit: -79552
    },
    null,
    2
  );
}
