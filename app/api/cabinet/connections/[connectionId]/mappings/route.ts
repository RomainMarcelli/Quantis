// File: app/api/cabinet/connections/[connectionId]/mappings/route.ts
//
// GET    : liste les mappings d'une Connection (pour alimenter le picker).
// PATCH  : active/désactive les mappings selon la sélection du picker.
//
// Sprint C Tâche 4. Auth obligatoire + ownership de la Connection vérifié.

import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { getUserConnectionById } from "@/services/integrations/storage/connectionStore";

export const runtime = "nodejs";

const MAPPINGS_COLLECTION = "connection_companies";

type MappingDto = {
  id: string;
  connectionId: string;
  companyId: string;
  externalCompanyId: string;
  externalCompanyName: string | null;
  isActive: boolean;
};

// ─── GET ─────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string }> }
) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const { connectionId } = await context.params;

  // Vérifie l'ownership de la Connection.
  const connection = await getUserConnectionById(userId, connectionId);
  if (!connection) {
    return NextResponse.json({ error: "Connection introuvable ou accès refusé." }, { status: 403 });
  }

  // Liste tous les mappings (actifs + inactifs) pour cette Connection.
  // Le picker doit voir l'état complet pour permettre réactivation.
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection(MAPPINGS_COLLECTION)
    .where("connectionId", "==", connectionId)
    .where("userId", "==", userId) // double check defense-in-depth
    .get();

  const mappings: MappingDto[] = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      connectionId: String(data.connectionId ?? ""),
      companyId: String(data.companyId ?? ""),
      externalCompanyId: String(data.externalCompanyId ?? ""),
      externalCompanyName:
        typeof data.externalCompanyName === "string" ? data.externalCompanyName : null,
      isActive: Boolean(data.isActive),
    };
  });

  return NextResponse.json({ mappings }, { status: 200 });
}

// ─── PATCH ───────────────────────────────────────────────────────────────

type PatchBody = {
  /** Liste des IDs de mappings à activer. Les autres mappings de la
   *  Connection seront désactivés. */
  activatedMappingIds?: unknown;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string }> }
) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const { connectionId } = await context.params;

  const connection = await getUserConnectionById(userId, connectionId);
  if (!connection) {
    return NextResponse.json({ error: "Connection introuvable ou accès refusé." }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (!Array.isArray(body.activatedMappingIds)) {
    return NextResponse.json(
      { error: "activatedMappingIds doit être un tableau." },
      { status: 400 }
    );
  }
  const activated = new Set<string>(
    body.activatedMappingIds
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim())
  );

  // Récupère tous les mappings de la Connection (scope userId pour défense).
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection(MAPPINGS_COLLECTION)
    .where("connectionId", "==", connectionId)
    .where("userId", "==", userId)
    .get();

  let activatedCount = 0;
  let deactivatedCount = 0;
  const now = Timestamp.now();
  const batch = db.batch();
  for (const doc of snap.docs) {
    const wantActive = activated.has(doc.id);
    const current = Boolean(doc.data().isActive);
    if (current === wantActive) continue;
    batch.update(doc.ref, { isActive: wantActive, updatedAt: now });
    if (wantActive) activatedCount += 1;
    else deactivatedCount += 1;
  }
  await batch.commit();

  console.info(
    `[cabinet/mappings] connection=${connectionId} userId=${userId} ` +
      `→ activated=${activatedCount} deactivated=${deactivatedCount}`
  );

  return NextResponse.json(
    {
      connectionId,
      activated: activatedCount,
      deactivated: deactivatedCount,
    },
    { status: 200 }
  );
}
