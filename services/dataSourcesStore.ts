// File: services/dataSourcesStore.ts
// Role: lecture/écriture de l'état "source active" côté CLIENT (Firebase
// Web SDK). Doc cible : `users/{uid}/settings/dataSources` (sous-collection
// settings, single doc nommé "dataSources").
//
// Read : `subscribeActiveDataSource()` retourne un unsubscribe sur le
// snapshot Firestore — le hook `useActiveDataSource` s'en sert pour
// rester sync entre tabs / devices.
//
// Write : `writeActiveAccountingSource()` /
// `writeActiveBankingSource()` posent un patch atomique avec merge.
// L'exclusion mutuelle (activer Pennylane désactive MyUnisoft, etc.) est
// portée par le type lui-même : `activeAccountingSource` est une string
// unique, donc écrire une nouvelle valeur écrase la précédente.
//
// Les timestamps `createdAt` / `updatedAt` sont posés par le serveur via
// `serverTimestamp()` (cohérent entre devices).
"use client";

import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
  type DocumentSnapshot,
} from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";
import {
  EMPTY_ACTIVE_DATA_SOURCE,
  isAccountingSource,
  isBankingSource,
  type AccountingSource,
  type ActiveDataSourceState,
  type BankingSource,
} from "@/types/dataSources";

// Doc path scopé par companyId pour le mode cabinet (firm_member ayant
// plusieurs dossiers — chaque dossier doit avoir SA source active sans
// fuite croisée). Pour company_owner / firm_member sans dossier actif
// (companyId nullish), on retombe sur le doc historique "dataSources".
const SETTINGS_DOC_PATH = (
  uid: string,
  companyId?: string | null
): readonly [string, string, string, string] => [
  "users",
  uid,
  "settings",
  typeof companyId === "string" && companyId.length > 0
    ? `dataSources_${companyId}`
    : "dataSources",
];

/**
 * Décode un snapshot Firestore en `ActiveDataSourceState` validé. Toute
 * valeur absente ou invalide retombe sur le défaut "null" — on ne
 * crashe pas si Firestore contient une string inattendue (résiliant aux
 * migrations / typos manuelles).
 */
function decodeSnapshot(snapshot: DocumentSnapshot): ActiveDataSourceState {
  if (!snapshot.exists()) {
    return { ...EMPTY_ACTIVE_DATA_SOURCE };
  }
  const data = snapshot.data();
  const accountingRaw = data?.activeAccountingSource;
  const bankingRaw = data?.activeBankingSource;
  const folderRaw = data?.activeFecFolderName;
  const accounting: AccountingSource | null = isAccountingSource(accountingRaw)
    ? accountingRaw
    : null;
  const banking: BankingSource | null = isBankingSource(bankingRaw)
    ? bankingRaw
    : null;
  return {
    activeAccountingSource: accounting,
    activeBankingSource: banking,
    activeFecFolderName:
      accounting === "fec" && typeof folderRaw === "string" && folderRaw.trim()
        ? folderRaw.trim()
        : null,
  };
}

/**
 * Souscription en temps réel au document settings/dataSources de l'user.
 * Le callback reçoit le state décodé à chaque changement (y compris la
 * première résolution, vide ou non).
 *
 * Retourne un `unsubscribe` à appeler au unmount du composant.
 */
export function subscribeActiveDataSource(
  userId: string,
  onChange: (state: ActiveDataSourceState) => void,
  onError?: (err: Error) => void,
  companyId?: string | null
): Unsubscribe {
  const ref = doc(firestoreDb, ...SETTINGS_DOC_PATH(userId, companyId));
  return onSnapshot(
    ref,
    (snapshot) => onChange(decodeSnapshot(snapshot)),
    (err) => onError?.(err instanceof Error ? err : new Error(String(err)))
  );
}

/**
 * Active une source comptable spécifique (ou la désactive avec `null`).
 *
 * Effets de bord garantis par l'écriture atomique :
 *   - L'ancienne source comptable est écrasée (pas de "double active").
 *   - Si on quitte FEC, `activeFecFolderName` est posé à null pour
 *     éviter une sous-sélection orpheline.
 *   - `updatedAt` est rafraîchi.
 *   - `createdAt` est posé uniquement à la première écriture (merge).
 */
export async function writeActiveAccountingSource(
  userId: string,
  source: AccountingSource | null,
  fecFolderName: string | null = null,
  companyId?: string | null
): Promise<void> {
  const ref = doc(firestoreDb, ...SETTINGS_DOC_PATH(userId, companyId));
  const folderName = source === "fec" ? fecFolderName?.trim() || null : null;
  await setDoc(
    ref,
    {
      activeAccountingSource: source,
      activeFecFolderName: folderName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Active ou désactive Bridge. Indépendant de la source comptable. */
export async function writeActiveBankingSource(
  userId: string,
  source: BankingSource | null,
  companyId?: string | null
): Promise<void> {
  const ref = doc(firestoreDb, ...SETTINGS_DOC_PATH(userId, companyId));
  await setDoc(
    ref,
    {
      activeBankingSource: source,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
