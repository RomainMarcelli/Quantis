// Orchestrateur post-sync : agrège les entités persistées en un AnalysisDraft complet
// (mappedData + KPI + Vyzor Score + insights granulaires + time series + VAT) puis
// l'écrit dans la collection "analyses".
//
// Appelé à la fin de runSync() pour matérialiser les données fraîches dans le format que
// le front consomme déjà (AnalysisRecord).

import { computeKpis } from "@/services/kpiEngine";
import { calculateVyzorScore } from "@/lib/vyzorScore";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { mapMappedDataToFinancialFacts } from "@/services/mapping/financialDataMapper";
import { aggregateEntriesToParsedFinancialData } from "@/services/integrations/aggregations/pcgAggregator";
import { aggregateTrialBalanceToParsedFinancialData } from "@/services/integrations/aggregations/trialBalanceAggregator";
import { buildGranularInsights } from "@/services/integrations/aggregations/granularInsightsBuilder";
import { buildKpisTimeSeries } from "@/services/integrations/aggregations/kpisTimeSeriesBuilder";
import { buildVatInsights } from "@/services/integrations/aggregations/vatInsightsBuilder";
import { buildDailyAccounting } from "@/services/integrations/aggregations/dailyAccountingBuilder";
import { buildBalanceSheetSnapshot } from "@/services/integrations/aggregations/balanceSheetSnapshotBuilder";
import type { NormalizedTrialBalanceEntry } from "@/types/connectors";
import { getAdapter } from "@/services/integrations/adapters/registry";
import { getUserConnectionById } from "@/services/integrations/storage/connectionStore";
import {
  listAccountingEntriesByConnection,
  listContactsByConnection,
  listInvoicesByConnection,
} from "@/services/integrations/storage/entityStore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import type { AnalysisDraft } from "@/types/analysis";

const ANALYSES_COLLECTION = "analyses";

export type BuildAnalysisOptions = {
  userId: string;
  connectionId: string;
  periodStart: Date;
  periodEnd: Date;
  // Folder où ranger l'analyse (par défaut un dossier dédié au provider).
  folderName?: string;
};

export type BuildAnalysisResult = {
  analysisId: string;
  fiscalYear: number | null;
  trialBalanceUsed: boolean;
};

