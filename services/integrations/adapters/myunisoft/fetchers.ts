// Fetchers MyUnisoft v1 — un par entité.
//
// Tous les endpoints utilisent le format MAD (MyUnisoft Accounting Data) :
//   - Préfixe : /mad/*
//   - Query param obligatoire : version=1.0.0 (auto-injecté par le client)
//   - Doc : https://github.com/MyUnisoft/api-partenaires/tree/main/docs/MAD/specs/v1.0.0
//
// Spécificités par endpoint :
//   - /mad/journals     : référentiel, pas de pagination (≈ 20 items observés)
//   - /mad/accounts     : référentiel, pas de pagination (≈ 2000 items observés)
//   - /mad/exercices    : référentiel, retourne les exercices ouverts
//   - /mad/entries      : requiert startDate + endDate (un exercice à la fois)
//   - /mad/balance      : requiert startDate + endDate + classAccount (1-9 PCG)
//
// Pour la balance complète, on itère sur les 9 classes PCG (1=capital, 2=immo,
// 3=stocks, 4=tiers, 5=trésorerie, 6=charges, 7=produits, 8=spéciaux, 9=analytique).

import {
  extractList,
  myUnisoftRequest,
  type MyUnisoftListResponse,
} from "@/services/integrations/adapters/myunisoft/client";
import {
  mapContactFromAccount,
  mapEntry,
  mapJournal,
  mapLedgerAccount,
  mapTrialBalance,
  type MyUnisoftAccount,
  type MyUnisoftBalanceEntry,
  type MyUnisoftEntry,
  type MyUnisoftJournal,
} from "@/services/integrations/adapters/myunisoft/mappers";
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

const PCG_CLASSES = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── Journals ──────────────────────────────────────────────────────────────

export async function fetchJournals(
  ctx: AdapterSyncContext,
  _cursor: string | null
): Promise<AdapterSyncPage<Journal>> {
  const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftJournal>>(
    ctx.connection,
    "/mad/journals"
  );
  const items = extractList(raw);
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
  const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftAccount>>(
    ctx.connection,
    "/mad/accounts"
  );
  const items = extractList(raw);
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  return {
    items: items.map((a) => mapLedgerAccount(a, mapperCtx)),
    nextCursor: null,
  };
}

// ─── Contacts (extraits des comptes 40x/41x avec `company`) ────────────────
//
// MyUnisoft n'a pas d'endpoint `/contacts` séparé : les contacts sont incrustés
// dans les comptes auxiliaires (racine 401, 404, 411). On refait l'appel
// /mad/accounts et on filtre côté mapper.

export async function fetchContacts(
  ctx: AdapterSyncContext,
  _cursor: string | null
): Promise<AdapterSyncPage<Contact>> {
  const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftAccount>>(
    ctx.connection,
    "/mad/accounts"
  );
  const items = extractList(raw);
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  const contacts: Contact[] = [];
  for (const acc of items) {
    const contact = mapContactFromAccount(acc, mapperCtx);
    if (contact) contacts.push(contact);
  }
  return { items: contacts, nextCursor: null };
}

// ─── Écritures comptables ──────────────────────────────────────────────────
//
// /mad/entries requiert un intervalle de dates (startDate + endDate au format
// YYYY-MM-DD) — pas de cursor de pagination, l'API retourne tout l'intervalle
// en une fois. En mode "incremental", on borne sur la fenêtre de mise à jour.

export async function fetchAccountingEntries(
  ctx: AdapterSyncContext,
  _cursor: string | null
): Promise<AdapterSyncPage<AccountingEntry>> {
  const startDate = toIsoDay(ctx.periodStart);
  const endDate = toIsoDay(ctx.periodEnd);

  const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftEntry>>(
    ctx.connection,
    "/mad/entries",
    { query: { startDate, endDate } }
  );
  const items = extractList(raw);
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };

  // Les `movements[]` sont déjà inclus dans chaque écriture → pas de N+1.
  return {
    items: items.map((e) => mapEntry(e, mapperCtx)),
    nextCursor: null,
  };
}

// ─── Trial balance (balance générale) ──────────────────────────────────────
//
// /mad/balance requiert un filtre classAccount (classe PCG 1-9). On itère sur
// les 8 premières classes (la 9 = analytique, hors balance comptable standard)
// pour récupérer le plan complet en une sync. Les classes vides retournent
// simplement [] sans erreur.

export async function fetchTrialBalance(
  connection: Connection,
  periodStart: Date,
  periodEnd: Date
): Promise<NormalizedTrialBalanceEntry[]> {
  const startDate = toIsoDay(periodStart);
  const endDate = toIsoDay(periodEnd);

  const allEntries: MyUnisoftBalanceEntry[] = [];
  for (const classAccount of PCG_CLASSES) {
    const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftBalanceEntry>>(
      connection,
      "/mad/balance",
      { query: { startDate, endDate, classAccount } }
    );
    allEntries.push(...extractList(raw));
  }

  return mapTrialBalance(allEntries, periodStart, periodEnd);
}
