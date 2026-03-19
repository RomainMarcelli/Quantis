import type { FinancialFacts, MappedFinancialData, RawAnalysisData } from "@/types/analysis";

const MAPPED_VARIABLE_KEYS: Array<keyof MappedFinancialData> = [
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
  "ca_n_minus_1",
  "n",
  "delta_bfr"
];

const LINE_CODE_TO_VARIABLES: Record<string, Array<keyof MappedFinancialData>> = {
  "010": ["immob_incorp"],
  "014": ["immob_incorp"],
  "028": ["immob_corp"],
  "040": ["immob_fin"],
  "044": ["total_actif_immo"],
  "050": ["stocks_mp"],
  "060": ["stocks_march"],
  "064": ["avances_vers_actif"],
  "068": ["clients"],
  "072": ["autres_creances"],
  "080": ["vmp"],
  "084": ["dispo"],
  "092": ["cca"],
  "096": ["total_actif_circ"],
  "110": ["total_actif"],
  "120": ["capital"],
  "124": ["ecarts_reeval"],
  "126": ["reserve_legale"],
  "130": ["reserves_reglem"],
  "132": ["autres_reserves"],
  "134": ["ran"],
  "136": ["res_net"],
  "137": ["subv_invest"],
  "140": ["prov_reglem"],
  "142": ["total_cp"],
  "154": ["total_prov"],
  "156": ["emprunts"],
  "164": ["avances_recues_passif"],
  "166": ["fournisseurs"],
  "172": ["dettes_fisc_soc"],
  "173": ["cca_passif"],
  "174": ["pca"],
  "175": ["autres_dettes"],
  "176": ["total_dettes"],
  "180": ["total_passif"],
  "209": ["ventes_march"],
  "215": ["prod_biens"],
  "217": ["prod_serv"],
  "222": ["prod_stockee"],
  "224": ["prod_immo"],
  "226": ["subv_expl"],
  "230": ["autres_prod_expl"],
  "232": ["total_prod_expl"],
  "234": ["achats_march"],
  "236": ["var_stock_march"],
  "238": ["achats_mp"],
  "240": ["var_stock_mp"],
  "242": ["ace"],
  "244": ["impots_taxes"],
  "250": ["salaires"],
  "252": ["charges_soc"],
  "254": ["dap"],
  "256": ["dprov"],
  "262": ["autres_charges_expl"],
  "264": ["total_charges_expl"],
  "270": ["ebit"],
  "280": ["prod_fin"],
  "290": ["prod_excep"],
  "294": ["charges_fin"],
  "300": ["charges_excep"],
  "306": ["is_impot"],
  "310": ["resultat_exercice"]
};

const LABEL_KEYWORD_MAP: Array<{ variable: keyof MappedFinancialData; keywords: string[] }> = [
  { variable: "total_prod_expl", keywords: ["total des produits d'exploitation", "total_prod_expl", "chiffre d'affaires"] },
  { variable: "achats_march", keywords: ["achat de marchandises", "achats_march"] },
  { variable: "achats_mp", keywords: ["achats de matieres premieres", "achats mp", "achats_mp"] },
  { variable: "ace", keywords: ["autres charges externes", "ace"] },
  { variable: "impots_taxes", keywords: ["impots", "taxes", "impots_taxes"] },
  { variable: "salaires", keywords: ["remunerations du personnel", "salaires"] },
  { variable: "charges_soc", keywords: ["charges sociales", "charges_soc"] },
  { variable: "dap", keywords: ["dotations aux amortissements", "dap"] },
  { variable: "ebit", keywords: ["resultat d'exploitation", "ebit"] },
  { variable: "resultat_exercice", keywords: ["benefices ou pertes", "resultat de l'exercice", "resultat_exercice"] },
  { variable: "res_net", keywords: ["resultat de l'exercice", "res_net", "resultat net"] },
  { variable: "total_actif", keywords: ["total general", "total_actif"] },
  { variable: "total_actif_immo", keywords: ["actif immobilise", "total i"] },
  { variable: "total_actif_circ", keywords: ["total ii", "actif circulant"] },
  { variable: "total_stocks", keywords: ["stocks", "total_stocks"] },
  { variable: "clients", keywords: ["clients et comptes rattaches", "clients"] },
  { variable: "creances", keywords: ["creances", "autres creances"] },
  { variable: "dispo", keywords: ["disponibilites", "tresorerie", "dispo"] },
  { variable: "fournisseurs", keywords: ["fournisseurs", "dettes fournisseurs"] },
  { variable: "dettes_fisc_soc", keywords: ["dettes fiscales et sociales", "dettes_fisc_soc"] },
  { variable: "emprunts", keywords: ["emprunts", "dettes assimilees"] },
  { variable: "total_cp", keywords: ["capitaux propres", "total_cp"] },
  { variable: "total_passif", keywords: ["total general", "total_passif"] }
];

export function createEmptyRawAnalysisData(): RawAnalysisData {
  return {
    byVariableCode: {},
    byLineCode: {},
    byLabel: {}
  };
}

export function mergeRawAnalysisData(items: RawAnalysisData[]): RawAnalysisData {
  const merged = createEmptyRawAnalysisData();

  items.forEach((item) => {
    mergeNumericMaps(merged.byVariableCode, item.byVariableCode);
    mergeNumericMaps(merged.byLineCode, item.byLineCode);
    mergeNumericMaps(merged.byLabel, item.byLabel);
  });

  return merged;
}

