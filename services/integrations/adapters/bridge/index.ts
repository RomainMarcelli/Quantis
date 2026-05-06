// Barrel — point d'entrée unique pour l'adaptateur Bridge.
//
// Note : Bridge ne s'enregistre PAS dans le `registry` des adaptateurs
// comptables (services/integrations/adapters/registry.ts) car il ne fournit
// pas d'écritures comptables (PnL/bilan/trial balance). C'est une source de
// donnée bancaire complémentaire — le registry comptable resterait pollué
// avec un adapter qui n'implémente pas `fetchTrialBalance` ni `fetchEntries`.
//
// Le pipeline Bridge a sa propre route dédiée (POST /api/integrations/bridge/sync)
// qui appelle directement `buildBankingSummary` ci-dessous, sans passer par
// `buildAndPersistAnalysisFromSync`.
//
// Imports relatifs (pas d'alias `@/…`) pour que les scripts CLI lancés via
// `npx tsx` résolvent correctement le barrel sans plugin tsconfig-paths.

export { BridgeClient, BridgeApiError, buildBridgeClientFromEnv } from "./client";

export {
  fetchBridgeAccounts,
  fetchBridgeTransactions,
  fetchBridgeCategories,
  createBridgeUser,
  authenticateBridgeUser,
  createBridgeConnectSession,
} from "./fetchers";

export type {
  BridgeRawAccount,
  BridgeRawTransaction,
  BridgeRawCategory,
  BridgeConnectSession,
  BridgeUser,
  BridgeUserToken,
} from "./fetchers";

export {
  mapBridgeAccountToInternal,
  mapBridgeTransactionToInternal,
  aggregateTransactionsByMonth,
  computeBurnRate,
  computeRunway,
  groupByCategory,
  groupByOperationType,
} from "./mappers";

export { buildBankingSummary } from "./summaryBuilder";
