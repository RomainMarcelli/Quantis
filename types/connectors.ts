// Modèle de données interne unifié pour les intégrations comptables.
// Pensé dès Phase 1 (Pennylane direct) pour rester compatible avec Phase 2 (Chift) et Phase 3 (Bridge).
// Les adaptateurs par source convertissent leurs payloads vers ce modèle, qui est le seul stocké en base.

import type { CalculatedKpis, MappedFinancialData } from "@/types/analysis";

// ─────────────────────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectorProvider = "pennylane" | "chift" | "bridge" | "myunisoft" | "odoo";

// "providerSub" précise le logiciel sous-jacent quand on passe par une API unifiée
// (Chift) ou bancaire (Bridge). null pour Pennylane direct.
export type ConnectorProviderSub =
  | null
  | "pennylane_company"
  | "pennylane_firm"
  | "sage_50_fr"
  | "sage_100"
  | "sage_generation_experts"
  | "cegid_loop"
  | "cegid_quadra"
  | "myunisoft"
  | "tiime"
  | "acd"
  | "horus"
  | "inqom"
  | "fulll"
  | string; // banques pour Bridge — open enum

// ─────────────────────────────────────────────────────────────────────────────
// Authentification — 3 modes supportés
// ─────────────────────────────────────────────────────────────────────────────

// Company Token : généré par l'utilisateur dans son compte Pennylane,
// nous est fourni par copier-coller. Pas d'expiration tant qu'il n'est pas révoqué.
export type CompanyTokenAuth = {
  mode: "company_token";
  accessToken: string;
  externalCompanyId: string;
};

// Firm Token : équivalent pour les cabinets comptables.
export type FirmTokenAuth = {
  mode: "firm_token";
  accessToken: string;
  externalFirmId: string;
};

// OAuth 2.0 : pour intégrateurs (Pennylane partnerships) et Chift/Bridge.
export type OAuth2Auth = {
  mode: "oauth2";
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null; // ISO
  scopes: string[];
  externalCompanyId: string;
};

// Partner JWT : modèle MyUnisoft. Auth = clé partenaire fixe (env var côté serveur)
// + JWT par cabinet/société (stocké chiffré dans la connection).
export type PartnerJwtAuth = {
  mode: "partner_jwt";
  accessToken: string; // JWT du cabinet/société
  externalCompanyId: string; // ID interne MyUnisoft de la société
  // X-Third-Party-Secret partenaire = lu depuis l'env (MYUNISOFT_PARTNER_SECRET).
};

// Odoo : auth par instance (URL dynamique) + login + API key (ou password).
// Le `accessToken` chiffré stocke l'API key uniquement. Les autres champs
// (instanceUrl, database, login) sont stockés en clair sur la ConnectionRecord
// car non-secrets — utiles pour identifier visuellement la connection.
export type OdooSessionAuth = {
  mode: "odoo_session";
  accessToken: string; // API key Odoo (ou mot de passe — traité identiquement)
  instanceUrl: string; // ex: https://acme.odoo.com
  database: string; // nom de la base (ex: acme)
  login: string; // email de l'utilisateur Odoo
  externalCompanyId: string; // = login (pour cohérence avec le champ existant)
};

export type ConnectorAuth =
  | CompanyTokenAuth
  | FirmTokenAuth
  | OAuth2Auth
  | PartnerJwtAuth
  | OdooSessionAuth;

// ─────────────────────────────────────────────────────────────────────────────
// Connection — une instance de connexion utilisateur ↔ provider ↔ entreprise
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectionStatus = "active" | "expired" | "error" | "revoked";

export type SyncCursor = {
  // Pour la pagination (cursor-based) lors du fetch en cours.
  paginationCursor: string | null;
  // Pour la sync incrémentale : timestamp ISO du dernier sync abouti.
  lastSyncedAt: string | null;
};

export type ConnectionSyncCursors = {
  entries: SyncCursor;
  invoices: SyncCursor;
  ledgerAccounts: SyncCursor;
  contacts: SyncCursor;
  journals: SyncCursor;
  bankTransactions: SyncCursor;
};

