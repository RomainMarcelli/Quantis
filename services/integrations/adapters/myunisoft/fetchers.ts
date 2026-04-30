// Fetchers MyUnisoft v1 — un par entité.
//
// MyUnisoft renvoie typiquement des listes complètes sans pagination cursor (pour les
// référentiels comme journals/accounts) ou avec une pagination par page/limit.
// On adapte chaque fetcher en conséquence, et on retourne une AdapterSyncPage standard.
//
// IMPORTANT : les chemins exacts (`/entry`, `/account`, etc.) sont à confirmer au moment
// du test E2E avec une vraie clé. La doc partners.api.myunisoft.fr indique ces noms,
// mais des alternatives existent (/mad/entries, /mad/exercices). Ce fetcher utilise les
// chemins les plus probables et logge des warnings si la forme de réponse est inattendue.

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

// MyUnisoft pagination : si l'API supporte le cursor, on l'utilise via `?cursor=` ou
// `?page=`. Ce client accepte les deux ; pour les référentiels (journals, accounts),
// on présume qu'une seule page suffit. Pour les écritures, on paginera.
const PAGE_LIMIT = 200;

// ─── Journals ──────────────────────────────────────────────────────────────

export async function fetchJournals(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<Journal>> {
  // /diary est l'endpoint REST pour les journaux selon la doc partner ;
  // l'alternative MAD est /mad/journals à confirmer.
  const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftJournal>>(
    ctx.connection,
    "/diary",
    { query: cursor ? { cursor } : undefined }
  );
  const items = extractList(raw);
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  return {
    items: items.map((j) => mapJournal(j, mapperCtx)),
    // MyUnisoft ne retourne pas de cursor sur ces référentiels (à confirmer en E2E).
    nextCursor: null,
  };
}

// ─── Plan comptable ─────────────────────────────────────────────────────────

export async function fetchLedgerAccounts(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<LedgerAccount>> {
  const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftAccount>>(
    ctx.connection,
    "/account",
    { query: cursor ? { cursor } : undefined }
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
// MyUnisoft n'a pas d'endpoint `/contacts` ou `/customers` séparé : les contacts
// sont incrustés dans les comptes auxiliaires (racine 401, 404, 411). On refait donc
// l'appel `/account` et on filtre.

export async function fetchContacts(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<Contact>> {
  const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftAccount>>(
    ctx.connection,
    "/account",
    { query: cursor ? { cursor } : undefined }
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

export async function fetchAccountingEntries(
  ctx: AdapterSyncContext,
  cursor: string | null
): Promise<AdapterSyncPage<AccountingEntry>> {
  // Le filtre par période en mode initial est utile pour limiter le volume.
  // Le filtre updated_at_gteq pour le mode incrémental dépend du support MyUnisoft.
  const query: Record<string, string | number> = { limit: PAGE_LIMIT };
  if (cursor) query.cursor = cursor;
  if (ctx.mode === "initial") {
    query["date_from"] = ctx.periodStart.toISOString().slice(0, 10);
    query["date_to"] = ctx.periodEnd.toISOString().slice(0, 10);
  } else {
    // Incrémental : MyUnisoft expose probablement `updated_after` ou similaire.
    // À ajuster en E2E.
    query["updated_after"] = ctx.periodStart.toISOString();
  }

  const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftEntry>>(
    ctx.connection,
    "/entry",
    { query }
  );
  const items = extractList(raw);
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };

  // MyUnisoft inclut déjà les `movements[]` dans l'écriture → pas de N+1 nécessaire.
  return {
    items: items.map((e) => mapEntry(e, mapperCtx)),
    // À ajuster si l'API expose un cursor (à priori non sur cette route).
    nextCursor: null,
  };
}

// ─── Trial balance (balance générale) ──────────────────────────────────────

export async function fetchTrialBalance(
  connection: Connection,
  periodStart: Date,
  periodEnd: Date
): Promise<NormalizedTrialBalanceEntry[]> {
  // L'endpoint /balance accepte typiquement period_start/period_end ; à ajuster en E2E.
  const start = periodStart.toISOString().slice(0, 10);
  const end = periodEnd.toISOString().slice(0, 10);
  const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftBalanceEntry>>(
    connection,
    "/balance",
    { query: { date_from: start, date_to: end } }
  );
  const items = extractList(raw);
  return mapTrialBalance(items, periodStart, periodEnd);
}
