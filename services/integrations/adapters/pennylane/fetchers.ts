// Fetchers Pennylane v2 — un par entité.
// Chaque fetcher retourne une page (cursor-based) du modèle interne.
// Utilisé par le sync orchestrator qui pilote la pagination + la persistance.

import {
  pennylaneFetchPage,
  pennylaneRequest,
  type PennylanePage,
} from "@/services/integrations/adapters/pennylane/client";
import {
  mapContact,
  mapCustomerInvoice,
  mapJournal,
  mapLedgerAccount,
  mapLedgerEntry,
  mapSupplierInvoice,
  type PennylaneCustomer,
  type PennylaneCustomerInvoice,
  type PennylaneJournal,
  type PennylaneLedgerAccount,
  type PennylaneLedgerEntry,
  type PennylaneSupplier,
  type PennylaneSupplierInvoice,
} from "@/services/integrations/adapters/pennylane/mappers";
import type {
  AccountingEntry,
  AdapterSyncContext,
  AdapterSyncPage,
  Connection,
  Contact,
  Invoice,
  Journal,
  LedgerAccount,
  NormalizedTrialBalanceEntry,
} from "@/types/connectors";

const PAGE_SIZE = 100;

// Pennylane v2 attend `filter` en JSON URL-encodé : un array de { field, operator, value }.
// Format : ?filter=[{"field":"date","operator":"gteq","value":"2026-01-01"}]
//
// Trois familles d'entités :
//  - "static"        : journals — petit volume, on refetch en entier à chaque sync.
//  - "entity"        : customers, suppliers, products, ledger_accounts — petit volume
//                      (quelques centaines max). Pennylane v2 N'AUTORISE PAS `updated_at`
//                      sur ces endpoints (allowlist : `id, customer_type, ledger_account_id,
//                      name, external_reference, reg_no, emails` côté /customers ; allowlist
//                      analogue côté /suppliers et /ledger_accounts). On refetch donc le
//                      référentiel en entier — coût acceptable, pas de drift de données.
//  - "transactional" : invoices, ledger_entries — gros volume.
//                      Pennylane v2 N'AUTORISE PAS `updated_at` sur
//                      /ledger_entries non plus (allowlist : `id, date,
//                      journal_id`). On utilise donc UNIQUEMENT `date`
//                      pour borner :
//                        - mode initial : `date` ∈ [periodStart, periodEnd]
//                        - mode incremental : `date` ≥ periodStart (=
//                          lastSyncAt-buffer). Trade-off : on ne rattrape
//                          PAS les vieilles écritures back-datées par
//                          le comptable, mais on évite les 400 et on
//                          couvre 99% des cas.
//
// Exporté pour permettre un test unitaire ciblé sur la construction du filtre
// (cas régressé en prod : 400 Pennylane sur /customers et /ledger_entries).
export function buildFilters(
  ctx: AdapterSyncContext,
  kind: "static" | "entity" | "transactional"
): Record<string, string | undefined> {
  const filters: Array<{ field: string; operator: string; value: string }> = [];

  if (kind === "transactional") {
    filters.push({
      field: "date",
      operator: "gteq",
      value: ctx.periodStart.toISOString().slice(0, 10),
    });
    if (ctx.mode === "initial") {
      filters.push({
        field: "date",
        operator: "lteq",
        value: ctx.periodEnd.toISOString().slice(0, 10),
      });
    }
    // Mode incrémental : on ne pose pas de borne haute pour rattraper toutes
    // les écritures saisies depuis lastSyncAt jusqu'à aujourd'hui.
  }
  // "static" et "entity" → pas de filtre. Refetch full à chaque sync.

  if (filters.length === 0) return {};
  return { filter: JSON.stringify(filters) };
}

function toAdapterPage<TInternal>(
  page: PennylanePage<unknown>,
  mapper: (raw: never) => TInternal
): AdapterSyncPage<TInternal> {
  return {
    items: page.items.map((item) => mapper(item as never)),
    nextCursor: page.nextCursor,
  };
}

