// GET /api/integrations/bridge/status
//
// Auth  : header Authorization: Bearer <Firebase ID token>
//
// Retourne un booléen "connecté" + métadonnées utiles côté front pour
// décider d'afficher l'onglet Trésorerie + le badge "Live" sur le tile
// disponibilités du cockpit Synthèse.

import { NextResponse, type NextRequest } from "next/server";
import { listUserConnections } from "@/services/integrations/storage/connectionStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import type { BankingSummary } from "@/types/banking";

export const runtime = "nodejs";

const BANKING_COLLECTION = "banking_summaries";

export async function GET(request: NextRequest) {
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
    return NextResponse.json({ connected: false });
  }

  // Compte des comptes / dernière sync : on lit le summary standalone.
  // Si l'utilisateur a un summary attaché à une analyse précise, le front
  // lira via /api/analysis/:id (pas le rôle de cet endpoint).
  const db = getFirebaseAdminFirestore();
  const doc = await db.collection(BANKING_COLLECTION).doc(userId).get();
  const data = doc.data() as { summary?: BankingSummary; updatedAt?: string } | undefined;

  return NextResponse.json({
    connected: true,
    connectionId: active.id,
    accountsCount: data?.summary?.accounts.length ?? 0,
    totalBalance: data?.summary?.totalBalance ?? null,
    lastSyncAt: data?.summary?.lastSyncAt ?? null,
    lastSyncStatus: active.lastSyncStatus ?? "never",
  });
}
