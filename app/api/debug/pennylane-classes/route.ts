// File: app/api/debug/pennylane-classes/route.ts
// Role: GET /api/debug/pennylane-classes?connectionId=...
// Renvoie l'agrégation "vue par classe PCG (1-7)" des données Pennylane
// synchronisées pour la connection passée en paramètre.
//
// Pas de page consommatrice côté front public — c'est un endpoint debug
// pour le PM, branché sur /debug/pennylane-classes. Auth Firebase Bearer
// requise + ownership de la connection vérifié.

import { NextResponse, type NextRequest } from "next/server";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import {
  getUserConnectionById,
  listUserConnections,
} from "@/services/integrations/storage/connectionStore";
import {
  listAccountingEntriesByConnection,
  listLedgerAccountsByConnection,
} from "@/services/integrations/storage/entityStore";
import { buildPennylaneClassReport } from "@/lib/debug/pennylaneClasses";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const url = new URL(request.url);
  const connectionId = url.searchParams.get("connectionId");

  // Si aucun connectionId fourni, on retourne juste la liste des connections
  // Pennylane disponibles pour que la page puisse proposer un picker.
  if (!connectionId) {
    const all = await listUserConnections(userId, "pennylane");
    const summaries = all.map((c) => ({
      id: c.id,
      externalCompanyId: c.externalCompanyId,
      tokenPreview: c.tokenPreview,
      authMode: c.authMode,
      status: c.status,
      lastSyncAt: c.lastSyncAt,
      lastSyncStatus: c.lastSyncStatus,
      createdAt: c.createdAt,
    }));
    return NextResponse.json({ connections: summaries });
  }

  const connection = await getUserConnectionById(userId, connectionId);
  if (!connection) {
    return NextResponse.json(
      { error: "Connection introuvable ou non autorisée." },
      { status: 404 }
    );
  }
  if (connection.provider !== "pennylane") {
    return NextResponse.json(
      { error: "Cette vue debug est réservée aux connections Pennylane." },
      { status: 400 }
    );
  }

  // Lecture des entités persistées en Firestore (via l'admin SDK).
  const [ledgerAccounts, accountingEntries] = await Promise.all([
    listLedgerAccountsByConnection(userId, connectionId),
    listAccountingEntriesByConnection(userId, connectionId),
  ]);

  const report = buildPennylaneClassReport({
    connectionId,
    externalCompanyId: connection.externalCompanyId,
    ledgerAccounts,
    accountingEntries,
  });

  return NextResponse.json({
    report,
    connection: {
      id: connection.id,
      externalCompanyId: connection.externalCompanyId,
      tokenPreview: connection.tokenPreview,
      authMode: connection.authMode,
      status: connection.status,
      lastSyncAt: connection.lastSyncAt,
      lastSyncStatus: connection.lastSyncStatus,
    },
  });
}
