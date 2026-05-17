// Orchestrateur de sync — pilote l'adaptateur, paginate, persiste, gère les cursors.
// Appelé par /api/integrations/[provider]/sync.
//
// Pour Phase 1, sync synchrone : la requête HTTP attend la fin du sync.
// Si la durée devient un problème (PDF longs côté Pennylane sur de gros volumes), on basculera
// vers un job queue Vercel Cron + statut polling. Pas la priorité maintenant.

import { ADAPTER_REGISTRY } from "@/services/integrations/adapters/registry";
import {
  getUserConnectionById,
  updateConnectionStatus,
  updateSyncCursor,
  updateSyncStatus,
} from "@/services/integrations/storage/connectionStore";
import {
  upsertAccountingEntries,
  upsertBankAccounts,
  upsertBankTransactions,
  upsertContacts,
  upsertInvoices,
  upsertJournals,
  upsertLedgerAccounts,
} from "@/services/integrations/storage/entityStore";
import type {
  AccountingEntry,
  AdapterSyncContext,
  AdapterSyncPage,
  BankAccount,
  BankTransaction,
  Connection,
  ConnectionSyncCursors,
  Contact,
  IntegrationAdapter,
  Invoice,
  Journal,
  LedgerAccount,
  SyncMode,
} from "@/types/connectors";

// 36 mois = 3 ans en arrière. Justification : un trial_balance Pennylane ne
// rembobine pas les "soldes reportés à nouveau" — il ne contient que les
// mouvements DE la période. Si on prenait 12 mois, l'apport en capital, les
// emprunts et la trésorerie initiale d'avant la fenêtre seraient absents du
// bilan synchronisé. 36 mois couvre l'historique typique d'une PME française.
//
// Exporté pour que les routes API (`pennylane/sync`, `myunisoft/sync`,
// `odoo/sync`) qui matérialisent une analyse via `buildAndPersistAnalysisFromSync`
// utilisent la même fenêtre que le sync orchestrator lui-même — pas de
// désynchronisation des deux étages.
export const DEFAULT_INITIAL_PERIOD_MONTHS = 36;
const MAX_PAGES_PER_ENTITY = 200; // sécurité anti-boucle infinie
const DEFAULT_GLOBAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — couvre 99% des syncs réels

export type SyncOptions = {
  mode?: SyncMode;
  // Pour mode "initial" : surcharger la période. Par défaut = 12 derniers mois.
  periodStart?: Date;
  periodEnd?: Date;
  // Timeout global du sync. Les passes terminées sont conservées (cursors persistés),
  // les passes en cours abandonnées génèrent un statut "partial".
  timeoutMs?: number;
  /**
   * Sprint B (cf. audit-sprint-B Q4) — cible un dossier précis pour les
   * Connections Firm OAuth multi-dossiers. Propagé au ctx adapter qui
   * le transmet aux fetchers Pennylane via `?company_id=X`.
   *
   * Pour les Connections Company / token manuel, laisser undefined (le
   * token est déjà scopé à un dossier unique).
   */
  targetCompanyId?: string;
};

export type EntitySyncReport = {
  entity: keyof ConnectionSyncCursors;
  pagesFetched: number;
  itemsPersisted: number;
  durationMs: number;
  error: string | null;
};

export type SyncReport = {
  connectionId: string;
  provider: Connection["provider"];
  mode: SyncMode;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  entities: EntitySyncReport[];
  error: string | null;
  status: "success" | "partial" | "failed";
  timedOut: boolean;
};

