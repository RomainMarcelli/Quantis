// File: services/companies/companyStore.ts
// Role: CRUD Firestore sur la collection `companies/{companyId}`. Cf.
// docs/audit-sprint-A.md pour le contexte multi-tenant.
//
// Convention isolation (cf. audit pré-merge multi-tenant) :
// - Côté serveur (Admin SDK), aucune Firestore rule ne s'applique.
//   L'isolation par userId/companyId est MANUELLE et doit être vérifiée
//   par chaque caller via `requireCompanyAccess()`.
// - Côté client (Web SDK), les Firestore rules garantissent que seul
//   l'`ownerUserId` peut lire/écrire sa Company (cf. firestore.rules).
//
// Sprint A : un User a exactement 1 Company. Sprint B+ : on lèvera cette
// contrainte (un User pourra owner N Companies, ou être firm_member de
// Companies d'un cabinet).

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import type {
  CompanyRecord,
  CreateCompanyInput,
  UpdateCompanyPatch,
} from "@/services/companies/types";

const COLLECTION = "companies";

// ─── Création ─────────────────────────────────────────────────────────────

/**
 * Crée une Company en Firestore. ID auto-généré.
 *
 * IDEMPOTENCE : ce store NE FAIT PAS de check "Company déjà existante
 * pour cet ownerUserId". C'est volontaire :
 *   - Le script de migration (Sprint A) gère son propre check d'idempotence
 *     en amont via `listCompaniesForUser()` (refuse de créer une 2e
 *     Company pour un user qui en a déjà une).
 *   - À partir du Sprint B, un user POURRA avoir plusieurs Companies
 *     (cabinet ou multi-dossiers). Pas de contrainte structurelle dans le
 *     store.
 *
 * Les callers responsables de l'unicité métier doivent faire leur propre
 * vérification — comme avec `ConnectionAlreadyExistsError` côté connections.
 */
export async function createCompany(input: CreateCompanyInput): Promise<CompanyRecord> {
  const db = getFirebaseAdminFirestore();
  const docRef = db.collection(COLLECTION).doc();
  const now = Timestamp.now();
  const createdAt = input.createdAtOverride ?? now;

  const record: Omit<CompanyRecord, "id"> = {
    ownerUserId: input.ownerUserId,
    firmId: input.firmId,
    name: input.name,
    siren: input.siren,
    externalCompanyId: input.externalCompanyId,
    source: input.source,
    status: input.status,
    createdAt,
    updatedAt: now,
  };

  // Firestore refuse les champs undefined → on les omet du payload.
  const payload: Record<string, unknown> = { ...record };
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  await docRef.set(payload);
  return { ...record, id: docRef.id };
}

// ─── Lecture ──────────────────────────────────────────────────────────────

/**
 * Récupère une Company par son id. Retourne null si introuvable.
 *
 * ⚠ Cette fonction NE VÉRIFIE PAS l'accès — utiliser `requireCompanyAccess()`
 * en amont dans les routes API pour valider que l'uid courant a le droit
 * de lire cette Company.
 */
export async function getCompany(companyId: string): Promise<CompanyRecord | null> {
  const db = getFirebaseAdminFirestore();
  const snap = await db.collection(COLLECTION).doc(companyId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Omit<CompanyRecord, "id">;
  return { ...data, id: snap.id };
}

/**
 * Liste toutes les Companies dont `ownerUserId === userId`. Utilisé pour :
 *   - le mode dirigeant (1 user → 1 ou N companies en accès direct)
 *   - le fallback rétrocompat des routes API en Sprint A (route reçoit
 *     userId, on récupère la première Company)
 *
 * Sprint C : on étendra ce store avec `listCompaniesForFirm(firmId)` et
 * un mode "user is member of firm".
 *
 * Ordonné par `createdAt` ascendant (la plus ancienne en premier — celle
 * créée à la migration).
 */
export async function listCompaniesForUser(userId: string): Promise<CompanyRecord[]> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("ownerUserId", "==", userId)
    .where("status", "==", "active")
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map((doc) => ({
    ...(doc.data() as Omit<CompanyRecord, "id">),
    id: doc.id,
  }));
}

// ─── Mise à jour ──────────────────────────────────────────────────────────

/**
 * Patch partiel d'une Company. `updatedAt` est automatiquement mis à
 * `Timestamp.now()`. Les champs `id`, `createdAt`, `ownerUserId` sont
 * intentionnellement non-modifiables — pour changer le propriétaire,
 * archiver + recréer (cas marginal, à traiter en Sprint C si besoin).
 */
export async function updateCompany(
  companyId: string,
  patch: UpdateCompanyPatch
): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const update: Record<string, unknown> = { ...patch, updatedAt: Timestamp.now() };

  // Firestore : pour SUPPRIMER un champ optionnel (passer undefined),
  // utiliser FieldValue.delete(). Pour conserver l'API simple, on
  // interprète `null` comme "supprime le champ" et `undefined` comme
  // "ne touche pas".
  for (const key of Object.keys(update)) {
    const value = update[key];
    if (value === undefined) {
      delete update[key];
    } else if (value === null && key !== "updatedAt") {
      update[key] = FieldValue.delete();
    }
  }

  await db.collection(COLLECTION).doc(companyId).update(update);
}

/**
 * Marque une Company comme archivée. N'efface pas les données — la
 * Company reste lisible (pour les rapports historiques) mais ne
 * remonte plus dans `listCompaniesForUser()` (filter `status === "active"`).
 *
 * Pour une vraie suppression, créer une route admin dédiée qui purge
 * aussi les analyses / connections / entités rattachées. Pas en scope
 * Sprint A.
 */
export async function archiveCompany(companyId: string): Promise<void> {
  await updateCompany(companyId, { status: "archived" });
}
