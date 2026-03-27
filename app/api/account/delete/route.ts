import { NextRequest, NextResponse } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { logHttpSecurityErrorFromRequest, safeLogSecurityEventFromRequest } from "@/lib/server/securityAudit";

export const runtime = "nodejs";

const BATCH_LIMIT = 400;

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

    const [analysesSnapshot, foldersSnapshot] = await Promise.all([
      firestore.collection("analyses").where("userId", "==", userId).get(),
      firestore.collection("folders").where("userId", "==", userId).get()
    ]);

    await Promise.all([
      deleteDocsInBatches(analysesSnapshot.docs.map((docSnapshot) => docSnapshot.ref)),
      deleteDocsInBatches(foldersSnapshot.docs.map((docSnapshot) => docSnapshot.ref))
    ]);

    await firestore.collection("users").doc(userId).delete();

    try {
      await auth.deleteUser(userId);
    } catch (error) {
      const code = extractFirebaseAdminErrorCode(error);
      if (code !== "auth/user-not-found") {
        throw error;
      }
    }

    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "account_deleted_everywhere",
      statusCode: 200,
      userId,
      message: "Suppression complète confirmée (Firestore + Auth).",
      metadata: {
        deletedAnalysesCount: analysesSnapshot.size,
        deletedFoldersCount: foldersSnapshot.size
      }
    });

    return NextResponse.json(
      {
        success: true,
        deletedAnalysesCount: analysesSnapshot.size,
        deletedFoldersCount: foldersSnapshot.size
      },
      { status: 200 }
    );
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