export async function runSync(params: {
  userId: string;
  connectionId: string;
  options?: SyncOptions;
}): Promise<SyncReport> {
  const startedAt = new Date();
  const start = Date.now();

  const connection = await getUserConnectionById(params.userId, params.connectionId);
  if (!connection) {
    throw new Error(`Connection ${params.connectionId} introuvable pour user ${params.userId}.`);
  }

  const adapter = ADAPTER_REGISTRY[connection.provider];
  if (!adapter) {
    throw new Error(`Aucun adaptateur disponible pour ${connection.provider} (Phase ultérieure).`);
  }

  const mode: SyncMode = params.options?.mode ?? (connection.lastSyncAt ? "incremental" : "initial");
  const { periodStart, periodEnd } = resolvePeriod(connection, mode, params.options);

  await updateSyncStatus(connection.id, "in_progress");

  let refreshedConnection: Connection;
  try {
    refreshedConnection = await adapter.authenticate(connection);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "auth failed";
    await updateSyncStatus(connection.id, "failed", `Auth: ${msg}`);
    await updateConnectionStatus(connection.id, "expired", `Auth: ${msg}`);
    throw error;
  }

  const ctx: AdapterSyncContext = {
    connection: refreshedConnection,
    mode,
    periodStart,
    periodEnd,
    // Sprint B : si l'option est fournie, on cible un dossier précis.
    // Propagé jusqu'aux fetchers Pennylane qui injectent ?company_id=X.
    targetCompanyId: params.options?.targetCompanyId,
  };

  const entities: EntitySyncReport[] = [];
  let firstError: string | null = null;
  let timedOut = false;
  const timeoutMs = params.options?.timeoutMs ?? DEFAULT_GLOBAL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  // Ordre logique : journals + ledger_accounts d'abord (référentiels statiques),
  // puis contacts, puis entries + invoices (qui référencent les précédents).
  // Phase 1 Pennylane : pas de bank_*. Reste défensif.
  const passes: Array<{
    key: keyof ConnectionSyncCursors;
    fetcher: ((ctx: AdapterSyncContext, cursor: string | null) => Promise<AdapterSyncPage<unknown>>) | undefined;
    persist: (items: unknown[]) => Promise<unknown[]>;
  }> = [
    {
      key: "journals",
      fetcher: adapter.fetchJournals as typeof passes[number]["fetcher"],
      persist: (items) => upsertJournals(items as Journal[]),
    },
    {
      key: "ledgerAccounts",
      fetcher: adapter.fetchLedgerAccounts as typeof passes[number]["fetcher"],
      persist: (items) => upsertLedgerAccounts(items as LedgerAccount[]),
    },
    {
      key: "contacts",
      fetcher: adapter.fetchContacts as typeof passes[number]["fetcher"],
      persist: (items) => upsertContacts(items as Contact[]),
    },
    {
      key: "entries",
      fetcher: adapter.fetchAccountingEntries as typeof passes[number]["fetcher"],
      persist: (items) => upsertAccountingEntries(items as AccountingEntry[]),
    },
    {
      key: "invoices",
      fetcher: adapter.fetchInvoices as typeof passes[number]["fetcher"],
      persist: (items) => upsertInvoices(items as Invoice[]),
    },
    {
      key: "bankTransactions",
      fetcher: adapter.fetchBankTransactions as typeof passes[number]["fetcher"],
      persist: (items) => upsertBankTransactions(items as BankTransaction[]),
    },
  ];

  // bank_accounts vient avant bank_transactions logiquement ; on l'ajoute si l'adapter l'expose.
  if (adapter.fetchBankAccounts) {
    passes.splice(passes.length - 1, 0, {
      key: "bankTransactions", // pas de cursor dédié pour bank_accounts ; on partage
      fetcher: adapter.fetchBankAccounts as typeof passes[number]["fetcher"],
      persist: (items) => upsertBankAccounts(items as BankAccount[]),
    });
  }

  for (const pass of passes) {
    if (!pass.fetcher) {
      continue;
    }
    if (Date.now() >= deadline) {
      timedOut = true;
      // Marquer comme "non traité" les passes restantes pour le rapport.
      entities.push({
        entity: pass.key,
        pagesFetched: 0,
        itemsPersisted: 0,
        durationMs: 0,
        error: "Timeout global atteint avant le démarrage de cette passe",
      });
      continue;
    }
    const remainingMs = deadline - Date.now();
    const report = await runEntitySync({
      connectionId: connection.id,
      ctx,
      entityKey: pass.key,
      fetcher: pass.fetcher,
      persist: pass.persist,
      initialCursor: connection.syncCursors[pass.key].paginationCursor,
      deadline,
    });
    entities.push(report);
    if (report.error && !firstError) {
      firstError = `${pass.key}: ${report.error}`;
    }
    // Si l'entity a été interrompue par le timeout local, propager au global.
    if (Date.now() >= deadline) {
      timedOut = true;
    }
    void remainingMs;
  }

  const finishedAt = new Date();
  const durationMs = Date.now() - start;

  // Calcul du statut final.
  const successfulEntities = entities.filter((e) => !e.error);
  let status: SyncReport["status"];
  if (successfulEntities.length === 0) {
    status = "failed";
  } else if (firstError || timedOut) {
    status = "partial";
  } else {
    status = "success";
  }

  await updateSyncStatus(
    connection.id,
    status === "success" ? "success" : status === "partial" ? "partial" : "failed",
    firstError ?? (timedOut ? "Sync interrompu par timeout global" : null)
  );

  return {
    connectionId: connection.id,
    provider: connection.provider,
    mode,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    entities,
    error: firstError,
    status,
    timedOut,
  };
}

