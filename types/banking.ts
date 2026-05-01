// File: types/banking.ts
// Role: types pour la couche Open Banking (Bridge). Volontairement disjoints
// des types comptables (`MappedFinancialData`, `CalculatedKpis`) parce qu'on
// ne fait PAS de mapping vers le PCG ni vers les KPI 2033-SD : la donnée
// bancaire est une source complémentaire (cash temps réel, flux, runway)
// qui se superpose à l'analyse comptable sans la remplacer.
//
// Voir docs/AI_ARCHITECTURE.md (à étendre) pour le positionnement Bridge ↔
// Pennylane/FEC : Bridge = layer "banking", compta = layer "accounting".

/** Type de compte bancaire normalisé. Regroupe les valeurs Bridge variées
 *  ("checking", "savings", "loan", "credit_card"…) en 5 buckets stables côté
 *  produit. "other" = fallback pour tout ce qui ne tombe pas dans les 4
 *  premiers (épargne salariale, livret pro non standard, etc.). */
export type BankAccountType = "checking" | "savings" | "loan" | "card" | "other";

/** Type d'opération côté banque. "unknown" = Bridge n'a pas pu classer. */
export type BankOperationType =
  | "card"
  | "transfer"
  | "direct_debit"
  | "check"
  | "withdrawal"
  | "deposit"
  | "unknown";

/** Statut runway : seuils 6 / 12 mois alignés avec le KPI cashRunwayMonths
 *  comptable existant (cf. lib/kpi/kpiRegistry.ts). */
export type BankingRunwayStatus = "safe" | "warning" | "critical";

/**
 * Compte bancaire normalisé. `bridgeAccountId` est conservé pour le diff lors
 * de la sync incrémentale (matcher les comptes existants par ID externe et
 * mettre à jour le solde + lastRefreshedAt).
 */
export type BankAccount = {
  /** ID interne Vyzor (uuid v4 au sync). */
  id: string;
  /** ID Bridge — sert de clé d'unicité externe. */
  bridgeAccountId: number;
  name: string;
  type: BankAccountType;
  /** Solde courant en devise du compte. Positif pour les comptes débiteurs
   *  (checking/savings), négatif pour les loans/cards consommés. */
  balance: number;
  /** Code ISO 4217 (EUR, USD…). */
  currency: string;
  /** IBAN si Bridge l'expose. Optionnel — certains comptes (cartes) n'en ont pas. */
  iban?: string;
  /** Nom affiché de la banque (ex. "BNP Paribas", "Crédit Agricole"). */
  providerName: string;
  /** ISO timestamp du dernier rafraîchissement Bridge. */
  lastRefreshedAt: string;
};

/**
 * Transaction bancaire normalisée.
 *
 * Convention de signe : `amount` POSITIF = argent qui ENTRE sur le compte
 * (encaissement, virement reçu), NÉGATIF = argent qui SORT (paiement carte,
 * prélèvement). Cette convention est cohérente avec le standard PSD2/Bridge
 * et facilite les calculs de flux nets sans devoir tenir un sens par
 * `operationType`.
 */
export type BankTransaction = {
  id: string;
  bridgeTransactionId: number;
  /** ID interne Vyzor du compte rattaché. */
  accountId: string;
  amount: number;
  /** Date de l'opération côté banque (YYYY-MM-DD). */
  date: string;
  /** Description nettoyée par Bridge — version utilisable côté UI. */
  description: string;
  /** Description brute fournisseur — utile pour debug si la clean est cassée. */
  rawDescription?: string;
  operationType: BankOperationType;
  /** ID catégorie Bridge (taxonomie ~80 entrées : food, transport, salary…). */
  categoryId: number;
  /** True si la transaction est une opération PROGRAMMÉE (prélèvement futur,
   *  virement planifié) — utile pour la section "À venir" du dashboard. */
  isFuture: boolean;
};

/** Flux mensuel agrégé — total des entrées vs sorties + solde net. */
export type MonthlyFlow = {
  /** YYYY-MM. */
  month: string;
  totalIn: number;
  totalOut: number;
  /** = totalIn − |totalOut| (totalOut est >= 0 par convention d'agrégation). */
  netFlow: number;
};

/** Catégorie de dépense agrégée. */
export type CategoryAggregate = {
  categoryId: number;
  categoryLabel: string;
  /** Total absolu des sorties pour cette catégorie sur la période. */
  total: number;
  count: number;
};

/** Type d'opération agrégé. */
export type OperationTypeAggregate = {
  type: BankOperationType;
  total: number;
  count: number;
};

/**
 * Vue d'ensemble bancaire stockée côté analyse Firestore (à côté de
 * `dailyAccounting` / `balanceSheetSnapshot`). Recalculée à chaque sync.
 * Les agrégats lourds (monthlyFlows, topExpenseCategories) sont précalculés
 * pour éviter une boucle sur N transactions au render.
 */
/**
 * Point de l'historique du solde total (reconstruit "à reculons" depuis le
 * solde courant en appliquant les flux nets mensuels). Sert au sparkline de
 * la hero card Trésorerie. ⚠️ Approximation : ne tient pas compte des comptes
 * fermés/ouverts en cours de période (acceptable pour un MVP visuel).
 */
export type BalanceHistoryPoint = {
  /** YYYY-MM. */
  month: string;
  /** Solde total estimé en fin de mois. */
  totalBalance: number;
};

/**
 * Vue d'ensemble bancaire stockée côté analyse Firestore (à côté de
 * `dailyAccounting` / `balanceSheetSnapshot`). Recalculée à chaque sync.
 * Les agrégats lourds (monthlyFlows, topExpenseCategories) sont précalculés
 * pour éviter une boucle sur N transactions au render.
 */
export type BankingSummary = {
  accounts: BankAccount[];
  /** Somme des soldes — devises mélangées non gérées (MVP : tout en EUR). */
  totalBalance: number;
  /** Burn rate : moyenne des sorties net sur les N derniers jours.
   *  Si net positif (l'entreprise génère du cash), `daily`/`monthly` = 0. */
  burnRate: { daily: number; monthly: number };
  runway: { months: number; status: BankingRunwayStatus };
  /** Top 5 catégories de dépenses sur la période (sorted desc). */
  topExpenseCategories: CategoryAggregate[];
  /** 12 derniers mois max — pour le mini-graph flux entrées/sorties. */
  monthlyFlows: MonthlyFlow[];
  /** Historique reconstruit du solde total (6-12 derniers mois). Pour la
   *  sparkline de la hero card Trésorerie. */
  balanceHistory: BalanceHistoryPoint[];
  /** Transactions des 90 derniers jours (passées + futures). Permet
   *  d'alimenter la vue Transactions sans re-fetch Bridge à chaque ouverture
   *  de l'onglet. Borné pour ne pas exploser le doc Firestore. */
  recentTransactions: BankTransaction[];
  /** Transactions futures (prélèvements programmés / virements planifiés). */
  upcomingTransactions: BankTransaction[];
  /** ISO timestamp de la dernière sync Bridge réussie. */
  lastSyncAt: string;
};
