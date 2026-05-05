// POST /api/integrations/bridge/disconnect
//
// Auth  : header Authorization: Bearer <Firebase ID token>
//
// Supprime la connexion Bridge active de l'utilisateur + le doc
// `banking_summaries/{userId}` (les BankingSummary attachés à des analyses
// spécifiques restent — l'utilisateur peut vouloir conserver l'historique
// de la dernière sync sur une analyse archivée).

import { NextResponse, type NextRequest } from "next/server";
import { deleteConnection, listUserConnections } from "@/services/integrations/storage/connectionStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const BANKING_COLLECTION = "banking_summaries";

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const connections = await listUserConnections(userId, "bridge");
  const active = connections.find((c) => c.status === "active");
  if (!active) {
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  await deleteConnection(active.id);

  // Supprime le summary standalone (les attachés aux analyses restent).
  const db = getFirebaseAdminFirestore();
  await db.collection(BANKING_COLLECTION).doc(userId).delete().catch(() => {
    // Si le doc n'existe pas, pas grave — on est bien dans l'état "déconnecté".
  });

  return NextResponse.json({ ok: true });
}