// ─── Sprint B : sync multi-dossiers pour les Connections Firm ──────────────

/**
 * Rapport d'un sync Firm sur N Companies. Une Connection Firm sait
 * accéder à plusieurs dossiers ; on lance un `runSync` par dossier en
 * parallèle bornée (Promise.allSettled), et on agrège.
 *
 * Si une Company échoue, on continue avec les autres — l'utilisateur
 * voit un rapport global `partial` plutôt qu'un sync entièrement KO.
 */
export type FirmSyncReport = {
  connectionId: string;
  totalCompanies: number;
  succeeded: number;
  failed: number;
  perCompany: Array<{
    companyId: string;
    externalCompanyId: string;
    status: "success" | "partial" | "failed";
    error: string | null;
  }>;
};

/**
 * Lance un sync sur TOUTES les Companies actives mappées à une
 * Connection Firm. Itère via `connection_companies` (mappings actifs),
 * appelle `runSync` avec un `targetCompanyId` injecté pour chaque,
 * et agrège les résultats.
 *
 * Pour les Connections non-Firm (Company token / OAuth Company), il
 * est INUTILE d'appeler ce helper — utilisez `runSync` directement.
 */
export async function runSyncForFirmConnection(params: {
  userId: string;
  connectionId: string;
  options?: SyncOptions;
}): Promise<FirmSyncReport> {
  // Import dynamique pour éviter le cycle services/companies →
  // services/integrations/sync (Sprint B câblage progressif).
  const { listMappingsForConnection } = await import(
    "@/services/companies/connectionCompanyStore"
  );
  const mappings = await listMappingsForConnection(params.connectionId);

  if (mappings.length === 0) {
    console.warn(
      `[runSyncForFirmConnection] connection=${params.connectionId} ` +
        "n'a aucun mapping actif vers une Company. Aucun sync lancé."
    );
    return {
      connectionId: params.connectionId,
      totalCompanies: 0,
      succeeded: 0,
      failed: 0,
      perCompany: [],
    };
  }

  console.info(
    `[runSyncForFirmConnection] connection=${params.connectionId} → ${mappings.length} ` +
      "Companies à syncer en parallèle"
  );

  // Promise.allSettled : un échec sur une Company n'interrompt pas les
  // autres. Acceptable car chaque sync écrit sa propre Company isolée.
  const results = await Promise.allSettled(
    mappings.map((mapping) =>
      runSync({
        userId: params.userId,
        connectionId: params.connectionId,
        options: {
          ...params.options,
          targetCompanyId: mapping.externalCompanyId,
        },
      }).then((report) => ({ mapping, report }))
    )
  );

  const perCompany: FirmSyncReport["perCompany"] = [];
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    const mapping = mappings[i]!;
    const r = results[i]!;
    if (r.status === "fulfilled") {
      const { report } = r.value;
      const isOk = report.status === "success" || report.status === "partial";
      if (isOk) succeeded += 1;
      else failed += 1;
      perCompany.push({
        companyId: mapping.companyId,
        externalCompanyId: mapping.externalCompanyId,
        status: report.status,
        error: report.error,
      });
      console.info(
        `[runSyncForFirmConnection] company=${mapping.companyId} (ext=${mapping.externalCompanyId}) ` +
          `status=${report.status}` +
          (report.error ? ` error="${report.error.slice(0, 120)}"` : "")
      );
    } else {
      failed += 1;
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      perCompany.push({
        companyId: mapping.companyId,
        externalCompanyId: mapping.externalCompanyId,
        status: "failed",
        error: msg,
      });
      console.error(
        `[runSyncForFirmConnection] company=${mapping.companyId} (ext=${mapping.externalCompanyId}) ` +
          `FAILED: ${msg}`
      );
    }
  }

  return {
    connectionId: params.connectionId,
    totalCompanies: mappings.length,
    succeeded,
    failed,
    perCompany,
  };
}