// Stocké en Firestore — version persistée (tokens chiffrés)
export type ConnectionRecord = {
  id: string;
  userId: string;
  /**
   * Sprint A multi-tenant — rattache une Connection à une Company.
   * Ajouté par la migration users-to-companies (16/05/2026). Optionnel
   * sur le TYPE pour rétrocompat ascendante avec les connections
   * historiques sans companyId (ne devrait plus exister en prod après
   * la migration, mais on garde le `?` pour la robustesse).
   *
   * Sprint B : la contrainte d'unicité passe de (userId, provider) à
   * (companyId, provider) — un user peut désormais avoir N Connections
   * actives à condition que chaque ciblage Company soit distinct.
   */
  companyId?: string;
  provider: ConnectorProvider;
  providerSub: ConnectorProviderSub;
  status: ConnectionStatus;
  authMode: ConnectorAuth["mode"];
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  // Aperçu du token original (premiers + derniers caractères) pour identification utilisateur.
  // Utile sur l'écran de gestion des connections pour distinguer plusieurs tokens.
  // Pas un secret — juste un masque visuel ; le token complet reste chiffré.
  tokenPreview: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  externalCompanyId: string;
  externalFirmId: string | null;
  // Champs spécifiques Odoo (non secrets, en clair). Null pour les autres providers.
  odooInstanceUrl: string | null;
  odooDatabase: string | null;
  odooLogin: string | null;
  syncCursors: ConnectionSyncCursors;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "failed" | "in_progress" | "partial" | "never";
  lastSyncError: string | null;
  createdAt: string;
};

// Version "déchiffrée" utilisée en mémoire pendant un sync
export type Connection = Omit<
  ConnectionRecord,
  "encryptedAccessToken" | "encryptedRefreshToken"
> & {
  auth: ConnectorAuth;
};

// ─────────────────────────────────────────────────────────────────────────────
// Modèle métier normalisé — entités comptables
// Chaque entité stocke `rawData` (payload brut du provider) pour debug et migrations.
// ─────────────────────────────────────────────────────────────────────────────

export type EntityBase = {
  id: string;
  userId: string;
  connectionId: string;
  externalId: string;
  // "fec" pour les écritures parsées depuis un FEC uploadé (mêmes agrégateurs).
  source: ConnectorProvider | "fec";
  providerSub: ConnectorProviderSub;
  syncedAt: string;
  rawData: Record<string, unknown>;
};

// ─── Journal (livre-journal) ──────────────────────────────────────────────────
// `type` est laissé en string ouvert : chaque provider (Pennylane, Chift, etc.) expose
// ses propres types ("sales", "purchases", "bank", "loans", "general", "social"…).
// On préserve la valeur native du provider pour ne rien perdre au passage.
export type Journal = EntityBase & {
  code: string;
  label: string;
  type: string;
};

// ─── Plan comptable ──────────────────────────────────────────────────────────
export type LedgerAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "unknown";

export type LedgerAccount = EntityBase & {
  number: string; // numéro PCG (ex. "411", "707000")
  label: string;
  type: LedgerAccountType;
};

// ─── Contact (client ou fournisseur) ─────────────────────────────────────────
export type Contact = EntityBase & {
  type: "customer" | "supplier";
  name: string;
  legalName: string | null;
  siret: string | null;
  vatNumber: string | null;
  email: string | null;
  sector: string | null; // code NAF ou libellé selon disponibilité
  countryCode: string | null;
  createdAtExternal: string | null; // ISO, pour détecter les nouveaux clients
};

// ─── Écriture comptable + lignes ─────────────────────────────────────────────
export type AccountingEntryStatus = "draft" | "posted" | "cancelled" | "unknown";

export type AccountingEntryLine = {
  externalId: string | null;
  accountNumber: string;
  accountLabel: string | null;
  debit: number;
  credit: number;
  currency: string;
  vatRate: number | null;
  description: string | null;
  analyticalCodes: string[];
  contactExternalId: string | null;
};

export type AccountingEntry = EntityBase & {
  journalCode: string;
  date: string; // ISO
  label: string;
  reference: string | null;
  status: AccountingEntryStatus;
  totalDebit: number;
  totalCredit: number;
  currency: string;
  lines: AccountingEntryLine[];
};

