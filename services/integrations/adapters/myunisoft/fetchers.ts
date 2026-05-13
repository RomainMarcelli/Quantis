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
//   - /mad/entries      : startDate + endDate, fenêtre ≤ 12 mois (cf. ci-dessous)
//   - /mad/balance      : startDate + endDate + classAccount, fenêtre ≤ 12 mois
//
// CONTRAINTE API DOCUMENTÉE :
//   /mad/entries et /mad/balance refusent (HTTP 400 "Difference between start
//   and end date should not exceed 12 months") toute fenêtre supérieure à
//   12 mois. Or `runSync` envoie par défaut 36 mois (DEFAULT_INITIAL_PERIOD_MONTHS)
//   pour rapatrier l'historique typique d'une PME. Donc :
//
//   - fetchAccountingEntries : on découpe la fenêtre demandée en chunks de 12
//     mois et on concatène les résultats avant de mapper. Garantit une analyse
//     comparative N/N-1/N-2 sans dépasser le plafond.
//   - fetchTrialBalance : la balance MAD reflète les MOUVEMENTS d'une période
//     (pas un solde cumulé) ; on l'appelle uniquement sur la fenêtre la plus
//     récente clampée à 12 mois — la balance N-2 ne sert pas pour le bilan
//     de fin de période.

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

/** Taille maximale d'une fenêtre temporelle pour /mad/entries et /mad/balance. */
export const MAD_MAX_WINDOW_MONTHS = 12;

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Découpe la fenêtre `[start, end]` en chunks consécutifs de `maxMonths` mois
 * maximum. Les chunks sont disjoints (le `start` du chunk N+1 = `end` du chunk
 * N + 1 jour) pour éviter les doublons côté API.
 *
 * Exporté pour tests.
 */
export function splitDateRangeIntoChunks(
  start: Date,
  end: Date,
  maxMonths: number = MAD_MAX_WINDOW_MONTHS
): Array<{ start: Date; end: Date }> {
  if (start.getTime() > end.getTime()) return [];
  if (maxMonths <= 0) {
    throw new Error(`splitDateRangeIntoChunks: maxMonths doit être > 0, reçu ${maxMonths}`);
  }
  const chunks: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const tentativeEnd = new Date(cursor);
    tentativeEnd.setMonth(tentativeEnd.getMonth() + maxMonths);
    // -1 jour pour rester strictement sous la limite "≤ 12 mois" côté API.
    tentativeEnd.setDate(tentativeEnd.getDate() - 1);
    let chunkEnd = tentativeEnd.getTime() > end.getTime() ? new Date(end) : tentativeEnd;

    // Si le chunk suivant ne couvrirait que les quelques jours restants,
    // on l'absorbe directement dans le chunk courant pour éviter un appel
    // API supplémentaire dégénéré (1-2 jours). On vérifie d'abord que
    // l'extension ne dépasse pas la limite des 12 mois.
    const next = new Date(chunkEnd);
    next.setDate(next.getDate() + 1);
    if (next.getTime() <= end.getTime()) {
      const wouldBeFinalEnd = end;
      const tentativeExtended = new Date(cursor);
      tentativeExtended.setMonth(tentativeExtended.getMonth() + maxMonths);
      // Si `end` tient dans la fenêtre 12 mois ouverte par `cursor` (≤ cursor + maxMonths),
      // étendre directement et terminer.
      if (wouldBeFinalEnd.getTime() <= tentativeExtended.getTime()) {
        chunkEnd = new Date(end);
      }
    }

    chunks.push({ start: new Date(cursor), end: new Date(chunkEnd) });
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

/**
 * Clamp une fenêtre à `maxMonths` mois maximum, en préservant `end` et en
 * remontant `start` si la fenêtre demandée est trop large. Utilisé pour les
 * appels balance qui veulent l'état le plus récent dans la limite API.
 *
 * Exporté pour tests.
 */
export function clampDateRangeToMaxMonths(
  start: Date,
  end: Date,
  maxMonths: number = MAD_MAX_WINDOW_MONTHS
): { start: Date; end: Date } {
  const minStart = new Date(end);
  minStart.setMonth(minStart.getMonth() - maxMonths);
  minStart.setDate(minStart.getDate() + 1);
  const effectiveStart = start.getTime() < minStart.getTime() ? minStart : start;
  return { start: effectiveStart, end };
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
// /mad/entries plafonne à 12 mois par appel. On découpe la fenêtre demandée
// en chunks de 12 mois et on concatène les résultats. La fonction reste
// "single-page" du point de vue de l'orchestrator (nextCursor: null).

export async function fetchAccountingEntries(
  ctx: AdapterSyncContext,
  _cursor: string | null
): Promise<AdapterSyncPage<AccountingEntry>> {
  const chunks = splitDateRangeIntoChunks(ctx.periodStart, ctx.periodEnd);
  const mapperCtx = { userId: ctx.connection.userId, connectionId: ctx.connection.id };
  const allEntries: AccountingEntry[] = [];

  for (const chunk of chunks) {
    const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftEntry>>(
      ctx.connection,
      "/mad/entries",
      { query: { startDate: toIsoDay(chunk.start), endDate: toIsoDay(chunk.end) } }
    );
    const items = extractList(raw);
    for (const item of items) {
      allEntries.push(mapEntry(item, mapperCtx));
    }
  }

  return {
    items: allEntries,
    nextCursor: null,
  };
}

// ─── Trial balance (balance générale) ──────────────────────────────────────
//
// /mad/balance plafonne aussi à 12 mois. La balance reflète les MOUVEMENTS
// d'une période, pas un solde cumulé : on prend la fenêtre la plus récente
// (clampée à 12 mois max) et on itère sur les 8 classes PCG (la 9 =
// analytique, hors balance comptable standard).

export async function fetchTrialBalance(
  connection: Connection,
  periodStart: Date,
  periodEnd: Date
): Promise<NormalizedTrialBalanceEntry[]> {
  const clamped = clampDateRangeToMaxMonths(periodStart, periodEnd);
  const startDate = toIsoDay(clamped.start);
  const endDate = toIsoDay(clamped.end);

  const allEntries: MyUnisoftBalanceEntry[] = [];
  for (const classAccount of PCG_CLASSES) {
    const raw = await myUnisoftRequest<MyUnisoftListResponse<MyUnisoftBalanceEntry>>(
      connection,
      "/mad/balance",
      { query: { startDate, endDate, classAccount } }
    );
    allEntries.push(...extractList(raw));
  }

  return mapTrialBalance(allEntries, clamped.start, clamped.end);
}