// ─── Journals ───────────────────────────────────────────────────────────────

export async function fetchJournals(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<Journal>> {
  const page = await pennylaneFetchPage<PennylaneJournal>(
    ctx.connection,
    "/journals",
    { limit: PAGE_SIZE },
    cursor,
    ctx.targetCompanyId
  );
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  return toAdapterPage(page, (raw) => mapJournal(raw as PennylaneJournal, mapperCtx));
}

// ─── Plan comptable ─────────────────────────────────────────────────────────

export async function fetchLedgerAccounts(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<LedgerAccount>> {
  const page = await pennylaneFetchPage<PennylaneLedgerAccount>(
    ctx.connection,
    "/ledger_accounts",
    { limit: PAGE_SIZE },
    cursor,
    ctx.targetCompanyId
  );
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  return toAdapterPage(page, (raw) => mapLedgerAccount(raw as PennylaneLedgerAccount, mapperCtx));
}

// ─── Contacts (customers + suppliers) ───────────────────────────────────────
// Pennylane expose deux endpoints distincts. On privilégie deux fetchers internes
// puis l'orchestrateur les concatène.

export async function fetchCustomers(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<Contact>> {
  const page = await pennylaneFetchPage<PennylaneCustomer>(
    ctx.connection,
    "/customers",
    { limit: PAGE_SIZE, ...buildFilters(ctx, "entity") },
    cursor,
    ctx.targetCompanyId
  );
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  return toAdapterPage(page, (raw) => mapContact(raw as PennylaneCustomer, "customer", mapperCtx));
}

export async function fetchSuppliers(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<Contact>> {
  const page = await pennylaneFetchPage<PennylaneSupplier>(
    ctx.connection,
    "/suppliers",
    { limit: PAGE_SIZE, ...buildFilters(ctx, "entity") },
    cursor,
    ctx.targetCompanyId
  );
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  return toAdapterPage(page, (raw) => mapContact(raw as PennylaneSupplier, "supplier", mapperCtx));
}

// Wrapper unifié exposé via l'adaptateur (alterne customers puis suppliers).
// Le cursor encode la phase : "customers:<cursor>" ou "suppliers:<cursor>" ou null pour démarrer.
export async function fetchContacts(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<Contact>> {
  if (cursor === null || cursor.startsWith("customers:")) {
    const subCursor = cursor === null ? null : cursor.slice("customers:".length) || null;
    const page = await fetchCustomers(ctx, subCursor);
    if (page.nextCursor) {
      return { items: page.items, nextCursor: `customers:${page.nextCursor}` };
    }
    // Customers terminés — on bascule sur suppliers à la prochaine itération.
    return { items: page.items, nextCursor: "suppliers:" };
  }
  // Phase suppliers.
  const subCursor = cursor.slice("suppliers:".length) || null;
  const page = await fetchSuppliers(ctx, subCursor);
  return {
    items: page.items,
    nextCursor: page.nextCursor ? `suppliers:${page.nextCursor}` : null,
  };
}

// ─── Factures ───────────────────────────────────────────────────────────────

export async function fetchCustomerInvoices(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<Invoice>> {
  const page = await pennylaneFetchPage<PennylaneCustomerInvoice>(
    ctx.connection,
    "/customer_invoices",
    { limit: PAGE_SIZE, ...buildFilters(ctx, "transactional") },
    cursor,
    ctx.targetCompanyId
  );
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  return toAdapterPage(page, (raw) =>
    mapCustomerInvoice(raw as PennylaneCustomerInvoice, mapperCtx)
  );
}

export async function fetchSupplierInvoices(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<Invoice>> {
  const page = await pennylaneFetchPage<PennylaneSupplierInvoice>(
    ctx.connection,
    "/supplier_invoices",
    { limit: PAGE_SIZE, ...buildFilters(ctx, "transactional") },
    cursor,
    ctx.targetCompanyId
  );
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  return toAdapterPage(page, (raw) =>
    mapSupplierInvoice(raw as PennylaneSupplierInvoice, mapperCtx)
  );
}

// Idem que pour les contacts : on multiplexe customer_invoices et supplier_invoices.
export async function fetchInvoices(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<Invoice>> {
  if (cursor === null || cursor.startsWith("customers:")) {
    const subCursor = cursor === null ? null : cursor.slice("customers:".length) || null;
    const page = await fetchCustomerInvoices(ctx, subCursor);
    if (page.nextCursor) {
      return { items: page.items, nextCursor: `customers:${page.nextCursor}` };
    }
    return { items: page.items, nextCursor: "suppliers:" };
  }
  const subCursor = cursor.slice("suppliers:".length) || null;
  const page = await fetchSupplierInvoices(ctx, subCursor);
  return {
    items: page.items,
    nextCursor: page.nextCursor ? `suppliers:${page.nextCursor}` : null,
  };
}

// ─── Écritures comptables ───────────────────────────────────────────────────
// Pennylane v2 n'expose les `ledger_entry_lines` QUE dans la vue détail.
// La vue liste ne renvoie que id+date+label+journal — on fait donc un GET détail
// par entrée en parallèle. Coût : N+1 requêtes par page, atténué par le batch parallel.

export async function fetchAccountingEntries(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<AccountingEntry>> {
  const page = await pennylaneFetchPage<PennylaneLedgerEntry>(
    ctx.connection,
    "/ledger_entries",
    { limit: PAGE_SIZE, ...buildFilters(ctx, "transactional") },
    cursor,
    ctx.targetCompanyId
  );
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };

  // Enrichir chaque entrée avec les lignes (vue détail).
  const detailedItems = await Promise.all(
    page.items.map(async (item) => {
      try {
        const detail = await pennylaneRequest<PennylaneLedgerEntry>(
          ctx.connection,
          `/ledger_entries/${item.id}`
        );
        return detail;
      } catch {
        // Fallback : on garde l'item liste sans lignes plutôt que de tout faire échouer.
        return item;
      }
    })
  );

  return {
    items: detailedItems.map((raw) => mapLedgerEntry(raw, mapperCtx)),
    nextCursor: page.nextCursor,
  };
}

// ─── Trial balance (balance générale) ──────────────────────────────────────
// GET /trial_balance?period_start=YYYY-MM-DD&period_end=YYYY-MM-DD
// Retourne les comptes synthétiques agrégés (ex. "401" rassemble 401100xxx).
// Réponse : { items: [{number, label, debits, credits, formatted_number}], next_cursor }
// On gère la pagination même si en pratique le résultat tient en 1 page.

type PennylaneTrialBalanceItem = {
  number: string;
  label?: string;
  formatted_number?: string;
  debits?: string | number;
  credits?: string | number;
};

export async function fetchTrialBalance(
  connection: Connection,
  periodStart: Date,
  periodEnd: Date,
  /** Sprint B — cible un dossier précis pour les Connections Firm. */
  targetCompanyId?: string
): Promise<NormalizedTrialBalanceEntry[]> {
  const start = periodStart.toISOString().slice(0, 10);
  const end = periodEnd.toISOString().slice(0, 10);
  const all: NormalizedTrialBalanceEntry[] = [];
  let cursor: string | null = null;

  for (let i = 0; i < 50; i++) {
    const page: PennylanePage<PennylaneTrialBalanceItem> = await pennylaneFetchPage<PennylaneTrialBalanceItem>(
      connection,
      "/trial_balance",
      { period_start: start, period_end: end, limit: 200 },
      cursor,
      targetCompanyId
    );
    for (const item of page.items) {
      all.push({
        accountNumber: String(item.number ?? ""),
        accountLabel: item.label ?? "",
        formattedNumber: item.formatted_number ?? null,
        debit: typeof item.debits === "string" ? Number(item.debits) || 0 : (item.debits ?? 0),
        credit: typeof item.credits === "string" ? Number(item.credits) || 0 : (item.credits ?? 0),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
    }
    cursor = page.nextCursor;
    if (!cursor) break;
  }

  return all;
}
