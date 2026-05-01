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

export {
  BridgeClient,
  BridgeApiError,
  buildBridgeClientFromEnv,
} from "@/services/integrations/adapters/bridge/client";

export {
  fetchBridgeAccounts,
  fetchBridgeTransactions,
  fetchBridgeCategories,
  createBridgeUser,
  authenticateBridgeUser,
  createBridgeConnectSession,
} from "@/services/integrations/adapters/bridge/fetchers";

export type {
  BridgeRawAccount,
  BridgeRawTransaction,
  BridgeRawCategory,
  BridgeConnectSession,
  BridgeUser,
  BridgeUserToken,
} from "@/services/integrations/adapters/bridge/fetchers";

export {
  mapBridgeAccountToInternal,
  mapBridgeTransactionToInternal,
  aggregateTransactionsByMonth,
  computeBurnRate,
  computeRunway,
  groupByCategory,
  groupByOperationType,
} from "@/services/integrations/adapters/bridge/mappers";

export { buildBankingSummary } from "@/services/integrations/adapters/bridge/summaryBuilder";
