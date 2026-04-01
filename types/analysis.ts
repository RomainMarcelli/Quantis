export type SupportedUploadType = "excel" | "pdf";

export type FileDescriptor = {
  name: string;
  mimeType: string;
  size: number;
  type: SupportedUploadType;
};

export type FinancialFacts = {
  revenue: number | null;
  expenses: number | null;
  payroll: number | null;
  treasury: number | null;
  receivables: number | null;
  payables: number | null;
  inventory: number | null;
};

export type RawAnalysisData = {
  byVariableCode: Record<string, number>;
  byLineCode: Record<string, number>;
  byLabel: Record<string, number>;
};

export type MappedFinancialData = {
  immob_incorp: number | null;
  immob_corp: number | null;
  immob_fin: number | null;
  total_actif_immo: number | null;
  total_actif_immo_brut: number | null;
  total_actif_immo_net: number | null;
  stocks_mp: number | null;
  stocks_march: number | null;
  total_stocks: number | null;
  avances_vers_actif: number | null;
  clients: number | null;
  autres_creances: number | null;
  creances: number | null;
  vmp: number | null;
  dispo: number | null;
  cca: number | null;
  total_actif_circ: number | null;
  total_actif: number | null;
  capital: number | null;
  ecarts_reeval: number | null;
  reserve_legale: number | null;
  reserves_reglem: number | null;
  autres_reserves: number | null;
  ran: number | null;
  res_net: number | null;
  subv_invest: number | null;
  prov_reglem: number | null;
  total_cp: number | null;
  total_prov: number | null;
  emprunts: number | null;
  avances_recues_passif: number | null;
  fournisseurs: number | null;
  dettes_fisc_soc: number | null;
  cca_passif: number | null;
  autres_dettes: number | null;
  pca: number | null;
  total_dettes: number | null;
  total_passif: number | null;
  ventes_march: number | null;
  prod_biens: number | null;
  prod_serv: number | null;
  prod_vendue: number | null;
  prod_stockee: number | null;
  prod_immo: number | null;
  subv_expl: number | null;
  autres_prod_expl: number | null;
  total_prod_expl: number | null;
  achats_march: number | null;
  var_stock_march: number | null;
  achats_mp: number | null;
  var_stock_mp: number | null;
  ace: number | null;
  impots_taxes: number | null;
  salaires: number | null;
  charges_soc: number | null;
  dap: number | null;
  dprov: number | null;
  autres_charges_expl: number | null;
  total_charges_expl: number | null;
  ebit: number | null;
  prod_fin: number | null;
  charges_fin: number | null;
  prod_excep: number | null;
  charges_excep: number | null;
  is_impot: number | null;
  resultat_exercice: number | null;
  ca_n_minus_1: number | null;
  n: number | null;
  delta_bfr: number | null;
};

export type ParsedMetric = {
  key: keyof FinancialFacts;
  label: string;
  value: number;
  confidence: "low" | "medium" | "high";
};

export type ParsedFileData = {
  fileName: string;
  fileType: SupportedUploadType;
  extractedAt: string;
  fiscalYear: number | null;
  metrics: ParsedMetric[];
  previewRows: Record<string, string | number | null>[];
  rawData: RawAnalysisData;
};

export type CalculatedKpis = {
  tcam: number | null;
  va: number | null;
  ebitda: number | null;
  ebe: number | null;
  marge_ebitda: number | null;
  charges_var: number | null;
  mscv: number | null;
  tmscv: number | null;
  ca: number | null;
  charges_fixes: number | null;
  point_mort: number | null;
  ratio_immo: number | null;
  ratio_immo_usure?: number | null;
  bfr: number | null;
  rot_bfr: number | null;
  dso: number | null;
  dpo: number | null;
  rot_stocks: number | null;
  caf: number | null;
  fte: number | null;
  tn: number | null;
  solvabilite: number | null;
  gearing: number | null;
  liq_gen: number | null;
  liq_red: number | null;
  liq_imm: number | null;
  disponibilites: number | null;
  roce: number | null;
  roe: number | null;
  effet_levier: number | null;
  resultat_net: number | null;
  grossMarginRate: number | null;
  netProfit: number | null;
  workingCapital: number | null;
  monthlyBurnRate: number | null;
  cashRunwayMonths: number | null;
  capacite_remboursement_annees: number | null;
  etat_materiel_indice: number | null;
  healthScore: number | null;
};

export type AnalysisRecord = {
  id: string;
  userId: string;
  folderName: string;
  createdAt: string;
  fiscalYear: number | null;
  sourceFiles: FileDescriptor[];
  parsedData: ParsedFileData[];
  rawData: RawAnalysisData;
  mappedData: MappedFinancialData;
  financialFacts: FinancialFacts;
  kpis: CalculatedKpis;
  quantisScore: {
    quantis_score: number;
    piliers: {
      rentabilite: number;
      solvabilite: number;
      liquidite: number;
      efficacite: number;
    };
    alerte_investissement: boolean;
  } | null;
  uploadContext: {
    companySize: string | null;
    sector: string | null;
    source: "dashboard" | "analysis" | "upload" | "manual";
  } | null;
};

export type NewAnalysisRecord = Omit<AnalysisRecord, "id">;
export type AnalysisDraft = Omit<AnalysisRecord, "id">;
