export type SupportedUploadType = "excel" | "pdf" | "fec";

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
  /** Solde créditeur du compte 4457 (TVA collectée sur ventes). Optionnel —
   *  alimenté uniquement par les sources ayant accès à la trial balance. */
  tva_collectee?: number | null;
  /** Solde débiteur du compte 4456 (TVA déductible sur achats). */
  tva_deductible?: number | null;
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
  /** TVA nette à reverser à l'État sur la période (4457 − 4456). Null si les
   *  soldes TVA ne sont pas dispos (sources sans trial balance, p.ex. PDF). */
  tva_a_payer?: number | null;
  /** Provision mensuelle de TVA à mettre de côté. Calculée depuis tva_a_payer
   *  divisé par le nombre de mois de la période (par défaut 12). */
  tva_provision_mensuelle?: number | null;
  /** Estimation IS à provisionner sur le résultat courant. Barème 2024 :
   *  15 % jusqu'à 42 500 €, 25 % au-delà. 0 si résultat ≤ 0. */
  provision_is?: number | null;
  /** Provision IS mensuelle (= provision_is / 12). */
  provision_is_mensuelle?: number | null;
  /** Ratio masse salariale (salaires + charges_soc) / CA × 100. Indicateur
   *  d'intensité main-d'œuvre — alimente les scénarios "analyse masse salariale"
   *  et "rémunération dirigeant". Optionnel pour ne pas casser les fixtures. */
  ratio_masse_salariale?: number | null;
};

export type AnalysisRecord = {
  id: string;
  userId: string;
  /**
   * Sprint A multi-tenant — rattache une analyse à une Company. Optionnel pour
   * rétrocompat avec les analyses pré-migration. Lu par le CompanySelector du
   * mode cabinet pour filtrer le cockpit au dossier actif (feature/cabinet-ux).
   */
  companyId?: string;
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
    vyzor_score: number;
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
  parserVersion?: "v1" | "v2";
  pdfType?: "native_text" | "scanned_text" | "image_only";
  // Extensions "donnée dynamique" (sync depuis logiciels comptables).
  // Présents uniquement quand sourceMetadata.type === "dynamic".
  // Le front continue de consommer mappedData/kpis/quantisScore comme avant ;
  // les champs ci-dessous sont des bonus ignorables sans casse.
  sourceMetadata?: import("@/types/connectors").SourceMetadata | null;
  granularInsights?: import("@/types/connectors").GranularInsights | null;
  kpisTimeSeries?: import("@/types/connectors").KpiTimeSeriesEntry[] | null;
  vatInsights?: import("@/types/connectors").VatInsights | null;
  // Nouveau format demandé par le PM : matière première pour les KPI calculés côté front.
  // Présents uniquement quand sourceMetadata.type === "dynamic". Drafts exclus de fait
  // (Pennylane n'émet d'écritures que pour les factures finalisées).
  dailyAccounting?: import("@/types/connectors").DailyAccountingEntry[] | null;
  balanceSheetSnapshot?: import("@/types/connectors").BalanceSheetSnapshot | null;
  /** Vue d'ensemble bancaire (Bridge / Open Banking). Optionnel — alimenté
   *  par /api/integrations/bridge/sync et indépendant du pipeline comptable.
   *  Voir types/banking.ts pour le détail. */
  bankingSummary?: import("@/types/banking").BankingSummary | null;
};

export type NewAnalysisRecord = Omit<AnalysisRecord, "id">;
export type AnalysisDraft = Omit<AnalysisRecord, "id">;
