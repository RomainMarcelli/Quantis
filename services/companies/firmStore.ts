// File: services/companies/firmStore.ts
// Role: CRUD Firestore sur la collection `firms/{firmId}` (Sprint C).
//
// Convention isolation : côté serveur (Admin SDK), aucune rule ne
// s'applique — l'autorisation est manuelle. Le pattern Sprint A/B
// (requireCompanyAccess) sera étendu en Sprint C/D pour valider
// l'appartenance firm_member quand une Company a un firmId.

import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import type { CreateFirmInput, FirmRecord } from "@/services/companies/firmTypes";

const COLLECTION = "firms";

/**
 * Crée une nouvelle Firm avec l'`ownerUserId` ajouté automatiquement
 * à `memberUserIds`. ID auto-généré.
 *
 * Sprint C : un user qui crée une Firm devient automatiquement son owner.
 * L'extension du `users/{uid}` pour ajouter `accountType: "firm_member"`
 * + `firmId` est gérée par le caller (route `/api/cabinet/firm/create`).
 */
export async function createFirm(input: CreateFirmInput): Promise<FirmRecord> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error("Firm name requis.");
  }

  const db = getFirebaseAdminFirestore();
  const docRef = db.collection(COLLECTION).doc();
  const now = Timestamp.now();

  const record: Omit<FirmRecord, "firmId"> = {
    name: trimmedName,
    ownerUserId: input.ownerUserId,
    memberUserIds: [input.ownerUserId],
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(record);
  return { ...record, firmId: docRef.id };
}

export async function getFirm(firmId: string): Promise<FirmRecord | null> {
  const db = getFirebaseAdminFirestore();
  const snap = await db.collection(COLLECTION).doc(firmId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Omit<FirmRecord, "firmId">;
  return { ...data, firmId: snap.id };
}

/**
 * Ajoute un user à la liste des membres d'une Firm.
 *
 * Sprint C : usage interne uniquement (route admin / migration future).
 * Pas exposé côté UI dans ce sprint — l'invitation de collaborateurs
 * arrivera après le MVP cabinet.
 *
 * Idempotent : si l'user est déjà membre, no-op silencieux.
 */
export async function addMemberToFirm(
  firmId: string,
  userId: string
): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const docRef = db.collection(COLLECTION).doc(firmId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error(`Firm ${firmId} introuvable.`);
  }
  const data = snap.data() as Omit<FirmRecord, "firmId">;
  if (data.memberUserIds.includes(userId)) return;

  await docRef.update({
    memberUserIds: [...data.memberUserIds, userId],
    updatedAt: Timestamp.now(),
  });
}

/**
 * Liste les Firms dont un user est membre. Utilisé par la sidebar /
 * sélecteur de Company pour résoudre le cabinet actif.
 *
 * Sprint C : un user a au plus 1 Firm (cas exclusif AccountType). On
 * retourne quand même un tableau pour anticiper Sprint D si on lève
 * la contrainte.
 */
export async function listFirmsForUser(userId: string): Promise<FirmRecord[]> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("memberUserIds", "array-contains", userId)
    .get();
  return snap.docs.map((doc) => ({
    ...(doc.data() as Omit<FirmRecord, "firmId">),
    firmId: doc.id,
  }));
}