function resolvePeriod(
  connection: Connection,
  mode: SyncMode,
  options: SyncOptions | undefined
): { periodStart: Date; periodEnd: Date } {
  if (options?.periodStart && options?.periodEnd) {
    return { periodStart: options.periodStart, periodEnd: options.periodEnd };
  }
  const periodEnd = options?.periodEnd ?? new Date();
  if (mode === "incremental" && connection.lastSyncAt) {
    return {
      periodStart: new Date(connection.lastSyncAt),
      periodEnd,
    };
  }
  // Initial : 12 derniers mois glissants par défaut (cf. décision produit).
  const periodStart = options?.periodStart ?? new Date();
  if (!options?.periodStart) {
    periodStart.setMonth(periodStart.getMonth() - DEFAULT_INITIAL_PERIOD_MONTHS);
  }
  return { periodStart, periodEnd };
}

async function runEntitySync(params: {
  connectionId: string;
  ctx: AdapterSyncContext;
  entityKey: keyof ConnectionSyncCursors;
  fetcher: (ctx: AdapterSyncContext, cursor: string | null) => Promise<AdapterSyncPage<unknown>>;
  persist: (items: unknown[]) => Promise<unknown[]>;
  initialCursor: string | null;
  deadline: number;
}): Promise<EntitySyncReport> {
  const start = Date.now();
  let cursor = params.initialCursor;
  let pagesFetched = 0;
  let itemsPersisted = 0;

  try {
    for (let i = 0; i < MAX_PAGES_PER_ENTITY; i++) {
      // Check du deadline global avant chaque page — préserve le cursor déjà persisté.
      if (Date.now() >= params.deadline) {
        return {
          entity: params.entityKey,
          pagesFetched,
          itemsPersisted,
          durationMs: Date.now() - start,
          error: `Deadline atteint après ${pagesFetched} pages (cursor préservé pour reprise)`,
        };
      }
      const page = await params.fetcher(params.ctx, cursor);
      pagesFetched++;
      if (page.items.length > 0) {
        await params.persist(page.items);
        itemsPersisted += page.items.length;
      }
      cursor = page.nextCursor;
      // Persister le cursor à chaque page → reprise sur incident.
      await updateSyncCursor(params.connectionId, params.entityKey, {
        paginationCursor: cursor,
        lastSyncedAt: cursor === null ? new Date().toISOString() : null,
      });
      if (cursor === null) break;
    }
  } catch (error) {
    // Le cursor de la dernière page traitée est déjà persisté → la prochaine
    // exécution reprendra exactement à partir de là.
    return {
      entity: params.entityKey,
      pagesFetched,
      itemsPersisted,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }

  // Si on est sorti par la limite de pages, on signale.
  if (cursor !== null) {
    return {
      entity: params.entityKey,
      pagesFetched,
      itemsPersisted,
      durationMs: Date.now() - start,
      error: `Pagination interrompue après ${MAX_PAGES_PER_ENTITY} pages — cursor non vide`,
    };
  }

  return {
    entity: params.entityKey,
    pagesFetched,
    itemsPersisted,
    durationMs: Date.now() - start,
    error: null,
  };
}
