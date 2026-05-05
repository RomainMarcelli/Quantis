// POST /api/integrations/myunisoft/disconnect
// Supprime une connection MyUnisoft et toutes les entités synchronisées (RGPD).

import { NextResponse, type NextRequest } from "next/server";
import {
  deleteConnection,
  getUserConnectionById,
} from "@/services/integrations/storage/connectionStore";
import { deleteAllEntitiesForConnection } from "@/services/integrations/storage/entityStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";

export const runtime = "nodejs";

type DisconnectRequestBody = {
  connectionId?: string;
};

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

  let body: DisconnectRequestBody;
  try {
    body = (await request.json()) as DisconnectRequestBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const connectionId = body.connectionId?.trim();
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId manquant." }, { status: 400 });
  }

  const connection = await getUserConnectionById(userId, connectionId);
  if (!connection) {
    return NextResponse.json({ error: "Connection introuvable." }, { status: 404 });
  }

  try {
    const entityDeletions = await deleteAllEntitiesForConnection(userId, connectionId);
    await deleteConnection(connectionId);
    return NextResponse.json({ success: true, deletions: entityDeletions }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Échec de la déconnexion.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
