// File: services/companies/connectionCompanyStore.ts
// Role: CRUD Firestore sur la collection `connection_companies/{id}`.
//
// Cette collection est la table de jointure N:N entre Connections et
// Companies — introduite au Sprint B (cf. docs/audit-sprint-B.md).
//
// Scenarios supportés :
//   - 1 Connection Firm Pennylane → N Companies (1 par dossier client
//     du cabinet, peuplés par le callback OAuth Firm).
//   - N Connections → 1 Company (ex: Pennylane comptable + Bridge banque
//     sur la même entreprise).
//
// Idempotence : `findMappingByExternalRef` permet de vérifier l'existence
// d'un mapping avant création, pour ne pas dupliquer lors d'un reconnect.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

const COLLECTION = "connection_companies";

export interface ConnectionCompanyMapping {
  id: string;
  userId: string;
  connectionId: string;
  companyId: string;
  /**
   * ID de la company côté provider (ex: Pennylane company_id, MyU
   * folder_id). Clé de matching pour `findMappingByExternalRef`.
   */
  externalCompanyId: string;
  externalCompanyName?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CreateMappingInput = Omit<
  ConnectionCompanyMapping,
  "id" | "createdAt" | "updatedAt"
>;

// ─── Création ─────────────────────────────────────────────────────────────

export async function createMapping(
  input: CreateMappingInput
): Promise<ConnectionCompanyMapping> {
  const db = getFirebaseAdminFirestore();
  const docRef = db.collection(COLLECTION).doc();
  const now = Timestamp.now();

  const record: Omit<ConnectionCompanyMapping, "id"> = {
    userId: input.userId,
    connectionId: input.connectionId,
    companyId: input.companyId,
    externalCompanyId: input.externalCompanyId,
    externalCompanyName: input.externalCompanyName,
    isActive: input.isActive,
    createdAt: now,
    updatedAt: now,
  };

  // Firestore refuse undefined → omettre les champs vides.
  const payload: Record<string, unknown> = { ...record };
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  await docRef.set(payload);
  return { ...record, id: docRef.id };
}

// ─── Lecture ──────────────────────────────────────────────────────────────

export async function getMappingById(
  mappingId: string
): Promise<ConnectionCompanyMapping | null> {
  const db = getFirebaseAdminFirestore();
  const snap = await db.collection(COLLECTION).doc(mappingId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Omit<ConnectionCompanyMapping, "id">;
  return { ...data, id: snap.id };
}

/**
 * Liste les mappings actifs d'une Connection — utilisé par le sync
 * orchestrator pour itérer sur toutes les Companies à synchroniser
 * (cas Firm OAuth multi-dossiers).
 */
export async function listMappingsForConnection(
  connectionId: string
): Promise<ConnectionCompanyMapping[]> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("connectionId", "==", connectionId)
    .where("isActive", "==", true)
    .get();
  return snap.docs.map((doc) => ({
    ...(doc.data() as Omit<ConnectionCompanyMapping, "id">),
    id: doc.id,
  }));
}

/**
 * Liste les mappings actifs d'une Company — utilisé pour afficher
 * "quelles Connections alimentent cette Company" (cas N:1).
 */
export async function listMappingsForCompany(
  companyId: string
): Promise<ConnectionCompanyMapping[]> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("companyId", "==", companyId)
    .where("isActive", "==", true)
    .get();
  return snap.docs.map((doc) => ({
    ...(doc.data() as Omit<ConnectionCompanyMapping, "id">),
    id: doc.id,
  }));
}

/**
 * Liste tous les mappings actifs d'un user — utilisé par les vues
 * cabinet (Sprint C) pour montrer l'arbre Connection → Companies.
 */
export async function listActiveMappingsForUser(
  userId: string
): Promise<ConnectionCompanyMapping[]> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("userId", "==", userId)
    .where("isActive", "==", true)
    .get();
  return snap.docs.map((doc) => ({
    ...(doc.data() as Omit<ConnectionCompanyMapping, "id">),
    id: doc.id,
  }));
}

/**
 * Trouve un mapping existant pour la clé (connectionId, externalCompanyId).
 * Utilisé pour l'idempotence du callback OAuth Firm : on ne crée pas un
 * 2e mapping pour le même dossier si l'user reconnecte sa Connection.
 *
 * Retourne le mapping même s'il est `isActive=false` — au caller de
 * décider de le réactiver ou d'en créer un nouveau.
 */
export async function findMappingByExternalRef(
  connectionId: string,
  externalCompanyId: string
): Promise<ConnectionCompanyMapping | null> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("connectionId", "==", connectionId)
    .where("externalCompanyId", "==", externalCompanyId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return {
    ...(doc.data() as Omit<ConnectionCompanyMapping, "id">),
    id: doc.id,
  };
}

// ─── Mise à jour ──────────────────────────────────────────────────────────

/**
 * Désactive un mapping (isActive=false). Utilisé quand une Connection
 * est déconnectée : on garde la trace du mapping (pour réactivation
 * future si reconnexion) mais on l'exclut des listings actifs.
 */
export async function deactivateMapping(mappingId: string): Promise<void> {
  const db = getFirebaseAdminFirestore();
  await db.collection(COLLECTION).doc(mappingId).update({
    isActive: false,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Réactive un mapping (isActive=true). Utilisé quand un user reconnecte
 * une Connection précédemment déconnectée — on retrouve les mappings
 * existants via findMappingByExternalRef et on les réactive plutôt que
 * d'en créer de nouveaux (préserve la cohérence des données comptables
 * déjà rattachées aux Companies via ce mapping).
 */
export async function reactivateMapping(mappingId: string): Promise<void> {
  const db = getFirebaseAdminFirestore();
  await db.collection(COLLECTION).doc(mappingId).update({
    isActive: true,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Désactive en bloc tous les mappings d'une Connection. Utilisé lors
 * du disconnect d'une Connection : Connection passe à `revoked` ET
 * tous ses mappings deviennent `isActive=false` (cf. audit-sprint-B
 * Q2 — pas de cascade destructive, juste désactivation).
 */
export async function deactivateMappingsForConnection(
  connectionId: string
): Promise<number> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("connectionId", "==", connectionId)
    .where("isActive", "==", true)
    .get();
  if (snap.empty) return 0;
  const batch = db.batch();
  const updatedAt = Timestamp.now();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { isActive: false, updatedAt });
  }
  await batch.commit();
  // FieldValue référencée pour les futures extensions (purge totale Sprint D+).
  void FieldValue;
  return snap.size;
}