// ─── Facture + lignes ────────────────────────────────────────────────────────
export type InvoiceStatus =
  | "draft"
  | "finalized"
  | "sent"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "cancelled"
  | "unknown";

export type InvoiceLine = {
  externalId: string | null;
  productExternalId: string | null;
  label: string;
  quantity: number;
  unitPriceExclVat: number;
  amountExclVat: number;
  amountInclVat: number;
  vatRate: number | null;
};

export type Invoice = EntityBase & {
  type: "customer" | "supplier";
  number: string;
  date: string; // ISO
  dueDate: string | null;
  paidDate: string | null;
  totalExclVat: number;
  totalInclVat: number;
  totalVat: number;
  currency: string;
  status: InvoiceStatus;
  contactExternalId: string;
  contactName: string;
  lines: InvoiceLine[];
};

// ─── Transaction bancaire (Phase 3 — Bridge) ─────────────────────────────────
export type BankAccount = EntityBase & {
  bankName: string;
  iban: string | null;
  accountType: "current" | "savings" | "securities" | "unknown";
  currency: string;
  currentBalance: number | null;
};

export type BankTransaction = EntityBase & {
  bankAccountExternalId: string;
  date: string;
  amount: number; // signé : positif = entrée
  currency: string;
  labelRaw: string;
  labelClean: string | null;
  category: string | null;
  subcategory: string | null;
  matchedEntryId: string | null; // pour rapprochement bancaire futur
};

// ─────────────────────────────────────────────────────────────────────────────
// Vues agrégées (calculées à partir des entités stockées)
// ─────────────────────────────────────────────────────────────────────────────

export type ConcentrationStats = {
  top5Share: number;
  top10Share: number;
  hhi: number;
};

export type CustomerStat = {
  contactId: string;
  externalId: string;
  name: string;
  siret: string | null;
  sector: string | null;
  revenue: number;
  share: number;
  invoicesCount: number;
};

export type SupplierStat = {
  contactId: string;
  externalId: string;
  name: string;
  totalPurchases: number;
  share: number;
  invoicesCount: number;
};

export type ProductStat = {
  externalId: string;
  label: string;
  category: string | null;
  revenue: number;
  share: number;
  quantitySold: number;
};

export type SectorBreakdownEntry = {
  sector: string;
  revenue: number;
  share: number;
  customerCount: number;
};

export type RevenueTimelineEntry = {
  month: string; // "YYYY-MM"
  totalRevenue: number;
  topCustomersShare: number;
};

export type OverdueInvoiceSummary = {
  invoiceId: string;
  contactId: string;
  contactName: string;
  amount: number;
  daysOverdue: number;
};

export type GranularInsights = {
  customers: {
    total: number;
    topByRevenue: CustomerStat[];
    concentration: ConcentrationStats;
    sectorBreakdown: SectorBreakdownEntry[];
    newCount: number;
    churnedCount: number;
  };
  products: {
    topByRevenue: ProductStat[];
    categoryBreakdown: Array<{ category: string; revenue: number; share: number }>;
  };
  revenueTimeline: RevenueTimelineEntry[];
  receivables: {
    totalOutstanding: number;
    overdueCount: number;
    overdueAmount: number;
    averageDSO: number | null;
    topOverdue: OverdueInvoiceSummary[];
  };
  suppliers: {
    topByPurchase: SupplierStat[];
    concentration: ConcentrationStats;
  };
  payables: {
    totalOutstanding: number;
    overdueCount: number;
    averageDPO: number | null;
  };
  cashflow: {
    monthlyInflow: Array<{ month: string; amount: number }>;
    monthlyOutflow: Array<{ month: string; amount: number }>;
    bankBalance: number | null;
  } | null;
};

export type KpiTimeSeriesEntry = {
  periodStart: string;
  periodEnd: string;
  label: string;
  granularity: "month" | "quarter";
  mappedData: MappedFinancialData;
  kpis: CalculatedKpis;
};

export type VatPeriodicity = "monthly" | "quarterly" | "annual" | "unknown";