export async function buildAndPersistAnalysisFromSync(
  options: BuildAnalysisOptions
): Promise<BuildAnalysisResult> {
  const connection = await getUserConnectionById(options.userId, options.connectionId);
  if (!connection) {
    throw new Error(`Connection ${options.connectionId} introuvable.`);
  }

  // ─── 1. Charger les entités synchronisées ────────────────────────────────
  const [entries, invoices, contacts] = await Promise.all([
    listAccountingEntriesByConnection(options.userId, options.connectionId),
    listInvoicesByConnection(options.userId, options.connectionId),
    listContactsByConnection(options.userId, options.connectionId),
  ]);

  // ─── 2. ParsedFinancialData : trial balance en priorité, fallback sur entries ──
  // Trial balance = balance générale (debits/credits cumulés par compte synthétique pour
  // la période). Plus précis que les entries pour le bilan car inclut l'à-nouveau côté Pennylane.
  // Si l'API trial_balance échoue ou n'est pas dispo, on retombe sur l'agrégation entries.
  const previousPeriodStart = new Date(options.periodStart);
  const periodLengthMs = options.periodEnd.getTime() - options.periodStart.getTime();
  previousPeriodStart.setTime(options.periodStart.getTime() - periodLengthMs);
  const previousPeriodEnd = new Date(options.periodStart.getTime() - 1);

  // Fallback (défaut) : agrégation entries.
  let parsedFinancialData = aggregateEntriesToParsedFinancialData(entries, {
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    previousPeriodStart,
    previousPeriodEnd,
  });
  let trialBalanceUsed = false;
  // On garde la trial balance brute pour pouvoir construire le snapshot bilan plus bas.
  let lastTrialBalance: NormalizedTrialBalanceEntry[] | null = null;
  // Tout adapter qui implémente fetchTrialBalance bénéficie de cette voie privilégiée
  // (Pennylane, MyUnisoft…). Pour les autres, fallback sur l'agrégation entries.
  const adapter = getAdapter(connection.provider);
  if (adapter?.fetchTrialBalance) {
    try {
      const trialBalance = await adapter.fetchTrialBalance(
        connection,
        options.periodStart,
        options.periodEnd
      );
      if (trialBalance.length > 0) {
        lastTrialBalance = trialBalance;
        const tbData = aggregateTrialBalanceToParsedFinancialData(trialBalance);
        // Préserver netTurnoverPreviousYear calculé par les entries — la trial balance
        // d'une seule période ne le donne pas (sinon il faudrait un 2e appel API N-1).
        const prevYearTurnover = parsedFinancialData.incomeStatement.netTurnoverPreviousYear;
        parsedFinancialData = tbData;
        if (prevYearTurnover !== null && prevYearTurnover !== 0) {
          parsedFinancialData.incomeStatement.netTurnoverPreviousYear = prevYearTurnover;
        }
        trialBalanceUsed = true;
      }
    } catch (err) {
      console.warn(
        "[buildAnalysisFromSync] trial_balance fetch a échoué, fallback sur entries:",
        err instanceof Error ? err.message : "unknown"
      );
    }
  }

  // ─── 3. Réutiliser la chaîne existante : bridge → mappedData → KPI → score
  // On calcule le snapshot AVANT computeKpis pour pouvoir hydrater mappedData
  // avec les soldes TVA (tva_collectee / tva_deductible) — sans ce câblage,
  // computeKpis ne pourrait pas calculer tva_a_payer (cf. KPI Synthèse cockpit).
  const balanceSheetSnapshot = lastTrialBalance
    ? buildBalanceSheetSnapshot(
        lastTrialBalance,
        options.periodEnd.toISOString().slice(0, 10),
        options.periodStart.toISOString().slice(0, 10)
      )
    : null;

  const mappedDataRaw = mapParsedFinancialDataToMappedFinancialData(parsedFinancialData);
  const mappedData = balanceSheetSnapshot
    ? {
        ...mappedDataRaw,
        tva_collectee: balanceSheetSnapshot.values.tva_collectee,
        tva_deductible: balanceSheetSnapshot.values.tva_deductible,
      }
    : mappedDataRaw;
  const kpis = computeKpis(mappedData);
  const quantisScore = calculateVyzorScore(kpis);
  const financialFacts = mapMappedDataToFinancialFacts(mappedData);

  // ─── 4. Insights granulaires + time series + VAT ──────────────────────────
  const granularInsights = buildGranularInsights({
    invoices,
    contacts,
    options: { periodStart: options.periodStart, periodEnd: options.periodEnd },
  });

  const kpisTimeSeries = buildKpisTimeSeries({
    entries,
    options: { periodStart: options.periodStart, periodEnd: options.periodEnd },
  });

  const vatInsights = buildVatInsights({
    entries,
    options: { periodStart: options.periodStart, periodEnd: options.periodEnd },
  });

  // ─── 4 bis. Nouveau format demandé par le PM (Option 1 additif) ──────────
  // Matière première à destination du front : daily accounting + bilan snapshot.
  // Le snapshot lui-même est calculé en amont (étape 3) pour pouvoir hydrater
  // mappedData avec les soldes TVA avant le passage par computeKpis.
  const dailyAccounting = buildDailyAccounting(entries);

  // ─── 5. Construire l'AnalysisDraft ───────────────────────────────────────
  const fiscalYear = options.periodEnd.getFullYear();
  const folderName = options.folderName?.trim() || `Sync ${connection.provider}`;

  const draft: AnalysisDraft = {
    userId: options.userId,
    folderName,
    createdAt: new Date().toISOString(),
    fiscalYear,
    sourceFiles: [],
    parsedData: [],
    rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} },
    mappedData,
    financialFacts,
    kpis,
    quantisScore,
    uploadContext: {
      companySize: null,
      sector: null,
      source: "manual",
    },
    sourceMetadata: {
      type: "dynamic",
      provider: connection.provider,
      providerSub: connection.providerSub,
      connectionId: connection.id,
      syncedAt: new Date().toISOString(),
      periodStart: options.periodStart.toISOString(),
      periodEnd: options.periodEnd.toISOString(),
      currency: "EUR",
    },
    granularInsights,
    kpisTimeSeries,
    vatInsights,
    dailyAccounting,
    balanceSheetSnapshot,
  };

  // ─── 6. Persister dans Firestore via Admin SDK ───────────────────────────
  // (analysisStore.ts utilise le client SDK qui n'a pas de contexte auth côté serveur)
  const db = getFirebaseAdminFirestore();
  const docRef = await db.collection(ANALYSES_COLLECTION).add({
    ...draft,
    createdAt: Timestamp.fromDate(new Date(draft.createdAt)),
  });

  return { analysisId: docRef.id, fiscalYear, trialBalanceUsed };
}
