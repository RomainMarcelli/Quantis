import type { CalculatedKpis } from "@/types/analysis";

export type KpiFormulaDefinition = {
  key: keyof CalculatedKpis;
  label: string;
  formula: string;
};

export const KPI_FORMULA_CATALOG: KpiFormulaDefinition[] = [
  { key: "tcam", label: "TCAM", formula: "((total_prod_expl / ca_n_minus_1)^(1/n) - 1) * 100" },
  { key: "va", label: "Valeur ajoutee", formula: "total_prod_expl - achats_march - achats_mp - ace" },
  { key: "ebitda", label: "EBITDA", formula: "va - impots_taxes - salaires - charges_soc" },
  { key: "marge_ebitda", label: "Marge EBITDA (%)", formula: "(ebitda / total_prod_expl) * 100" },
  { key: "charges_var", label: "Charges variables", formula: "achats_march + achats_mp + var_stock_march + var_stock_mp" },
  { key: "mscv", label: "MSCV", formula: "total_prod_expl - charges_var" },
  { key: "tmscv", label: "TMSCV", formula: "mscv / total_prod_expl" },
  { key: "charges_fixes", label: "Charges fixes", formula: "ace + salaires + charges_soc + dap" },
  { key: "point_mort", label: "Point mort", formula: "charges_fixes / tmscv" },
  { key: "ratio_immo", label: "Ratio immo", formula: "total_actif_immo / total_actif" },
  { key: "bfr", label: "BFR", formula: "(total_stocks + creances) - (fournisseurs + dettes_fisc_soc)" },
  { key: "rot_bfr", label: "Rotation BFR (jours)", formula: "(bfr / (total_prod_expl * 1.2)) * 365" },
  { key: "dso", label: "Rotation client (DSO)", formula: "(clients * 365) / (total_prod_expl * 1.2)" },
  { key: "dpo", label: "Rotation fournisseur (DPO)", formula: "(fournisseurs * 365) / ((achats_march + ace) * 1.2)" },
  { key: "rot_stocks", label: "Rotation stocks", formula: "(total_stocks * 365) / total_prod_expl" },
  { key: "caf", label: "CAF", formula: "res_net + dap" },
  { key: "fte", label: "Flux tresorerie exploitation", formula: "caf - delta_bfr" },
  { key: "tn", label: "Tresorerie nette", formula: "dispo - emprunts" },
  { key: "solvabilite", label: "Solvabilite", formula: "total_cp / total_passif" },
  { key: "gearing", label: "Gearing", formula: "(emprunts - dispo) / ebitda" },
  { key: "liq_gen", label: "Liquidite generale", formula: "total_actif_circ / (fournisseurs + dettes_fisc_soc)" },
  { key: "liq_red", label: "Liquidite reduite", formula: "(creances + dispo) / (fournisseurs + dettes_fisc_soc)" },
  { key: "liq_imm", label: "Liquidite immediate", formula: "dispo / (fournisseurs + dettes_fisc_soc)" },
  { key: "roce", label: "ROCE", formula: "(ebit * 0.75) / (total_actif_immo + bfr)" },
  { key: "roe", label: "ROE", formula: "res_net / total_cp" },
  { key: "effet_levier", label: "Effet de levier", formula: "roe - roce" },
  { key: "healthScore", label: "Score de sante", formula: "Score composite (marge, resultat, BFR, runway)" }
];