export type VatPeriodEntry = {
  periodStart: string;
  periodEnd: string;
  label: string;
  collected: number;
  deductible: number;
  due: number;
  declared: boolean;
  paid: boolean;
};

export type VatInsights = {
  periodicity: VatPeriodicity;
  periods: VatPeriodEntry[];
  totalCollected: number;
  totalDeductible: number;
  totalDue: number;
  outstandingDue: number;
};

export type SourceMetadata = {
  type: "static" | "dynamic";
  // "fec" pour les uploads de fichiers FEC parsés vers le format unifié
  // (mêmes agrégateurs que les adapters dynamiques → mêmes variable codes 2033-SD).
  provider: ConnectorProvider | "upload" | "fec";
  providerSub: ConnectorProviderSub;
  connectionId: string | null;
  syncedAt: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
};

// ─── Variable codes 2033-SD (mêmes que MappedFinancialData) ──────────────
// Le front a déjà ses formules basées sur ces codes ; on les fournit directement
// pour qu'il n'ait aucun mapping à faire.

// Compte de résultat — flux ; valeur signée dans la direction naturelle
// (positif = produit pour les comptes de produits, positif = charge pour les charges).
export type PnlVariableCode =
  | "ventes_march"
  | "prod_biens"
  | "prod_serv"
  | "prod_vendue"
  | "prod_stockee"
  | "prod_immo"
  | "subv_expl"
  | "autres_prod_expl"
  | "total_prod_expl"
  | "achats_march"
  | "var_stock_march"
  | "achats_mp"
  | "var_stock_mp"
  | "ace"
  | "impots_taxes"
  | "salaires"
  | "charges_soc"
  | "dap"
  | "dprov"
  | "autres_charges_expl"
  | "total_charges_expl"
  | "ebit"
  | "prod_fin"
  | "charges_fin"
  | "prod_excep"
  | "charges_excep"
  | "is_impot"
  | "resultat_exercice";

// Bilan — soldes cumulés ; valeur positive dans la direction naturelle
// (actif positif quand débiteur, passif positif quand créditeur).
export type BalanceSheetVariableCode =
  // Actif
  | "immob_incorp"
  | "immob_corp"
  | "immob_fin"
  | "total_actif_immo"
  | "stocks_mp"
  | "stocks_march"
  | "total_stocks"
  | "avances_vers_actif"
  | "clients"
  | "autres_creances"
  | "creances"
  | "vmp"
  | "dispo"
  | "cca"
  | "total_actif_circ"
  | "total_actif"
  // Passif
  | "capital"
  | "ecarts_reeval"
  | "reserve_legale"
  | "reserves_reglem"
  | "autres_reserves"
  | "ran"
  | "res_net"
  | "subv_invest"
  | "prov_reglem"
  | "total_cp"
  | "total_prov"
  | "emprunts"
  | "avances_recues_passif"
  | "fournisseurs"
  | "dettes_fisc_soc"
  | "cca_passif"
  | "autres_dettes"
  | "pca"
  | "total_dettes"
  | "total_passif"
  // TVA — soldes des comptes 4457 (collectée) et 4456 (déductible). Sortis
  // du regroupement générique "dettes_fisc_soc" pour pouvoir calculer la TVA
  // nette à reverser sans confondre avec les autres impôts/charges sociales.
  | "tva_collectee"
  | "tva_deductible";

// ─── Données comptables agrégées par jour (consommé par le front) ──────────
// Pour chaque jour où il y a au moins une écriture, on fournit les variables 2033-SD
// du compte de résultat (flux du jour). Le front choisit sa granularité d'agrégation
// (jour / semaine / mois / trimestre / année) et ses propres formules KPI.
//
// Drafts exclus de fait : Pennylane n'émet d'écritures comptables que pour les
// factures finalisées. Les drafts ne génèrent pas de mouvements et ne polluent
// donc pas l'agrégation.