export function createEmptyMappedFinancialData(): MappedFinancialData {
  const empty = {} as MappedFinancialData;
  MAPPED_VARIABLE_KEYS.forEach((key) => {
    empty[key] = null;
  });
  return empty;
}

export function mapRawDataToMappedFinancialData(rawData: RawAnalysisData): MappedFinancialData {
  const mapped = createEmptyMappedFinancialData();
  const filledByVariable = new Set<keyof MappedFinancialData>();

  Object.entries(rawData.byVariableCode).forEach(([variable, value]) => {
    if (isMappedKey(variable)) {
      mapped[variable] = value;
      filledByVariable.add(variable);
    }
  });

  Object.entries(rawData.byLineCode).forEach(([lineCode, value]) => {
    const targets = LINE_CODE_TO_VARIABLES[lineCode];
    if (!targets) {
      return;
    }
    targets.forEach((target) => {
      if (filledByVariable.has(target)) {
        return;
      }
      mapped[target] = mapped[target] === null ? value : (mapped[target] as number) + value;
    });
  });

  Object.entries(rawData.byLabel).forEach(([label, value]) => {
    const normalizedLabel = normalizeText(label);
    LABEL_KEYWORD_MAP.forEach(({ variable, keywords }) => {
      if (mapped[variable] !== null) {
        return;
      }
      if (keywords.some((keyword) => normalizedLabel.includes(normalizeText(keyword)))) {
        mapped[variable] = value;
      }
    });
  });

  mapped.total_stocks = fallback(mapped.total_stocks, sumAvailable(mapped.stocks_mp, mapped.stocks_march));
  mapped.creances = fallback(mapped.creances, sumAvailable(mapped.clients, mapped.autres_creances));
  mapped.prod_vendue = fallback(mapped.prod_vendue, sumAvailable(mapped.prod_biens, mapped.prod_serv));
  mapped.total_dettes = fallback(
    mapped.total_dettes,
    sumAvailable(
      mapped.emprunts,
      mapped.avances_recues_passif,
      mapped.fournisseurs,
      mapped.dettes_fisc_soc,
      mapped.cca_passif,
      mapped.autres_dettes,
      mapped.pca
    )
  );
  mapped.total_prod_expl = fallback(
    mapped.total_prod_expl,
    sumAvailable(
      mapped.ventes_march,
      mapped.prod_vendue,
      mapped.prod_stockee,
      mapped.prod_immo,
      mapped.subv_expl,
      mapped.autres_prod_expl
    )
  );
  mapped.total_charges_expl = fallback(
    mapped.total_charges_expl,
    sumAvailable(
      mapped.achats_march,
      mapped.var_stock_march,
      mapped.achats_mp,
      mapped.var_stock_mp,
      mapped.ace,
      mapped.impots_taxes,
      mapped.salaires,
      mapped.charges_soc,
      mapped.dap,
      mapped.dprov,
      mapped.autres_charges_expl
    )
  );
  mapped.res_net = fallback(mapped.res_net, mapped.resultat_exercice);
  mapped.resultat_exercice = fallback(mapped.resultat_exercice, mapped.res_net);
  mapped.n = fallback(mapped.n, 1);

  return mapped;
}

export function applyLegacyFinancialFactsToMappedData(
  mappedData: MappedFinancialData,
  legacyFacts: FinancialFacts
): MappedFinancialData {
  const next = { ...mappedData };

  next.total_prod_expl = fallback(next.total_prod_expl, legacyFacts.revenue);
  next.total_charges_expl = fallback(next.total_charges_expl, legacyFacts.expenses);
  next.salaires = fallback(next.salaires, legacyFacts.payroll);
  next.dispo = fallback(next.dispo, legacyFacts.treasury);
  next.creances = fallback(next.creances, legacyFacts.receivables);
  next.fournisseurs = fallback(next.fournisseurs, legacyFacts.payables);
  next.total_stocks = fallback(next.total_stocks, legacyFacts.inventory);

  return next;
}

export function mapMappedDataToFinancialFacts(mappedData: MappedFinancialData): FinancialFacts {
  return {
    revenue: mappedData.total_prod_expl,
    expenses: mappedData.total_charges_expl,
    payroll: sum(mappedData.salaires, mappedData.charges_soc),
    treasury: mappedData.dispo,
    receivables: mappedData.creances,
    payables: sum(mappedData.fournisseurs, mappedData.dettes_fisc_soc),
    inventory: mappedData.total_stocks
  };
}

function isMappedKey(value: string): value is keyof MappedFinancialData {
  return MAPPED_VARIABLE_KEYS.includes(value as keyof MappedFinancialData);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function mergeNumericMaps(target: Record<string, number>, source: Record<string, number>) {
  Object.entries(source).forEach(([key, value]) => {
    target[key] = (target[key] ?? 0) + value;
  });
}

function fallback(current: number | null, candidate: number | null): number | null {
  return current !== null ? current : candidate;
}

function sum(...values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) {
    return null;
  }
  const strictValues = values as number[];
  return strictValues.reduce((acc, value) => acc + value, 0);
}

function sumAvailable(...values: Array<number | null>): number | null {
  const presentValues = values.filter((value): value is number => value !== null);
  if (presentValues.length === 0) {
    return null;
  }
  return presentValues.reduce((acc, value) => acc + value, 0);
}
