// GET /api/integrations/connections
// Liste les connections actives de l'utilisateur courant. Renvoie un DTO sans tokens
// chiffrés (juste un aperçu masqué + métadonnées) pour affichage côté front.

import { NextResponse, type NextRequest } from "next/server";
import { listUserConnections } from "@/services/integrations/storage/connectionStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";

export const runtime = "nodejs";

export type ConnectionDto = {
  id: string;
  provider: string;
  providerSub: string | null;
  status: string;
  authMode: string;
  tokenPreview: string;
  externalCompanyId: string;
  // Odoo-only champs (en clair, non secrets) — utiles pour identifier visuellement
  // sur quelle instance et avec quel utilisateur la connection a été établie.
  odooInstanceUrl: string | null;
  odooLogin: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  createdAt: string;
};

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

  try {
    const connections = await listUserConnections(userId);
    const dtos: ConnectionDto[] = connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      providerSub: c.providerSub,
      status: c.status,
      authMode: c.authMode,
      tokenPreview: c.tokenPreview,
      externalCompanyId: c.externalCompanyId,
      odooInstanceUrl: c.odooInstanceUrl ?? null,
      odooLogin: c.odooLogin ?? null,
      lastSyncAt: c.lastSyncAt,
      lastSyncStatus: c.lastSyncStatus,
      lastSyncError: c.lastSyncError,
      createdAt: c.createdAt,
    }));
    // Trier les plus récentes en premier.
    dtos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ connections: dtos }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Échec de la lecture des connections.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
