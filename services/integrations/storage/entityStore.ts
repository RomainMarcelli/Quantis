// Store générique pour les entités comptables synchronisées (journals, ledger_accounts,
// contacts, accounting_entries, invoices, bank_*).
//
// Idempotence : doc ID déterministe = sanitize(`${connectionId}_${externalId}`).
// Un sync incrémental qui re-fetch une entité existante l'écrase proprement.

import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import type {
  AccountingEntry,
  BankAccount,
  BankTransaction,
  Contact,
  EntityBase,
  Invoice,
  Journal,
  LedgerAccount,
} from "@/types/connectors";

export type EntityCollection =
  | "journals"
  | "ledger_accounts"
  | "contacts"
  | "accounting_entries"
  | "invoices"
  | "bank_accounts"
  | "bank_transactions";

const FIRESTORE_DOC_ID_PATTERN = /[^a-zA-Z0-9_-]/g;

function buildDocId(connectionId: string, externalId: string): string {
  // Firestore docId : pas de "/", pas de "." (séparateurs de path).
  // On sanitize tout en gardant lisible.
  const safe = `${connectionId}_${externalId}`.replace(FIRESTORE_DOC_ID_PATTERN, "_");
  // Limite Firestore : 1500 octets. On tronque large pour rester safe.
  return safe.slice(0, 400);
}

// Upsert idempotent batch. Firestore admin batch limite à 500 ops par commit.
async function upsertEntitiesBatch<T extends EntityBase>(
  collection: EntityCollection,
  entities: T[]
): Promise<T[]> {
  if (entities.length === 0) return [];

  const db = getFirebaseAdminFirestore();
  const persisted: T[] = [];
  const BATCH_SIZE = 400;

  for (let i = 0; i < entities.length; i += BATCH_SIZE) {
    const slice = entities.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const entity of slice) {
      if (!entity.connectionId || !entity.externalId) {
        throw new Error(
          `[entityStore:${collection}] connectionId/externalId required for upsert`
        );
      }
      const docId = buildDocId(entity.connectionId, entity.externalId);
      const ref = db.collection(collection).doc(docId);
      const payload: T = { ...entity, id: docId };
      batch.set(ref, payload as unknown as FirebaseFirestore.DocumentData);
      persisted.push(payload);
    }

    await batch.commit();
  }

  return persisted;
}

// ─── Wrappers typés par entité ──────────────────────────────────────────────

export const upsertJournals = (entities: Journal[]) =>
  upsertEntitiesBatch<Journal>("journals", entities);

export const upsertLedgerAccounts = (entities: LedgerAccount[]) =>
  upsertEntitiesBatch<LedgerAccount>("ledger_accounts", entities);

export const upsertContacts = (entities: Contact[]) =>
  upsertEntitiesBatch<Contact>("contacts", entities);

export const upsertAccountingEntries = (entities: AccountingEntry[]) =>
  upsertEntitiesBatch<AccountingEntry>("accounting_entries", entities);

export const upsertInvoices = (entities: Invoice[]) =>
  upsertEntitiesBatch<Invoice>("invoices", entities);

export const upsertBankAccounts = (entities: BankAccount[]) =>
  upsertEntitiesBatch<BankAccount>("bank_accounts", entities);

export const upsertBankTransactions = (entities: BankTransaction[]) =>
  upsertEntitiesBatch<BankTransaction>("bank_transactions", entities);

// ─── Listing par connection (utilisé par les aggregations) ──────────────────

async function listByConnection<T extends EntityBase>(
  collection: EntityCollection,
  userId: string,
  connectionId: string
): Promise<T[]> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection(collection)
    .where("userId", "==", userId)
    .where("connectionId", "==", connectionId)
    .get();
  return snap.docs.map((doc) => doc.data() as T);
}

export const listJournalsByConnection = (userId: string, connectionId: string) =>
  listByConnection<Journal>("journals", userId, connectionId);

export const listLedgerAccountsByConnection = (userId: string, connectionId: string) =>
  listByConnection<LedgerAccount>("ledger_accounts", userId, connectionId);

export const listContactsByConnection = (userId: string, connectionId: string) =>
  listByConnection<Contact>("contacts", userId, connectionId);

export const listAccountingEntriesByConnection = (userId: string, connectionId: string) =>
  listByConnection<AccountingEntry>("accounting_entries", userId, connectionId);

export const listInvoicesByConnection = (userId: string, connectionId: string) =>
  listByConnection<Invoice>("invoices", userId, connectionId);

export const listBankAccountsByConnection = (userId: string, connectionId: string) =>
  listByConnection<BankAccount>("bank_accounts", userId, connectionId);

export const listBankTransactionsByConnection = (userId: string, connectionId: string) =>
  listByConnection<BankTransaction>("bank_transactions", userId, connectionId);

// ─── Suppression complète d'une connection (RGPD / disconnect) ──────────────

export async function deleteAllEntitiesForConnection(
  userId: string,
  connectionId: string
): Promise<{ collection: EntityCollection; deleted: number }[]> {
  const db = getFirebaseAdminFirestore();
  const collections: EntityCollection[] = [
    "journals",
    "ledger_accounts",
    "contacts",
    "accounting_entries",
    "invoices",
    "bank_accounts",
    "bank_transactions",
  ];
  const results: { collection: EntityCollection; deleted: number }[] = [];

  for (const collection of collections) {
    const snap = await db
      .collection(collection)
      .where("userId", "==", userId)
      .where("connectionId", "==", connectionId)
      .get();

    let deleted = 0;
    const BATCH_SIZE = 400;
    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const doc of snap.docs.slice(i, i + BATCH_SIZE)) {
        batch.delete(doc.ref);
        deleted++;
      }
      await batch.commit();
    }
    results.push({ collection, deleted });
  }

  return results;
}
