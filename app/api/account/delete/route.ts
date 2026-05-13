import { NextRequest, NextResponse } from "next/server";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { logHttpSecurityErrorFromRequest, safeLogSecurityEventFromRequest } from "@/lib/server/securityAudit";

export const runtime = "nodejs";

const BATCH_LIMIT = 400;

/**
 * Audit Prodiges (mai 2026) — Collections root-level scopées par champ `userId`
 * qui doivent être purgées à la suppression d'un compte pour respecter le
 * droit à l'effacement RGPD (art. 17 RGPD).
 *
 * Couvre les données comptables synchronisées (Pennylane, MyUnisoft, Bridge,
 * Odoo) ainsi que les tokens chiffrés des connecteurs tiers.
 *
 * `users/{uid}` et ses sous-collections (dashboards, settings, kpiAlerts,
 * kpiObjectives) sont gérés séparément via `firestore.recursiveDelete()`
 * qui purge la doc principale + toutes les sous-collections en cascade.
 */
const USER_SCOPED_ROOT_COLLECTIONS = [
  "analyses",
  "folders",
  "connections",
  "accounting_entries",
  "invoices",
  "ledger_accounts",
  "contacts",
  "journals",
  "bank_accounts",
  "bank_transactions"
] as const;

type CollectionName = (typeof USER_SCOPED_ROOT_COLLECTIONS)[number];
type DeletionCounts = Partial<Record<CollectionName, number>>;

export async function POST(request: NextRequest) {
  const rateLimitedResponse = enforceRouteRateLimit(request, {
    routeId: "api-account-delete",
    maxRequests: 10,
    windowMs: 60_000
  });
  if (rateLimitedResponse) {
    return rateLimitedResponse;
  }

  const bearerToken = extractBearerToken(request.headers.get("authorization"));
  if (!bearerToken) {
    await logHttpSecurityErrorFromRequest(request, {
      eventType: "account_delete_unauthorized_missing_token",
      statusCode: 401,
      userId: null,
      message: "Suppression compte refusée: token manquant."
    });
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const auth = getFirebaseAdminAuth();
    const firestore = getFirebaseAdminFirestore();
    const decodedToken = await auth.verifyIdToken(bearerToken);
    const userId = decodedToken.uid;

    // Audit Prodiges (mai 2026) — Purge complète RGPD : on supprime
    // l'intégralité des données utilisateur scopées par `userId`.
    // Avant : seulement analyses + folders, laissant connections (tokens
    // chiffrés) + 7 collections comptables orphelines en BDD.
    const deletionCounts = await purgeUserScopedCollections(firestore, userId);

    // `recursiveDelete` purge users/{uid} + toutes ses sous-collections
    // (dashboards, settings, kpiAlerts, kpiObjectives). Sans cette
    // récursion, les sub-docs deviendraient orphelins en Firestore
    // (Firestore ne cascade pas automatiquement sur delete).
    await firestore.recursiveDelete(firestore.collection("users").doc(userId));

    try {
      await auth.deleteUser(userId);
    } catch (error) {
      const code = extractFirebaseAdminErrorCode(error);
      if (code !== "auth/user-not-found") {
        throw error;
      }
    }

    const totalDeleted = Object.values(deletionCounts).reduce(
      (sum, count) => sum + (count ?? 0),
      0
    );

    // Audit Prodiges (mai 2026) — On garde `deletedAnalysesCount` et
    // `deletedFoldersCount` dans la réponse pour compat avec l'ancien
    // contrat client (AccountView, accountDeletionApi, lib/account/account
    // et leurs tests). Les consommateurs futurs peuvent lire le détail
    // exhaustif via `deletionCounts`.
    const responsePayload = {
      success: true as const,
      deletedAnalysesCount: deletionCounts.analyses ?? 0,
      deletedFoldersCount: deletionCounts.folders ?? 0,
      deletionCounts,
      totalRootDocsDeleted: totalDeleted
    };

    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "account_deleted_everywhere",
      statusCode: 200,
      userId,
      message: "Suppression complète confirmée (Firestore + Auth).",
      metadata: {
        deletionCounts,
        totalRootDocsDeleted: totalDeleted
      }
    });

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "account_delete_failed",
      statusCode: 500,
      userId: null,
      message: toErrorMessage(error)
    });
    return NextResponse.json({ error: "Suppression complète impossible." }, { status: 500 });
  }
}

/**
 * Audit Prodiges (mai 2026) — Purge en parallèle de chaque collection
 * root-level scopée par `userId`. Chaque collection est interrogée
 * indépendamment puis les docs trouvés sont supprimés en batches de
 * BATCH_LIMIT pour respecter la limite Firestore (500 ops/batch).
 *
 * Retourne le compte par collection pour log d'audit + réponse client.
 */
async function purgeUserScopedCollections(
  firestore: Firestore,
  userId: string
): Promise<DeletionCounts> {
  const results = await Promise.all(
    USER_SCOPED_ROOT_COLLECTIONS.map(async (collectionName) => {
      const snapshot = await firestore
        .collection(collectionName)
        .where("userId", "==", userId)
        .get();
      await deleteDocsInBatches(snapshot.docs.map((docSnapshot) => docSnapshot.ref));
      return [collectionName, snapshot.size] as const;
    })
  );
  return Object.fromEntries(results) as DeletionCounts;
}

async function deleteDocsInBatches(refs: DocumentReference[]): Promise<void> {
  if (!refs.length) {
    return;
  }

  const firestore = getFirebaseAdminFirestore();
  for (let index = 0; index < refs.length; index += BATCH_LIMIT) {
    const batch = firestore.batch();
    const chunk = refs.slice(index, index + BATCH_LIMIT);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function extractFirebaseAdminErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erreur inconnue";
}