export type DailyAccountingEntry = {
  date: string; // "YYYY-MM-DD"
  values: Record<PnlVariableCode, number>;
  entryCount: number;
  /**
   * Solde cumulé des comptes de trésorerie (classe 5 hors 519) à la fin
   * du jour. Permet à `recomputeKpisForPeriod` d'exposer un
   * `disponibilites` dynamique : on prend le `cashBalance` du dernier
   * jour ≤ periodEnd plutôt que la valeur snapshot annuelle figée.
   *
   * Optionnel (rétrocompat) : les analyses synchronisées avant le
   * câblage de ce champ n'ont pas la valeur ; les consommateurs doivent
   * fallback sur `mappedData.dispo`.
   */
  cashBalance?: number;
};

// ─── Snapshot bilan (dernière date connue) ─────────────────────────────────
// Soldes cumulés par variable 2033-SD du bilan, à la dernière date de sync.
// Source : trial_balance (Pennylane). Pas un historique — uniquement le dernier état connu.

export type BalanceSheetSnapshot = {
  asOfDate: string; // "YYYY-MM-DD" — fin de période (= dernier sync)
  periodStart: string; // "YYYY-MM-DD" — début de la période d'agrégation
  values: Record<BalanceSheetVariableCode, number>;
};

// ─── Trial balance (balance générale) ───────────────────────────────────────
// Réponse unifiée d'un endpoint type `/trial_balance?period_start=...&period_end=...`.
// Chaque entrée représente un compte du PCG avec ses totaux débit/crédit pour la période.
export type NormalizedTrialBalanceEntry = {
  accountNumber: string;       // ex. "401", "411", "607001"
  accountLabel: string;
  formattedNumber: string | null; // version 9-digit Pennylane (sinon null)
  debit: number;
  credit: number;
  periodStart: string;         // ISO
  periodEnd: string;           // ISO
};

// ─────────────────────────────────────────────────────────────────────────────
// Adapter — contrat que doit implémenter chaque source (Pennylane, Chift, Bridge)
// ─────────────────────────────────────────────────────────────────────────────

export type SyncMode = "initial" | "incremental";

export type AdapterSyncContext = {
  connection: Connection;
  mode: SyncMode;
  periodStart: Date;
  periodEnd: Date;
};

// Le résultat d'une page de sync — l'adaptateur peut être appelé plusieurs fois
// si la pagination n'est pas terminée.
export type AdapterSyncPage<T> = {
  items: T[];
  nextCursor: string | null;
};

// Contrat adaptateur. Chaque méthode est optionnelle car certains providers
// ne couvrent pas toutes les entités (Bridge ne ramène pas d'écritures, par ex.).
export interface IntegrationAdapter {
  readonly provider: ConnectorProvider;

  // Vérifie/rafraîchit l'authentification ; renvoie une Connection à jour.
  authenticate(connection: Connection): Promise<Connection>;

  fetchJournals?(ctx: AdapterSyncContext, cursor: string | null): Promise<AdapterSyncPage<Journal>>;
  fetchLedgerAccounts?(
    ctx: AdapterSyncContext,
    cursor: string | null
  ): Promise<AdapterSyncPage<LedgerAccount>>;
  fetchContacts?(
    ctx: AdapterSyncContext,
    cursor: string | null
  ): Promise<AdapterSyncPage<Contact>>;
  fetchAccountingEntries?(
    ctx: AdapterSyncContext,
    cursor: string | null
  ): Promise<AdapterSyncPage<AccountingEntry>>;
  fetchInvoices?(
    ctx: AdapterSyncContext,
    cursor: string | null
  ): Promise<AdapterSyncPage<Invoice>>;
  fetchBankAccounts?(
    ctx: AdapterSyncContext,
    cursor: string | null
  ): Promise<AdapterSyncPage<BankAccount>>;
  fetchBankTransactions?(
    ctx: AdapterSyncContext,
    cursor: string | null
  ): Promise<AdapterSyncPage<BankTransaction>>;

  // Trial balance (balance générale) — récupération en un coup pour une période donnée.
  // Hors du flux de pagination car c'est un rapport agrégé et non une liste d'entités.
  // Donne le P&L et le bilan en une requête → utilisé en priorité par buildAnalysisFromSync.
  fetchTrialBalance?(
    connection: Connection,
    periodStart: Date,
    periodEnd: Date
  ): Promise<NormalizedTrialBalanceEntry[]>;
}
