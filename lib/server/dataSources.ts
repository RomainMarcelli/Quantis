// File: lib/server/dataSources.ts
// Role: lecture côté serveur (Firebase Admin SDK) du doc
// `users/{uid}/settings/dataSources`. Utilisé par les routes API qui
// calculent côté serveur (génération PDF, /api/ai/ask, sync hooks…)
// pour aligner le pipeline KPI sur la source active de l'utilisateur.
//
// Cache mémoire : 30 secondes par userId. Évite de marteler Firestore
// sur les requêtes qui appellent plusieurs KPIs en parallèle (ex. la
// génération de rapport financier qui fait 6+ calls). Le TTL court
// reste cohérent avec une UI qui peut basculer la source côté client.
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import {
  EMPTY_ACTIVE_DATA_SOURCE,
  isAccountingSource,
  isBankingSource,
  type AccountingSource,
  type ActiveDataSourceRecord,
  type BankingSource,
} from "@/types/dataSources";

const CACHE_TTL_MS = 30_000;
type CacheEntry = { value: ActiveDataSourceRecord; fetchedAt: number };
const cache = new Map<string, CacheEntry>();

/**
 * Résout l'état "source active" de l'utilisateur à un instant T.
 *
 * Retourne une structure complète (jamais null) — un user qui n'a jamais
 * posé son toggle reçoit `EMPTY_ACTIVE_DATA_SOURCE` avec timestamps null.
 * À l'appelant de gérer ce cas (ex. fallback à l'auto-resolveur métier).
 *
 * Cache mémoire 30s par userId. Pour invalider explicitement (après une
 * écriture serveur, par ex.), appeler `invalidateActiveDataSourceCache(userId)`.
 */
export async function getActiveDataSourceServer(
  userId: string
): Promise<ActiveDataSourceRecord> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const firestore = getFirebaseAdminFirestore();
  const snapshot = await firestore
    .collection("users")
    .doc(userId)
    .collection("settings")
    .doc("dataSources")
    .get();

  const data = snapshot.exists ? snapshot.data() : null;
  const accountingRaw = data?.activeAccountingSource;
  const bankingRaw = data?.activeBankingSource;
  const folderRaw = data?.activeFecFolderName;

  const accounting: AccountingSource | null = isAccountingSource(accountingRaw)
    ? accountingRaw
    : null;
  const banking: BankingSource | null = isBankingSource(bankingRaw) ? bankingRaw : null;

  const value: ActiveDataSourceRecord = {
    activeAccountingSource: accounting,
    activeBankingSource: banking,
    activeFecFolderName:
      accounting === "fec" && typeof folderRaw === "string" && folderRaw.trim()
        ? folderRaw.trim()
        : null,
    createdAt: timestampToIso(data?.createdAt),
    updatedAt: timestampToIso(data?.updatedAt),
  };

  cache.set(userId, { value, fetchedAt: now });
  return value;
}

/**
 * Invalidation manuelle du cache. À appeler quand on écrit côté serveur
 * (rare — la plupart des écritures viennent du client) pour ne pas
 * servir une valeur obsolète immédiatement après.
 */
export function invalidateActiveDataSourceCache(userId?: string): void {
  if (userId) {
    cache.delete(userId);
  } else {
    cache.clear();
  }
}

/**
 * Variante non-cachée (test / debug). Force un round-trip Firestore.
 * Préférer `getActiveDataSourceServer()` en production.
 */
export async function getActiveDataSourceServerUncached(
  userId: string
): Promise<ActiveDataSourceRecord> {
  invalidateActiveDataSourceCache(userId);
  return getActiveDataSourceServer(userId);
}

/** Helper interne : Firestore Admin Timestamp → ISO string (ou null). */
function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return null;
}

/** Re-export pour les routes API qui ont besoin du défaut. */
export { EMPTY_ACTIVE_DATA_SOURCE } from "@/types/dataSources";
