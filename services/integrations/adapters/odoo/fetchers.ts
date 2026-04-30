// Fetchers Odoo — un par entité.
//
// Pattern : on fait des `search_read` sur les modèles Odoo. Pour les écritures,
// on fait 2 requêtes (account.move puis account.move.line) au lieu de N+1.
// Pour la trial balance, on fait un `read_group` aggrégé sur account.move.line.

import {
  odooReadGroup,
  odooSearchRead,
  type OdooDomain,
} from "@/services/integrations/adapters/odoo/client";
import {
  mapJournal,
  mapLedgerAccount,
  mapMove,
  mapPartner,
  mapTrialBalance,
  type OdooAccount,
  type OdooJournal,
  type OdooMove,
  type OdooMoveLine,
  type OdooMoveLineGroup,
  type OdooPartner,
} from "@/services/integrations/adapters/odoo/mappers";
import type {
  AccountingEntry,
  AdapterSyncContext,
  AdapterSyncPage,
  Connection,
  Contact,
  Journal,
  LedgerAccount,
  NormalizedTrialBalanceEntry,
} from "@/types/connectors";

const PAGE_LIMIT = 200;

// Cache local des comptes Odoo (par sync) pour résoudre les Many2one efficacement.
// Le `account_id` sur une ligne est `[id, "name"]`, mais on a besoin du `code` du
// compte → on construit une map id → OdooAccount lue une fois au début du sync.
async function fetchAllAccounts(connection: Connection): Promise<OdooAccount[]> {
  return odooSearchRead<OdooAccount>(connection, "account.account", {
    fields: ["id", "code", "name", "account_type", "active"],
    limit: 5000,
  });
}

function buildAccountMap(accounts: OdooAccount[]): Map<string, OdooAccount> {
  const map = new Map<string, OdooAccount>();
  for (const acc of accounts) {
    map.set(String(acc.id), acc);
  }
  return map;
}

// ─── Journals ──────────────────────────────────────────────────────────────

export async function fetchJournals(
  ctx: AdapterSyncContext,
  _cursor: string | null
): Promise<AdapterSyncPage<Journal>> {
  const items = await odooSearchRead<OdooJournal>(ctx.connection, "account.journal", {
    fields: ["id", "name", "code", "type", "active"],
    domain: [["active", "=", true]],
    limit: 200,
  });
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  return {
    items: items.map((j) => mapJournal(j, mapperCtx)),
    nextCursor: null,
  };
}

// ─── Plan comptable ─────────────────────────────────────────────────────────

export async function fetchLedgerAccounts(
  ctx: AdapterSyncContext,
  _cursor: string | null
): Promise<AdapterSyncPage<LedgerAccount>> {
  const items = await fetchAllAccounts(ctx.connection);
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  return {
    items: items.map((a) => mapLedgerAccount(a, mapperCtx)),
    nextCursor: null,
  };
}

// ─── Contacts (res.partner avec customer_rank>0 OR supplier_rank>0) ────────

export async function fetchContacts(
  ctx: AdapterSyncContext,
  _cursor: string | null
): Promise<AdapterSyncPage<Contact>> {
  // Domain : OR sur les deux ranks via le format Odoo "|" preceding two conditions.
  const domain: OdooDomain = [
    "|",
    ["customer_rank", ">", 0],
    ["supplier_rank", ">", 0],
  ];
  const items = await odooSearchRead<OdooPartner>(ctx.connection, "res.partner", {
    fields: [
      "id",
      "name",
      "email",
      "vat",
      "is_company",
      "customer_rank",
      "supplier_rank",
      "country_id",
      "industry_id",
      "create_date",
    ],
    domain,
    limit: 5000,
  });
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  const contacts: Contact[] = [];
  for (const partner of items) {
    const mapped = mapPartner(partner, mapperCtx);
    if (mapped) contacts.push(mapped);
  }
  return { items: contacts, nextCursor: null };
}

// ─── Écritures comptables (account.move + account.move.line) ──────────────

export async function fetchAccountingEntries(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<AccountingEntry>> {
  const offset = cursor ? Number(cursor) : 0;

  // 1. Récupérer toutes les écritures de la période.
  const domain: OdooDomain = [
    ["state", "=", "posted"],
    ["date", ">=", ctx.periodStart.toISOString().slice(0, 10)],
    ["date", "<=", ctx.periodEnd.toISOString().slice(0, 10)],
  ];
  const moves = await odooSearchRead<OdooMove>(ctx.connection, "account.move", {
    domain,
    fields: [
      "id",
      "name",
      "ref",
      "date",
      "journal_id",
      "state",
      "move_type",
      "amount_total",
      "currency_id",
      "line_ids",
      "partner_id",
    ],
    offset,
    limit: PAGE_LIMIT,
    order: "date asc, id asc",
  });

  if (moves.length === 0) {
    return { items: [], nextCursor: null };
  }

  // 2. Récupérer toutes les lignes en UNE seule requête.
  const allLineIds = moves.flatMap((m) => m.line_ids ?? []);
  const lines: OdooMoveLine[] =
    allLineIds.length > 0
      ? await odooSearchRead<OdooMoveLine>(ctx.connection, "account.move.line", {
          domain: [["id", "in", allLineIds]],
          fields: ["id", "move_id", "account_id", "partner_id", "name", "debit", "credit", "date"],
          limit: 5000,
        })
      : [];

  // 3. Map des comptes pour résoudre les codes.
  const accounts = await fetchAllAccounts(ctx.connection);
  const accountMap = buildAccountMap(accounts);

  // 4. Grouper les lignes par move_id.
  const linesByMoveId = new Map<number, OdooMoveLine[]>();
  for (const line of lines) {
    const moveTuple = Array.isArray(line.move_id) ? line.move_id[0] : null;
    if (typeof moveTuple !== "number") continue;
    const list = linesByMoveId.get(moveTuple) ?? [];
    list.push(line);
    linesByMoveId.set(moveTuple, list);
  }

  // 5. Mapper chaque écriture avec ses lignes.
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  const items = moves.map((m) =>
    mapMove(m, linesByMoveId.get(m.id) ?? [], accountMap, mapperCtx)
  );

  // Pagination via offset (Odoo pas de cursor natif).
  const nextCursor = moves.length === PAGE_LIMIT ? String(offset + PAGE_LIMIT) : null;
  return { items, nextCursor };
}

// ─── Trial balance via read_group sur account.move.line ────────────────────

export async function fetchTrialBalance(
  connection: Connection,
  periodStart: Date,
  periodEnd: Date
): Promise<NormalizedTrialBalanceEntry[]> {
  // Aggrège debit/credit par compte sur la période demandée.
  const domain: OdooDomain = [
    ["parent_state", "=", "posted"],
    ["date", ">=", periodStart.toISOString().slice(0, 10)],
    ["date", "<=", periodEnd.toISOString().slice(0, 10)],
  ];
  const groups = await odooReadGroup<OdooMoveLineGroup>(connection, "account.move.line", {
    domain,
    fields: ["debit:sum", "credit:sum"],
    groupby: ["account_id"],
  });

  const accounts = await fetchAllAccounts(connection);
  const accountMap = buildAccountMap(accounts);
  return mapTrialBalance(groups, accountMap, periodStart, periodEnd);
}
